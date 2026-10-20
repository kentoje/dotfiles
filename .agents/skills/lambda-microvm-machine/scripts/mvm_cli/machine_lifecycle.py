"""Machine lifecycle commands: `mvm new` (start + herdr add), `mvm rm` (terminate + herdr remove), `mvm ls`."""

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
from mvm_cli.machine_registry import (
    find_machine_record,
    forget_machine_host_key,
    generate_machine_name,
    list_machine_records,
    machine_creation_lock,
    machine_expires_at,
    new_machine_record,
    save_machine_record,
    ssh_host_for_machine,
    validate_machine_name,
)
from mvm_cli.machine_port_forwarding import (
    dev_server_ports_in_use,
    list_machine_forwarded_ports,
    pick_dev_server_port,
)
from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import (
    EGRESS_CONNECTORS,
    INGRESS_CONNECTORS,
    MAX_LIFETIME_SECONDS,
    PNPM_STORE_CACHE_PREFIX,
    REGION,
)
from mvm_cli.ssh_access import read_mvm_ssh_public_key, wait_for_ssh


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


def build_mvm_run_payload(name, ssh_public_key, stack_outputs, dev_server_port):
    """The run hook payload (MvmRunPayload) that /opt/mvm/bin/mvm-on-run reads inside the MicroVM.

    pnpmStoreCacheUri is where mvm-pnpm-store-cache keeps pnpm store snapshots (S3 pnpm store cache).
    devServerPort becomes PORT in cc-ext's .env.local (mvm-bootstrap-workspace).
    """
    return {
        "name": name,
        "sshAuthorizedKeys": [ssh_public_key],
        "envSecretId": stack_outputs["EnvSecretArn"],
        "envSecretRegion": REGION,
        "bootstrapWorkspace": True,
        "pnpmStoreCacheUri": f"s3://{stack_outputs['ArtifactBucketName']}/{PNPM_STORE_CACHE_PREFIX}",
        "devServerPort": dev_server_port,
    }


def reserve_and_start_microvm(requested_name, ssh_public_key, stack_outputs, ttl_seconds):
    """Choose the machine's name and dev server port, start its MicroVM, save its record; returns the record.

    Hold machine_creation_lock() around it: the name and port are only reserved once the record is saved.
    """
    taken_names = {record["name"] for record in list_machine_records()}
    name = requested_name or generate_machine_name(taken_names)
    if name in taken_names:
        raise MvmError(f"{name} already exists (see `mvm ls`, or `mvm rm {name}`)")
    dev_server_port = pick_dev_server_port(dev_server_ports_in_use())
    payload = build_mvm_run_payload(name, ssh_public_key, stack_outputs, dev_server_port)
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
            str(ttl_seconds),
            "--logging",
            json.dumps(
                {"cloudWatch": {"logGroup": stack_outputs["ImageLogGroupName"], "logStream": f"machine-{name}"}}
            ),
        ]
    )
    record = new_machine_record(name, result["microvmId"], result.get("endpoint"), ttl_seconds, dev_server_port)
    save_machine_record(record)
    return record


def cmd_new(args):
    """Start a machine from the latest image, wait for ssh, add it to herdr as `aws-<name>`."""
    reexec_under_aws_vault()
    if args.name:
        validate_machine_name(args.name)
    ttl_seconds = parse_duration_seconds(args.ttl)
    if not 60 <= ttl_seconds <= MAX_LIFETIME_SECONDS:
        raise MvmError(f"--ttl must be between 1m and {MAX_LIFETIME_SECONDS // 3600}h")
    prune_ended_machines(list_image_microvms())
    outputs = read_stack_outputs()
    ssh_public_key = read_mvm_ssh_public_key()
    started = time.monotonic()
    with machine_creation_lock():
        record = reserve_and_start_microvm(args.name, ssh_public_key, outputs, ttl_seconds)
    name, dev_server_port = record["name"], record["devServerPort"]
    forget_machine_host_key(name)
    log_mvm(f"{name}: starting {record['microvmId']}")

    info = wait_for_microvm_state(record["microvmId"], {"RUNNING"})
    record["endpoint"] = info.get("endpoint") or record["endpoint"]
    save_machine_record(record)
    wait_for_ssh(name)
    log_mvm(f"{name}: ssh ready in {int(time.monotonic() - started)}s; workspace setup continues (mvm logs {name} -f)")
    in_herdr = add_machine_to_herdr(name)
    if in_herdr:
        log_mvm(f"{name}: added to herdr as {herdr_label_for_machine(name)}")

    summary = {
        "name": name,
        "ssh": f"ssh {ssh_host_for_machine(name)}",
        "herdr": herdr_label_for_machine(name) if in_herdr else None,
        "expiresAt": machine_expires_at(record).isoformat(),
        "devServerPort": dev_server_port,
        "microvmId": record["microvmId"],
    }
    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        expires = machine_expires_at(record).astimezone().strftime("%H:%M")
        print(f"{name}  {summary['ssh']}  dev server port {dev_server_port}  expires {expires}")


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
    """Terminate machines (their hook pushes unpushed work first), then drop them from herdr and local state."""
    reexec_under_aws_vault()
    failed = []
    herdr_profiles = list_herdr_mvm_profiles()
    for name in args.names:
        record = find_machine_record(name)
        if record is None:
            log_mvm(f"{name}: unknown machine (see `mvm ls`)")
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
        log_mvm(f"{name}: terminating {record['microvmId']}; removed from herdr")
    if failed:
        raise MvmError(f"rm failed for: {', '.join(failed)}")


def cmd_ls(args):
    """List live machines: name, state, image version, age, time left, herdr label, forwarded ports."""
    reexec_under_aws_vault()
    listing = list_image_microvms()
    prune_ended_machines(listing)
    names_by_id = {record["microvmId"]: record for record in list_machine_records()}
    herdr_labels = {p["target"]: p.get("label") for p in (list_herdr_mvm_profiles() or [])}
    now = dt.datetime.now(dt.timezone.utc)
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
                "herdr": herdr_labels.get(ssh_host_for_machine(name)) if name else None,
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
    table = [("NAME", "STATE", "IMAGE", "AGE", "LEFT", "HERDR", "PORTS")]
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
                row["herdr"] or "-",
                ",".join(map(str, row["forwardedPorts"])) or "-",
            )
        )
    widths = [max(len(r[i]) for r in table) for i in range(len(table[0]))]
    for r in table:
        print("  ".join(cell.ljust(width) for cell, width in zip(r, widths)).rstrip())
