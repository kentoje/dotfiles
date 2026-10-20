"""Keep herdr's saved SSH machines in sync with mvm: add on `mvm new`, remove when a machine ends.

Uses herdr's own CLI (`herdr machine add|list --json|remove`), never its state files. Every
function degrades to a warning: herdr being absent or failing must not block a machine command.
"""

import json
import shutil
import subprocess

from mvm_cli.mvm_errors import log_mvm
from mvm_cli.mvm_settings import HERDR_LABEL_PREFIX, SSH_HOST_SUFFIX
from mvm_cli.machine_registry import ssh_host_for_machine

# `machine add` prepares the remote herdr server over ssh (about 8s when versions match).
HERDR_ADD_TIMEOUT_SECONDS = 180


def herdr_label_for_machine(name):
    """Sidebar label: `aws-<name>`."""
    return f"{HERDR_LABEL_PREFIX}{name}"


def run_herdr_machine_command(args, timeout=60):
    """Run `herdr machine <args>` without a terminal; None when herdr is not installed."""
    herdr = shutil.which("herdr")
    if not herdr:
        return None
    return subprocess.run(
        [herdr, "machine", *args], capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL
    )


def list_herdr_mvm_profiles():
    """herdr's saved machines whose ssh target is `*.mvm`, as dicts (id, label, target, ...).

    Returns None (not []) when herdr is missing or the listing failed, so callers never treat an
    unknown list as "no profiles".
    """
    try:
        result = run_herdr_machine_command(["list", "--json"])
    except subprocess.TimeoutExpired:
        return None
    if result is None or result.returncode != 0:
        return None
    try:
        profiles = json.loads(result.stdout or "[]")
    except ValueError:
        return None
    return [p for p in profiles if str(p.get("target", "")).endswith(SSH_HOST_SUFFIX)]


def add_machine_to_herdr(name):
    """`herdr machine add <name>.mvm --label aws-<name>`. Returns True when herdr saved it."""
    try:
        result = run_herdr_machine_command(
            ["add", ssh_host_for_machine(name), "--label", herdr_label_for_machine(name)],
            timeout=HERDR_ADD_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        log_mvm(f"{name}: herdr machine add timed out; add it by hand: herdr machine add {ssh_host_for_machine(name)}")
        return False
    if result is None:
        return False
    if result.returncode != 0:
        log_mvm(f"{name}: herdr machine add failed: {(result.stderr or result.stdout).strip()[-300:]}")
        return False
    return True


def remove_machine_from_herdr(name, profiles=None):
    """Remove every herdr profile whose target is `<name>.mvm`. Returns the number removed."""
    if profiles is None:
        profiles = list_herdr_mvm_profiles() or []
    target = ssh_host_for_machine(name)
    removed = 0
    for profile in profiles:
        if profile.get("target") != target:
            continue
        try:
            result = run_herdr_machine_command(["remove", profile["id"]])
        except subprocess.TimeoutExpired:
            result = None
        if result is not None and result.returncode == 0:
            removed += 1
        else:
            log_mvm(f"{name}: could not remove herdr machine {profile.get('label')} ({profile['id']})")
    return removed
