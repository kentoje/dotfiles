"""Machine lifecycle commands: `mvm new` (start + herdr add + tuios session), `mvm attach`, `mvm rm` (terminate + remove both), `mvm ls`.

Every laptop set up with `mvm setup` shares the machines: names live in the shared machine
registry, and every registered laptop key reaches every machine (laptop_ssh_keys).
"""

import datetime as dt
import json
import subprocess
import time

from mvm_cli.aws_cli_access import (
    ENDED_MICROVM_STATES,
    AwsCliError,
    get_microvm,
    image_arn,
    list_image_microvms,
    read_stack_outputs,
    reexec_under_aws_vault,
    run_aws_cli,
    terminate_microvm,
)
from mvm_cli.ended_machine_cleanup import forget_ended_machine, prune_ended_machines
from mvm_cli.herdr_machine_sync import (
    add_machine_to_herdr,
    herdr_label_for_machine,
    list_herdr_mvm_profiles,
)
from mvm_cli.laptop_ssh_keys import register_laptop_ssh_key
from mvm_cli.machine_port_forwarding import (
    dev_server_ports_in_use,
    list_machine_forwarded_ports,
    pick_dev_server_port,
)
from mvm_cli.machine_registry import (
    delete_machine_record,
    forget_machine_host_key,
    generate_machine_name,
    is_machine_reservation,
    list_machine_records,
    machine_expires_at,
    new_machine_record,
    ssh_host_for_machine,
    validate_machine_name,
)
from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import (
    EGRESS_CONNECTORS,
    INGRESS_CONNECTORS,
    LAPTOP_SSH_KEYS_PREFIX,
    MAX_LIFETIME_SECONDS,
    PNPM_STORE_CACHE_PREFIX,
    REGION,
)
from mvm_cli.shared_machine_registry import (
    MachineNameTaken,
    create_shared_machine_record,
    delete_shared_machine_record,
    refresh_machine_registry_mirror,
    replace_shared_machine_record,
    resolve_machine_record,
    shared_machine_creation_lock,
)
from mvm_cli.ssh_access import wait_for_ssh
from mvm_cli.tuios_machine_session import (
    list_tuios_machine_sessions,
    open_tuios_session_for_machine,
    tuios_session_for_machine,
)


def parse_duration_seconds(text):
    """`8h`, `90m`, `45s` or plain seconds -> seconds."""
    units = {"s": 1, "m": 60, "h": 3600}
    try:
        if text and text[-1] in units:
            return int(float(text[:-1]) * units[text[-1]])
        return int(text)
    except ValueError:
        raise MvmError(f"invalid duration {text!r}: use e.g. 8h, 90m or 45s") from None


def format_duration_short(seconds):
    """3725 -> `1h02m`, 300 -> `5m`; negative counts as zero."""
    seconds = max(0, int(seconds))
    hours, minutes = seconds // 3600, (seconds % 3600) // 60
    return f"{hours}h{minutes:02d}m" if hours else f"{minutes}m"


def wait_for_microvm_state(microvm_id, wanted, timeout=600):
    started = time.monotonic()
    while time.monotonic() - started < timeout:
        info = get_microvm(microvm_id)
        state = info.get("state")
        if state in wanted:
            return info
        if state in ENDED_MICROVM_STATES:
            raise MvmError(f"{microvm_id} is {state}: {info.get('stateReason')}")
        time.sleep(3)
    raise MvmError(f"{microvm_id} not {'/'.join(sorted(wanted))} after {timeout}s")


def build_mvm_run_payload(name, stack_outputs, dev_server_port):
    """The run hook payload (MvmRunPayload) that /opt/mvm/bin/mvm-on-run reads inside the MicroVM.

    sshKeysUri: the registered laptop keys, which mvm-authorized-keys reads at every ssh login.
    pnpmStoreCacheUri is where mvm-pnpm-store-cache keeps pnpm store snapshots (S3 pnpm store cache).
    devServerPort becomes PORT in cc-ext's .env.local (mvm-bootstrap-workspace).
    """
    bucket = stack_outputs["ArtifactBucketName"]
    return {
        "name": name,
        "sshKeysUri": f"s3://{bucket}/{LAPTOP_SSH_KEYS_PREFIX}",
        "envSecretId": stack_outputs["EnvSecretArn"],
        "envSecretRegion": REGION,
        "bootstrapWorkspace": True,
        "pnpmStoreCacheUri": f"s3://{bucket}/{PNPM_STORE_CACHE_PREFIX}",
        "devServerPort": dev_server_port,
    }


