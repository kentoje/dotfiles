"""Give every live machine a local tuios session `aws-<name>`, in the space `mvm`, whose one window is ssh.

The window runs `ssh -t <name>.mvm tuios attach main --create --terminal-mode`: the machine's own tuios
session `main`, where agents run, so they outlive a dropped connection. The person watches and steers
them in that window; a local agent types into it with `tuios send-text`.
No tuios [hosts] link: a host gives every pane more, so it waits for `tuios config apply` outside tuios.
A session whose window runs ssh gives nothing new, so mvm opens it from anywhere, tuios panes included.
Every function degrades to a warning: tuios being absent or failing must not block a machine command.
"""

import json
import os
import shlex
import shutil
import subprocess

from mvm_cli.machine_registry import load_machine_record, ssh_host_for_machine
from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import (
    MACHINE_TUIOS_SESSION,
    TUIOS_MACHINE_SPACE,
    TUIOS_REMOTE_BINARY,
    TUIOS_SESSION_PREFIX,
)

# The machine's tuios config.d file hiding its client's rail and dock, which the laptop's window would draw
# inside its pane. A file, not set-option or set-config: a client that attaches later reads only the files.
MACHINE_TUIOS_CONFIG_FILE = "~/.config/tuios/config.d/mvm-laptop-window.toml"
MACHINE_TUIOS_CONFIG_TOML = """\
# Written by mvm: the laptop shows this machine in one tuios window, so no rail or dock here.
[appearance]
dockbar_position = "hidden"

[appearance.sidebar]
enabled = false
"""


def tuios_session_for_machine(name):
    """Local tuios session name: `aws-<name>`."""
    return f"{TUIOS_SESSION_PREFIX}{name}"


