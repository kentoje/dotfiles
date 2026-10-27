"""`mvm agent NAME`: start a coding agent (claude, omp or pi) live in the machine's tuios session `main`.

The laptop's `aws-<name>` window shows `main`, so the person watches and steers the agent there.
One ssh call does the rest: the prompt arrives on stdin and is saved on the machine, the script waits for
the workspace setup, refuses a `main` already running something, then types the agent's command line into
`main`'s shell with `tuios send-text`. The shell outlives the agent, so `main` never goes empty.
Each agent reads its model from its own config on the machine (see MACHINE_AGENT_COMMAND_LINES).
"""

import shlex
import subprocess
import time

from mvm_cli.machine_registry import load_machine_record, ssh_host_for_machine
from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import (
    MACHINE_GITLAB_ROOT,
    MACHINE_HOME_DIR,
    MACHINE_TUIOS_SESSION,
    TUIOS_REMOTE_BINARY,
    default_machine_agent,
    workspace_repo_paths,
)
from mvm_cli.tuios_machine_session import start_machine_tuios_session, tuios_session_for_machine

# Agent command lines typed into `main`: (without a prompt, with the prompt file {prompt}).
# - claude: Opus 5.5 and bypassPermissions from ~/.claude/settings.json (image rootfs); signs in with the
#   subscription token CLAUDE_CODE_OAUTH_TOKEN from the env secret. The prompt is its first message.
# - omp: models from ~/.omp/agent/config.yml (dotfiles); `@file` is its first message.
# - pi: models from ~/.pi/agent/settings.json (dotfiles); --approve trusts the checkout's project files.
MACHINE_AGENT_COMMAND_LINES = {
    "claude": ("claude", 'claude "$(cat {prompt})"'),
    "omp": ("omp", "omp @{prompt}"),
    "pi": ("pi --approve", "pi --approve @{prompt}"),
}
# Claude asks "Do you trust this folder?" in every new directory: trusting /home/dev does not cover the
# directories below it, and no setting skips the question. Before claude starts, the launch script records
# the answer for the agent's directory ($cwd) in ~/.claude.json, as answering "Yes" would.
MACHINE_CLAUDE_TRUST_DIRECTORY_SCRIPT = (
    "f=~/.claude.json; [ -s \"$f\" ] || echo '{}' > \"$f\"; tmp=$(mktemp)"
    ' && jq --arg d "$cwd" \'.projects[$d].hasTrustDialogAccepted = true\' "$f" > "$tmp" && mv "$tmp" "$f"'
    " || fail 'could not mark the directory as trusted in ~/.claude.json'"
)
# The workspace setup (mvm-bootstrap-workspace) writes its phase here; `running` until it is done.
MACHINE_BOOTSTRAP_STATUS_FILE = "~/.local/state/mvm/bootstrap-status.json"
MACHINE_BOOTSTRAP_WAIT_SECONDS = 600
# Foreground commands of an idle shell in `main` (or none): anything else means `main` is busy.
MACHINE_IDLE_SHELL_COMMANDS = ["bash", "-bash"]


def machine_agent_command_line(agent, prompt_path=None):
    """The shell line that starts AGENT, with PROMPT_PATH (a file on the machine) as its first message."""
    without_prompt, with_prompt = MACHINE_AGENT_COMMAND_LINES[agent]
    return with_prompt.format(prompt=shlex.quote(prompt_path)) if prompt_path else without_prompt


def resolve_machine_agent_cwd(cwd):
    """The agent's directory on the machine: CWD (absolute, `~/...` or relative to the home), else the main checkout."""
    if not cwd:
        return f"{MACHINE_GITLAB_ROOT}/{workspace_repo_paths()[0]}"
    if cwd == "~" or cwd.startswith("~/"):
        return MACHINE_HOME_DIR + cwd[1:]
    if cwd.startswith("/"):
        return cwd
    return f"{MACHINE_HOME_DIR}/{cwd}"