def reserve_machine_name_and_port(requested_name, ttl_seconds):
    """Reserve a name and a devServerPort that no laptop's machine has; returns (record, etag) of the shared record.

    Runs under the cross-laptop creation lock, on a freshly refreshed mirror. The record is a
    reservation (no microvmId) until start_reserved_microvm fills it in.
    """
    with shared_machine_creation_lock():
        refresh_machine_registry_mirror()
        taken_names = {record["name"] for record in list_machine_records()}
        name = requested_name or generate_machine_name(taken_names)
        if name in taken_names:
            raise MachineNameTaken(
                f"{name} already exists (see `mvm ls`, or `mvm rm {name}`)"
            )
        record = new_machine_record(
            name, ttl_seconds, pick_dev_server_port(dev_server_ports_in_use())
        )
        etag = create_shared_machine_record(record)
    return record, etag


def start_reserved_microvm(record, etag, stack_outputs):
    """Start the MicroVM for a reservation and record its id; returns (record, etag).

    When run-microvm fails, the reservation is dropped so the name and port are free again.
    """
    name = record["name"]
    payload = build_mvm_run_payload(name, stack_outputs, record["devServerPort"])
    try:
        result = run_aws_cli(
            [
                "lambda-microvms",
                "run-microvm",
                "--image-identifier",
                image_arn(),
                "--execution-role-arn",
                stack_outputs["ExecutionRoleArn"],
                "--ingress-network-connectors",
                *INGRESS_CONNECTORS,
                "--egress-network-connectors",
                *EGRESS_CONNECTORS,
                "--run-hook-payload",
                json.dumps(payload),
                "--maximum-duration-in-seconds",
                str(record["ttlSeconds"]),
                "--logging",
                json.dumps(
                    {
                        "cloudWatch": {
                            "logGroup": stack_outputs["ImageLogGroupName"],
                            "logStream": f"machine-{name}",
                        }
                    }
                ),
            ]
        )
    except BaseException:
        try:
            delete_shared_machine_record(name, etag)
            delete_machine_record(name)
        except Exception as cleanup_error:
            log_mvm(
                f"{name}: could not drop the name reservation, `mvm ls` drops it later: {cleanup_error}"
            )
        raise
    record = {
        **record,
        "microvmId": result["microvmId"],
        "endpoint": result.get("endpoint"),
    }
    return record, replace_shared_machine_record(record, etag)


def print_machine_summary(record, in_herdr, tuios_session, as_json):
    """The result of `mvm new` and `mvm attach`: one line, or JSON with --json."""
    name = record["name"]
    summary = {
        "name": name,
        "ssh": f"ssh {ssh_host_for_machine(name)}",
        "herdr": herdr_label_for_machine(name) if in_herdr else None,
        "tuios": tuios_session,
        "expiresAt": machine_expires_at(record).isoformat(),
        "devServerPort": record.get("devServerPort"),
        "createdOn": record.get("createdOn"),
        "microvmId": record["microvmId"],
    }
    if as_json:
        print(json.dumps(summary, indent=2))
    else:
        expires = machine_expires_at(record).astimezone().strftime("%H:%M")
        print(
            f"{name}  {summary['ssh']}  dev server port {summary['devServerPort']}  expires {expires}"
        )


