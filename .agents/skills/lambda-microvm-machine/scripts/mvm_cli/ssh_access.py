"""SSH access to mvm machines: key, ~/.ssh/config block, the `mvm proxy` ProxyCommand, `mvm ssh`.

`ssh <name>.mvm` runs `mvm proxy <name>.mvm`, which mints a 60-minute endpoint token and runs
websocat to the MicroVM's WebSocket-to-sshd bridge. An open session outlives the token.
"""

import json
import os
import shutil
import signal
import subprocess
import sys
import time

from mvm_cli.aws_cli_access import AwsCliError, microvm_has_ended, run_aws_cli
from mvm_cli.ended_machine_cleanup import forget_ended_machine
from mvm_cli.herdr_machine_sync import remove_machine_from_herdr
from mvm_cli.machine_registry import (
    find_machine_record,
    load_machine_record,
    machine_name_from_ssh_host,
    ssh_host_for_machine,
)
from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import (
    KNOWN_HOSTS,
    MVM_ENTRY_SCRIPT,
    OWNER,
    SSH_BRIDGE_PORT,
    SSH_CONFIG,
    SSH_HOST_SUFFIX,
    SSH_KEY,
)

SSH_CONFIG_BEGIN = "# BEGIN mvm (managed by `mvm setup`; do not edit between markers)"
SSH_CONFIG_END = "# END mvm"
# Token minting goes through aws-vault in the proxy; bound a stuck SSO login.
PROXY_AWS_TIMEOUT_SECONDS = 30


def render_ssh_config_block():
    """The `Host *.mvm` block `mvm setup` writes into ~/.ssh/config."""
    return (
        "\n".join(
            [
                SSH_CONFIG_BEGIN,
                f"Host *{SSH_HOST_SUFFIX}",
                "    User dev",
                f"    IdentityFile {SSH_KEY}",
                "    IdentitiesOnly yes",
                f"    ProxyCommand {MVM_ENTRY_SCRIPT} proxy %h",
                f"    UserKnownHostsFile {KNOWN_HOSTS}",
                "    StrictHostKeyChecking accept-new",
                "    ServerAliveInterval 30",
                "    ServerAliveCountMax 4",
                "    LogLevel ERROR",
                SSH_CONFIG_END,
            ]
        )
        + "\n"
    )


def write_ssh_config_block():
    """Insert or update the managed `Host *.mvm` block; the rest of ~/.ssh/config is untouched."""
    current = SSH_CONFIG.read_text() if SSH_CONFIG.exists() else ""
    block = render_ssh_config_block()
    if SSH_CONFIG_BEGIN in current:
        start = current.index(SSH_CONFIG_BEGIN)
        end = current.index(SSH_CONFIG_END, start) + len(SSH_CONFIG_END)
        updated = current[:start] + block.rstrip("\n") + current[end:]
    else:
        updated = current.rstrip("\n") + ("\n\n" if current else "") + block
    if updated != current:
        SSH_CONFIG.write_text(updated)
        os.chmod(SSH_CONFIG, 0o600)
        log_mvm(f"updated {SSH_CONFIG}")


def ensure_mvm_ssh_key():
    """Create ~/.ssh/id_ed25519_mvm (no passphrase) once; its public key goes to every machine."""
    if SSH_KEY.exists():
        return
    subprocess.run(
        ["ssh-keygen", "-t", "ed25519", "-N", "", "-C", f"mvm-{OWNER}", "-f", str(SSH_KEY)],
        check=True,
        capture_output=True,
    )
    log_mvm(f"created {SSH_KEY}")


def read_mvm_ssh_public_key():
    ensure_mvm_ssh_key()
    return SSH_KEY.with_suffix(".pub").read_text().strip()


