"""Carries the person's laptop approval of the organization's Claude Code managed settings to a machine.

Claude Code 2.1.327 and later stop at a "Managed settings require approval" dialog when the organization's
managed (remote) settings list plugin mods, e.g. `extraKnownMarketplaces["aircall"].listedMods: code from
your organization will run`. Approving writes, in `~/.claude/`, the server-signed settings it approved
(`remote-settings.json` with its `.signature.json` and `.synced-at`) and a consent token
(`remote-settings-helper-consent`). A machine with only the token still asks (verified on image 34.0); with
all four files from the laptop, claude starts without the dialog.
These are the person's own approval of exactly those signed settings: when the organization changes them,
the fetched settings no longer match and the dialog comes back on the machine until the person approves
again (on the laptop, then the next `mvm agent`, `mvm new` or `mvm attach` carries it over).
Never compute or edit these files: only copy what the person's own approval wrote.
"""

import base64
import json
import re
import shlex
import subprocess
from pathlib import Path

from mvm_cli.machine_registry import ssh_host_for_machine
from mvm_cli.mvm_errors import log_mvm

LAPTOP_CLAUDE_DIR = Path.home() / ".claude"
CLAUDE_SETTINGS_CONSENT_FILE = "remote-settings-helper-consent"
# Every file Claude writes when the person approves the organization's managed settings.
CLAUDE_MANAGED_SETTINGS_APPROVAL_FILES = (
    "remote-settings.json",
    "remote-settings.json.signature.json",
    "remote-settings.json.synced-at",
    CLAUDE_SETTINGS_CONSENT_FILE,
)
CLAUDE_SETTINGS_CONSENT_TOKEN = re.compile(r"[0-9a-f]{64}")


def read_laptop_claude_managed_settings_approval(claude_dir=LAPTOP_CLAUDE_DIR):
    """{file name: bytes} of the laptop's managed-settings approval; None unless all files are there and sane."""
    claude_dir = Path(claude_dir)
    try:
        files = {name: (claude_dir / name).read_bytes() for name in CLAUDE_MANAGED_SETTINGS_APPROVAL_FILES}
        json.loads(files["remote-settings.json"])
        json.loads(files["remote-settings.json.signature.json"])
        token = files[CLAUDE_SETTINGS_CONSENT_FILE].decode().strip()
    except (OSError, ValueError):
        return None
    return files if CLAUDE_SETTINGS_CONSENT_TOKEN.fullmatch(token) else None


def render_claude_managed_settings_approval_script(files):
    """Bash that writes FILES into the machine's ~/.claude (mode 600, replacing stale ones); empty for None."""
    if not files:
        return ""
    lines = ["mkdir -p ~/.claude"]
    for name, content in files.items():
        encoded = base64.b64encode(content).decode()
        target = f"~/.claude/{shlex.quote(name)}"
        lines.append(f"printf '%s' {shlex.quote(encoded)} | base64 -d > {target} && chmod 600 {target}")
    return " && ".join(lines)


def copy_claude_managed_settings_approval_to_machine(name):
    """Over ssh: give NAME the laptop's managed-settings approval. True when written; logs why not."""
    script = render_claude_managed_settings_approval_script(read_laptop_claude_managed_settings_approval())
    if not script:
        log_mvm(
            f"{name}: this laptop has not approved the organization's Claude managed settings; claude on the"
            " machine may ask (approve once in claude on the laptop, then run `mvm attach` again)"
        )
        return False
    try:
        result = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", ssh_host_for_machine(name), script],
            capture_output=True,
            text=True,
            timeout=60,
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired:
        result = None
    if result is None or result.returncode != 0:
        log_mvm(f"{name}: Claude managed-settings approval not copied; claude on the machine may ask to approve")
        return False
    return True