def cmd_new(args):
    """Start a machine from the latest image, wait for ssh, add it to herdr and open its tuios session, both `aws-<name>`."""
    reexec_under_aws_vault()
    if args.name:
        validate_machine_name(args.name)
    ttl_seconds = parse_duration_seconds(args.ttl)
    if not 60 <= ttl_seconds <= MAX_LIFETIME_SECONDS:
        raise MvmError(f"--ttl must be between 1m and {MAX_LIFETIME_SECONDS // 3600}h")
    prune_ended_machines(list_image_microvms())
    outputs = read_stack_outputs()
    # Machines accept only registered keys: without this, a laptop set up before the keys were
    # shared could not ssh into the machine it starts.
    register_laptop_ssh_key()
    started = time.monotonic()
    record, etag = reserve_machine_name_and_port(args.name, ttl_seconds)
    record, etag = start_reserved_microvm(record, etag, outputs)
    name = record["name"]
    forget_machine_host_key(name)
    log_mvm(f"{name}: starting {record['microvmId']}")

    info = wait_for_microvm_state(record["microvmId"], {"RUNNING"})
    endpoint = info.get("endpoint") or record["endpoint"]
    if endpoint != record["endpoint"]:
        record = {**record, "endpoint": endpoint}
        etag = replace_shared_machine_record(record, etag)
    wait_for_ssh(name)
    log_mvm(f"{name}: ssh ready in {int(time.monotonic() - started)}s; workspace setup continues (mvm logs {name} -f)")
    in_herdr = add_machine_to_herdr(name)
    if in_herdr:
        log_mvm(f"{name}: added to herdr as {herdr_label_for_machine(name)}")
    tuios_session = open_tuios_session_for_machine(name)
    print_machine_summary(record, in_herdr, tuios_session, args.json)


def require_running_machine_record(name):
    """NAME's fresh shared record, once AWS says its MicroVM is RUNNING. Raises MvmError otherwise."""
    record = resolve_machine_record(name, fresh=True)
    if record is None:
        raise MvmError(f"unknown machine {name!r} (see `mvm ls`)")
    if is_machine_reservation(record):
        raise MvmError(
            f"{name} is still starting on {record.get('createdOn') or 'another laptop'}; retry in a minute"
        )
    state = get_microvm(record["microvmId"]).get("state")
    if state in ENDED_MICROVM_STATES:
        forget_ended_machine(name, record["microvmId"])
        raise MvmError(f"{name} has ended ({state})")
    if state != "RUNNING":
        raise MvmError(f"{name} is {state}, not RUNNING")
    return record


def cmd_attach(args):
    """Use a machine started on another laptop from this one: check ssh, add it to this laptop's herdr and tuios."""
    reexec_under_aws_vault()
    validate_machine_name(args.name)
    record = require_running_machine_record(args.name)
    name = record["name"]
    register_laptop_ssh_key()
    forget_machine_host_key(name)
    wait_for_ssh(name)
    target = ssh_host_for_machine(name)
    in_herdr = any(
        profile.get("target") == target for profile in list_herdr_mvm_profiles() or []
    )
    if not in_herdr:
        in_herdr = add_machine_to_herdr(name)
        if in_herdr:
            log_mvm(f"{name}: added to herdr as {herdr_label_for_machine(name)}")
    tuios_session = open_tuios_session_for_machine(name)
    print_machine_summary(record, in_herdr, tuios_session, args.json)


def write_skip_wip_marker(name):
    """Make the machine's suspend/terminate hooks skip the wip/mvm/* push (`mvm rm --discard`)."""
    try:
        written = (
            subprocess.run(
                [
                    "ssh",
                    "-o",
                    "BatchMode=yes",
                    "-o",
                    "ConnectTimeout=15",
                    ssh_host_for_machine(name),
                    "mkdir -p ~/.local/state/mvm && touch ~/.local/state/mvm/skip-wip-save",
                ],
                capture_output=True,
                timeout=60,
            ).returncode
            == 0
        )
    except subprocess.TimeoutExpired:
        written = False
    if not written:
        log_mvm(f"{name}: WARNING could not reach the machine; its wip/mvm/* branches may still be pushed")