def render_machine_agent_launch_script(agent, cwd, prompt_path=None):
    """Bash run over ssh: save the prompt from stdin, wait for the workspace setup, type the agent into `main`.

    Fails with one `mvm agent: ...` line on stderr when `main` is busy or CWD does not exist.
    """
    line = f"cd {shlex.quote(cwd)} && {machine_agent_command_line(agent, prompt_path)}\n"
    lines = [
        "set -u",
        f"T={TUIOS_REMOTE_BINARY}",
        'fail() { echo "mvm agent: $*" >&2; exit 1; }',
    ]
    if prompt_path:
        lines.append(f"cat > {shlex.quote(prompt_path)} || fail 'could not save the prompt'")
    lines += [
        f"status={MACHINE_BOOTSTRAP_STATUS_FILE}",
        f"deadline=$((SECONDS + {MACHINE_BOOTSTRAP_WAIT_SECONDS}))",
        'while [ "$(jq -r \'.phase // "running"\' "$status" 2>/dev/null || echo running)" = running ]'
        " && [ $SECONDS -lt $deadline ]; do",
        "  [ -n \"${waiting:-}\" ] || { echo 'mvm agent: waiting for the workspace setup' >&2; waiting=1; }",
        "  sleep 5",
        "done",
        f"cwd={shlex.quote(cwd)}",
        f'[ -d "$cwd" ] || fail {shlex.quote(f"no directory {cwd} on the machine")}',
        *([MACHINE_CLAUDE_TRUST_DIRECTORY_SCRIPT] if agent == "claude" else []),
        f"busy=$($T list-windows -s {MACHINE_TUIOS_SESSION} --json 2>/dev/null"
        " | jq -r '.windows[]? | select(.focused) | .foreground_cmd // \"\"')",
        f"case \"$busy\" in {'|'.join(MACHINE_IDLE_SHELL_COMMANDS)}|'') ;;"
        f' *) fail "session {MACHINE_TUIOS_SESSION} is busy running $busy: stop it first" ;; esac',
        f"$T send-text -s {MACHINE_TUIOS_SESSION} {shlex.quote(line)} >/dev/null || fail 'tuios send-text failed'",
    ]
    return "\n".join(lines)


def read_machine_agent_prompt(args):
    """The prompt text from --prompt-file or the PROMPT words; None when neither is given."""
    if args.prompt_file and args.prompt:
        raise MvmError("give the prompt as --prompt-file or as PROMPT words, not both")
    if args.prompt_file:
        try:
            with open(args.prompt_file) as prompt_file:
                return prompt_file.read()
        except OSError as error:
            raise MvmError(f"prompt file unreadable: {error}") from None
    return " ".join(args.prompt) or None


def cmd_agent(args):
    """`mvm agent NAME [--agent claude|omp|pi] [--cwd DIR] [--prompt-file FILE | PROMPT...]`."""
    load_machine_record(args.name)
    agent = args.agent or default_machine_agent()
    cwd = resolve_machine_agent_cwd(args.cwd)
    prompt = read_machine_agent_prompt(args)
    prompt_path = f"/tmp/mvm-agent-prompt-{agent}-{time.strftime('%Y%m%dT%H%M%S')}.md" if prompt else None
    # Gives an empty `main` a window (and writes the machine's tuios config) before typing into it.
    start_machine_tuios_session(args.name)
    try:
        result = subprocess.run(
            [
                "ssh",
                "-o",
                "BatchMode=yes",
                "-o",
                "ConnectTimeout=15",
                ssh_host_for_machine(args.name),
                render_machine_agent_launch_script(agent, cwd, prompt_path),
            ],
            input=prompt or "",
            capture_output=True,
            text=True,
            timeout=900,
        )
    except subprocess.TimeoutExpired:
        raise MvmError(f"{args.name}: agent launch timed out") from None
    for line in result.stderr.splitlines():
        if line.startswith("mvm agent: waiting"):
            log_mvm(f"{args.name}: {line[len('mvm agent: ') :]}")
    if result.returncode != 0:
        reasons = [line for line in result.stderr.splitlines() if line.startswith("mvm agent: ")]
        reason = reasons[-1][len("mvm agent: ") :] if reasons else (result.stderr.strip()[-300:] or "ssh failed")
        raise MvmError(f"{args.name}: {agent} not started: {reason}")
    log_mvm(
        f"{args.name}: {agent} started in {cwd}, in the machine's tuios session {MACHINE_TUIOS_SESSION};"
        f" watch it in the tuios session {tuios_session_for_machine(args.name)}"
    )