def wait_for_ssh(name, attempts=20):
    """Retry `ssh <name>.mvm true` until sshd answers on a fresh machine."""
    result = None
    for _ in range(attempts):
        result = subprocess.run(
            ["ssh", "-o", "ConnectTimeout=15", "-o", "BatchMode=yes", ssh_host_for_machine(name), "true"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return
        time.sleep(3)
    raise MvmError(f"{name}: ssh did not answer: {result.stderr.strip() if result else ''}")


def create_ssh_endpoint_token(microvm_id):
    """A 60-minute endpoint auth token limited to the ssh bridge port."""
    data = run_aws_cli(
        [
            "lambda-microvms",
            "create-microvm-auth-token",
            "--microvm-identifier",
            microvm_id,
            "--expiration-in-minutes",
            "60",
            "--allowed-ports",
            json.dumps([{"port": SSH_BRIDGE_PORT}]),
        ],
        timeout=PROXY_AWS_TIMEOUT_SECONDS,
    )
    return data["authToken"]["X-aws-proxy-auth"]


def cmd_proxy(args):
    """ProxyCommand for `Host *.mvm`. Cleans up herdr and local state when the machine has ended."""
    name = machine_name_from_ssh_host(args.host)
    record = find_machine_record(name)
    if record is None:
        # A herdr entry without a local record can never connect: drop it so herdr stops retrying.
        remove_machine_from_herdr(name)
        raise MvmError(f"proxy: unknown machine {name!r} (see `mvm ls`)")
    try:
        token = create_ssh_endpoint_token(record["microvmId"])
    except AwsCliError as error:
        if microvm_has_ended(record["microvmId"], timeout=PROXY_AWS_TIMEOUT_SECONDS):
            raise forget_ended_machine_for_proxy(name, record["microvmId"]) from error
        raise
    websocat = shutil.which("websocat")
    if not websocat:
        raise MvmError("proxy: websocat is not installed (nix-darwin: websocat)")
    # `-H=value` form: a bare -H swallows the following arguments, URL included.
    exit_code = run_websocat_bridge(
        [
            websocat,
            "--binary",
            "--ping-interval",
            "30",
            f"-H=X-aws-proxy-auth: {token}",
            f"-H=X-aws-proxy-port: {SSH_BRIDGE_PORT}",
            f"wss://{record['endpoint']}/",
        ]
    )
    # AWS still mints tokens for a terminated MicroVM; its endpoint then answers 502 and websocat
    # fails. That failure is how a herdr reconnect to an expired machine gets it cleaned up.
    if exit_code > 0 and microvm_has_ended(record["microvmId"], timeout=PROXY_AWS_TIMEOUT_SECONDS):
        raise forget_ended_machine_for_proxy(name, record["microvmId"])
    sys.exit(exit_code if exit_code >= 0 else 128 - exit_code)


def forget_ended_machine_for_proxy(name, ended_microvm_id):
    """Forget NAME's ended MicroVM; return the MvmError the proxy exits with (herdr shows it)."""
    if forget_ended_machine(name, ended_microvm_id):
        return MvmError(f"proxy: {name} has ended; removed it from herdr and local state")
    # This proxy started before NAME was reused by `mvm new`; herdr's next reconnect reaches the new one.
    return MvmError(f"proxy: {name} was recreated since this connection started; reconnect to reach the new machine")


def run_websocat_bridge(websocat_argv):
    """Run websocat on ssh's stdin/stdout and return its exit code (negative: killed by a signal).

    A child, not an exec, so the proxy can check for an ended machine when websocat fails.
    ssh stops its ProxyCommand with SIGHUP: forward it (and TERM/INT) so websocat never outlives ssh.
    """
    child = subprocess.Popen(websocat_argv)
    for forwarded_signal in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(forwarded_signal, lambda signum, _frame: child.send_signal(signum))
    return child.wait()


def cmd_ssh(args):
    """`mvm ssh NAME [CMD...]`: same as `ssh NAME.mvm [CMD...]`."""
    load_machine_record(args.name)
    os.execvp("ssh", ["ssh", ssh_host_for_machine(args.name), *args.command])