def cmd_rm(args):
    """Terminate machines (their hook pushes unpushed work first), then drop their herdr entry, tuios session and local state."""
    reexec_under_aws_vault()
    failed = []
    herdr_profiles = list_herdr_mvm_profiles()
    for name in args.names:
        record = resolve_machine_record(name, fresh=True)
        if record is None:
            log_mvm(f"{name}: unknown machine (see `mvm ls`)")
            failed.append(name)
            continue
        if is_machine_reservation(record):
            log_mvm(
                f"{name}: still starting on {record.get('createdOn') or 'another laptop'}; retry in a minute"
            )
            failed.append(name)
            continue
        if args.discard:
            write_skip_wip_marker(name)
        try:
            terminate_microvm(record["microvmId"])
        except AwsCliError as error:
            if not error.is_resource_not_found():
                log_mvm(f"{name}: terminate failed, kept in herdr and local state: {error}")
                failed.append(name)
                continue
        forget_ended_machine(name, record["microvmId"], herdr_profiles or [])
        log_mvm(f"{name}: terminating {record['microvmId']}; removed from herdr and tuios")
    if failed:
        raise MvmError(f"rm failed for: {', '.join(failed)}")


def cmd_ls(args):
    """List every laptop's live machines: name, state, image version, age, time left, laptop, herdr label, tuios session, ports."""
    reexec_under_aws_vault()
    listing = list_image_microvms()
    prune_ended_machines(listing)
    names_by_id = {
        record["microvmId"]: record
        for record in list_machine_records()
        if record.get("microvmId")
    }
    herdr_labels = {
        p["target"]: p.get("label") for p in (list_herdr_mvm_profiles() or [])
    }
    tuios_sessions = set(list_tuios_machine_sessions() or [])
    now =dt.datetime.now(dt.timezone.utc)
    rows = []
    for microvm in listing:
        if microvm.get("state") in ENDED_MICROVM_STATES:
            continue
        record = names_by_id.get(microvm["microvmId"])
        name = record["name"] if record else None
        # AWS answers in the laptop's offset; --json output is all UTC, like expiresAt.
        started = (
            dt.datetime.fromisoformat(str(microvm["startedAt"])).astimezone(dt.timezone.utc)
            if microvm.get("startedAt")
            else None
        )
        rows.append(
            {
                "name": name,
                "state": microvm.get("state"),
                "imageVersion": str(microvm.get("imageVersion", "")),
                "startedAt": started.isoformat() if started else None,
                "expiresAt": machine_expires_at(record).isoformat() if record else None,
                "createdOn": record.get("createdOn") if record else None,
                "herdr": herdr_labels.get(ssh_host_for_machine(name)) if name else None,
                "tuios": tuios_session_for_machine(name)
                if name and tuios_session_for_machine(name) in tuios_sessions
                else None,
                "devServerPort": record.get("devServerPort") if record else None,
                "forwardedPorts": list_machine_forwarded_ports(name) if name else [],
                "microvmId": microvm["microvmId"],
            }
        )
    if args.json:
        print(json.dumps(rows, indent=2))
        return
    if not rows:
        print("no machines (start one with: mvm new)")
        return
    table = [("NAME", "STATE", "IMAGE", "AGE", "LEFT", "LAPTOP", "HERDR", "TUIOS", "PORTS")]
    for row in rows:
        age = (
            format_duration_short((now - dt.datetime.fromisoformat(row["startedAt"])).total_seconds())
            if row["startedAt"]
            else "-"
        )
        left = (
            format_duration_short((dt.datetime.fromisoformat(row["expiresAt"]) - now).total_seconds())
            if row["expiresAt"]
            else "-"
        )
        table.append(
            (
                row["name"] or f"? {row['microvmId']}",
                row["state"] or "?",
                row["imageVersion"],
                age,
                left,
                row["createdOn"] or "-",
                row["herdr"] or "-",
                row["tuios"] or "-",
                ",".join(map(str, row["forwardedPorts"])) or "-",
            )
        )
    widths = [max(len(r[i]) for r in table) for i in range(len(table[0]))]
    for r in table:
        print("  ".join(cell.ljust(width) for cell, width in zip(r, widths)).rstrip())