def call_tuios_verb(verb, params, timeout=30):
    """`tuios call VERB PARAMS` on the local daemon. Its JSON reply, or None when tuios is not installed.

    A refused verb replies {"error": {"code": ..., "message": ...}}; no answer (no daemon, a timeout)
    comes back in the same shape with the code `no_reply`.
    """
    tuios = shutil.which("tuios")
    if not tuios:
        return None
    try:
        result = subprocess.run(
            [tuios, "call", verb, json.dumps(params)],
            capture_output=True,
            text=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired:
        return {"error": {"code": "no_reply", "message": f"tuios {verb} timed out"}}
    try:
        reply = json.loads(result.stdout or "")
    except ValueError:
        reply = None
    if not isinstance(reply, dict):
        return {"error": {"code": "no_reply", "message": (result.stderr or result.stdout).strip()[-300:]}}
    return reply


def render_machine_tuios_session_script():
    """Shell run over ssh on the machine: hide its tuios rail and dock, then make sure its session `main` has a window.

    Creates `main` (and the daemon) when missing. A `main` whose last shell exited gets a new window: an empty
    session shows tuios's start screen, where typed text would drive the machine's window manager.
    Exits 0 once the config file is written.
    """
    return "\n".join(
        [
            f"T={TUIOS_REMOTE_BINARY}",
            "mkdir -p ~/.config/tuios/config.d",
            f"printf '%s' {shlex.quote(MACHINE_TUIOS_CONFIG_TOML)} > {MACHINE_TUIOS_CONFIG_FILE} || exit 1",
            f"$T new --detach {MACHINE_TUIOS_SESSION} >/dev/null 2>&1 ||"
            f" $T list-windows -s {MACHINE_TUIOS_SESSION} --json 2>/dev/null | grep -q '\"window_id\"' ||"
            f" $T new-window -s {MACHINE_TUIOS_SESSION} >/dev/null 2>&1",
            "exit 0",
        ]
    )


def start_machine_tuios_session(name):
    """Over ssh: hide the machine's tuios rail and dock, create its own session `main`. True when the config is written."""
    try:
        result = subprocess.run(
            [
                "ssh",
                "-o",
                "BatchMode=yes",
                "-o",
                "ConnectTimeout=15",
                ssh_host_for_machine(name),
                render_machine_tuios_session_script(),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired:
        result = None
    if result is None or result.returncode != 0:
        log_mvm(f"{name}: machine tuios not prepared; the window still attaches, with the machine's rail and dock")
        return False
    return True


def machine_ssh_window_command(name):
    """Argv of the session's window: ssh attaching the machine's session in terminal mode (keys go to its pane)."""
    return [
        shutil.which("ssh") or "ssh",
        "-t",
        ssh_host_for_machine(name),
        TUIOS_REMOTE_BINARY,
        "attach",
        MACHINE_TUIOS_SESSION,
        "--create",
        "--terminal-mode",
    ]


def open_tuios_session_for_machine(name):
    """Open the local tuios session `aws-<name>` with its ssh window. Returns the session name, or None.

    A session left by an earlier machine of the same name is replaced, unless this command runs in it.
    """
    if not shutil.which("tuios"):
        return None
    session = tuios_session_for_machine(name)
    start_machine_tuios_session(name)
    session_params = {"name": session, "space": TUIOS_MACHINE_SPACE, "window": False}
    error = (call_tuios_verb("new-session", session_params) or {}).get("error")
    if error and error.get("code") == "session_exists" and close_tuios_session_for_machine(name):
        error = (call_tuios_verb("new-session", session_params) or {}).get("error")
    # Still there: this command runs inside it, so it gets the window too.
    reused = bool(error) and error.get("code") == "session_exists"
    if error and not reused:
        log_mvm(f"{name}: tuios session {session} not opened: {error.get('message')}")
        return None
    window_params = {
        "session": session,
        "name": ssh_host_for_machine(name),
        "command": machine_ssh_window_command(name),
        # The window only runs ssh: it needs nothing from tuios.
        "grants": ["none"],
        # A dropped connection leaves its last lines and exit status on screen.
        "keep_open": True,
        "focus": False,
    }
    error = (call_tuios_verb("new-window", window_params) or {}).get("error")
    if error:
        log_mvm(f"{name}: tuios window for {session} not opened: {error.get('message')}")
        if not reused:
            close_tuios_session_for_machine(name)
        return None
    log_mvm(
        f"{name}: tuios session {session} (space {TUIOS_MACHINE_SPACE}) shows the machine's session {MACHINE_TUIOS_SESSION}"
    )
    return session


def close_tuios_session_for_machine(name):
    """Kill the local tuios session `aws-<name>`. True when it is gone; never the session this command runs in."""
    session = tuios_session_for_machine(name)
    if session == os.environ.get("TUIOS_SESSION"):
        return False
    reply = call_tuios_verb("kill-session", {"session": session})
    if reply is None:
        return False
    error = reply.get("error")
    if error and error.get("code") != "session_not_found":
        log_mvm(f"{name}: could not close tuios session {session}: {error.get('message')}")
        return False
    return True


def list_tuios_machine_sessions():
    """Local tuios sessions named `aws-*` in the space `mvm`. None (not []) when tuios did not answer."""
    reply = call_tuios_verb("list-sessions", {})
    if reply is None or reply.get("error"):
        return None
    return [
        session["name"]
        for session in reply.get("sessions") or []
        if session.get("space") == TUIOS_MACHINE_SPACE and str(session.get("name", "")).startswith(TUIOS_SESSION_PREFIX)
    ]


def machine_name_for_tuios_session(session):
    """`aws-<name>` -> `<name>`."""
    return session[len(TUIOS_SESSION_PREFIX) :]


def cmd_tuios(args):
    """`mvm tuios NAME`: open NAME's tuios session `aws-<name>` again, e.g. after its ssh connection dropped."""
    load_machine_record(args.name)
    if not shutil.which("tuios"):
        raise MvmError("tuios is not installed")
    session = open_tuios_session_for_machine(args.name)
    if session is None:
        raise MvmError(f"{args.name}: tuios session not opened (see above)")
    print(session)
