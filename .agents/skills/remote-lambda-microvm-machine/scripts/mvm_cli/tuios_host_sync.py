"""Keep tuios's hosts in sync with mvm: every live machine is a tuios host `aws-<name>`.

mvm owns one config.d file (TUIOS_MVM_HOSTS_FILE) and rebuilds it from the local machine records
on `mvm new` and whenever a machine is forgotten, so adding, removing and pruning are one idempotent
write. tuios drops a removed host at once, but a new host waits for `tuios config apply` from a
terminal outside tuios: that refusal inside a pane is tuios's guard, never routed around here.
Every function degrades to a warning: tuios being absent or failing must not block a machine command.
"""

import json
import os
import shutil
import subprocess

from mvm_cli.machine_registry import list_machine_records, ssh_host_for_machine
from mvm_cli.mvm_errors import log_mvm
from mvm_cli.mvm_settings import TUIOS_HOST_PREFIX, TUIOS_MVM_HOSTS_FILE, TUIOS_REMOTE_BINARY

# `hosts test --start` dials over `mvm proxy`, then starts the daemon on the machine.
TUIOS_START_TIMEOUT_SECONDS = 120

TUIOS_HOSTS_FILE_HEADER = """\
# Written by mvm (scripts/mvm_cli/tuios_host_sync.py) from ~/.local/state/mvm/machines.
# Rebuilt on every `mvm new`, `mvm rm` and prune: edits here are lost. Not tracked in git.
"""


def tuios_host_for_machine(name):
    """tuios host name: `aws-<name>`."""
    return f"{TUIOS_HOST_PREFIX}{name}"


def render_tuios_mvm_hosts(names):
    """The TOML text of the mvm hosts file: one [hosts.aws-<name>] table per machine NAME.

    Names are validated DNS labels (machine_registry), so they are valid TOML bare keys and need
    no escaping inside the quoted strings.
    """
    tables = [
        f'[hosts.{tuios_host_for_machine(name)}]\naddr = "{ssh_host_for_machine(name)}"\n'
        f'command = "{TUIOS_REMOTE_BINARY}"\n'
        for name in sorted(names)
    ]
    return "\n".join([TUIOS_HOSTS_FILE_HEADER, *tables])


def write_tuios_mvm_hosts():
    """Rebuild TUIOS_MVM_HOSTS_FILE from the local machine records. Returns True when it was written.

    Skipped when tuios is not installed. Atomic: the temp name does not end in `.toml`, so the
    daemon watching config.d never reads a half-written file.
    """
    if not shutil.which("tuios"):
        return False
    text = render_tuios_mvm_hosts(record["name"] for record in list_machine_records())
    try:
        if TUIOS_MVM_HOSTS_FILE.exists() and TUIOS_MVM_HOSTS_FILE.read_text() == text:
            return True
        TUIOS_MVM_HOSTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        temp_file = TUIOS_MVM_HOSTS_FILE.with_name(f".{TUIOS_MVM_HOSTS_FILE.name}.tmp")
        temp_file.write_text(text)
        os.replace(temp_file, TUIOS_MVM_HOSTS_FILE)
    except OSError as error:
        log_mvm(f"tuios hosts file not written ({TUIOS_MVM_HOSTS_FILE}): {error}")
        return False
    return True


def run_tuios_command(args, timeout=60):
    """Run `tuios <args>` without a terminal; None when tuios is not installed."""
    tuios = shutil.which("tuios")
    if not tuios:
        return None
    return subprocess.run([tuios, *args], capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)


def start_tuios_daemon_on_machine(name):
    """`tuios hosts test aws-<name> --start`: start the machine's tuios daemon over ssh. True when up."""
    host = tuios_host_for_machine(name)
    try:
        result = run_tuios_command(["hosts", "test", host, "--start", "--json"], timeout=TUIOS_START_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        log_mvm(f"{name}: tuios daemon start timed out; start it by hand: tuios hosts test {host} --start")
        return False
    if result is None:
        return False
    if result.returncode != 0:
        log_mvm(f"{name}: tuios daemon start failed: {(result.stderr or result.stdout).strip()[-300:]}")
        return False
    return True


def apply_or_explain_tuios_hosts(name):
    """Make the daemon open the new host's link, or say how. Returns True when the link is applied.

    Outside tuios, runs `tuios config apply`. Inside a tuios pane that command is refused by design,
    so this only logs the one step the person has to take.
    """
    host = tuios_host_for_machine(name)
    if os.environ.get("TUIOS_ENV"):
        log_mvm(f"{name}: tuios host {host} waits for you: run `tuios config apply` in a terminal outside tuios")
        return False
    try:
        result = run_tuios_command(["config", "apply"])
    except subprocess.TimeoutExpired:
        result = None
    if result is None or result.returncode != 0:
        log_mvm(f"{name}: tuios config apply failed; run it by hand to connect {host}")
        return False
    return True


def add_machine_to_tuios(name):
    """Make NAME a tuios host `aws-<name>`: rebuild the hosts file, start its daemon, apply the link.

    Returns the host name when the file holds it (applied or waiting for the person), else None.
    """
    if not write_tuios_mvm_hosts():
        return None
    host = tuios_host_for_machine(name)
    if start_tuios_daemon_on_machine(name) and apply_or_explain_tuios_hosts(name):
        log_mvm(f"{name}: added to tuios as {host}")
    return host


def list_tuios_hosts_by_addr():
    """{addr: host name} for the hosts the running tuios daemon holds; {} when tuios is unavailable."""
    try:
        result = run_tuios_command(["hosts", "--json"])
    except subprocess.TimeoutExpired:
        return {}
    if result is None or result.returncode != 0:
        return {}
    try:
        hosts = json.loads(result.stdout or "{}").get("hosts") or []
    except ValueError:
        return {}
    return {h["addr"]: h["host"] for h in hosts if h.get("addr") and h.get("host")}
