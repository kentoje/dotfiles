"""Port forwarding from mvm machines to this laptop (`mvm forward`), and each machine's dev server port.

cc-ext's dev page and HMR client use absolute http://localhost:PORT URLs, so a machine's dev server
must be reached at the same port number on the laptop. `mvm new` therefore gives every machine its
own devServerPort, which the machine writes as PORT into cc-ext's .env.local.

`mvm forward NAME` keeps one background OpenSSH control master per machine (FORWARDS_DIR/NAME.sock)
and adds each port to it with `ssh -O forward`. The forwarded ports are read back from the master's
listening sockets (lsof), so no state can drift: no running master means no forwards.

Imported by `mvm proxy` (through ended_machine_cleanup) on every ssh connection: keep it light,
3.9-compatible, and free of imports from ssh_access, ended_machine_cleanup or machine_lifecycle.
"""

import errno
import re
import socket
import subprocess

from mvm_cli.aws_cli_access import reexec_under_aws_vault
from mvm_cli.machine_registry import (
    list_machine_records,
    load_machine_record,
    ssh_host_for_machine,
    validate_machine_name,
)
from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import DEV_SERVER_PORT_RANGE, FORWARDS_DIR, HOOK_PORT, SSH_BRIDGE_PORT

# Starting the master goes through `mvm proxy` (endpoint token) and ssh auth.
FORWARD_MASTER_START_TIMEOUT_SECONDS = 90
# `ssh -O ...` requests to a running master, and lsof.
FORWARD_CONTROL_TIMEOUT_SECONDS = 15
# Machine ports never forwarded: sshd, the WebSocket ssh bridge, the lifecycle hook server.
MACHINE_SYSTEM_PORTS = {22, SSH_BRIDGE_PORT, HOOK_PORT}
FORWARD_MASTER_PID_PATTERN = re.compile(r"Master running \(pid=(\d+)\)")


def forward_control_socket_path(name):
    """NAME's forward master control socket (ssh -S)."""
    return FORWARDS_DIR / f"{name}.sock"


def forward_master_log_path(name):
    """stderr of NAME's forward master and of its `mvm proxy`: connection errors, SSO prompts."""
    return FORWARDS_DIR / f"{name}.log"


def pick_dev_server_port(taken_ports, is_port_free=None):
    """The lowest port in DEV_SERVER_PORT_RANGE that no other machine has and nothing on this laptop uses."""
    is_port_free = is_port_free or laptop_port_is_free
    for port in DEV_SERVER_PORT_RANGE:
        if port not in taken_ports and is_port_free(port):
            return port
    raise MvmError(
        f"no free dev server port in {DEV_SERVER_PORT_RANGE.start}-{DEV_SERVER_PORT_RANGE.stop - 1} "
        "(remove machines with `mvm rm`)"
    )


def dev_server_ports_in_use():
    """devServerPort of every machine recorded on this laptop."""
    return {record["devServerPort"] for record in list_machine_records() if record.get("devServerPort")}


def laptop_port_is_free(port):
    """True when nothing on this laptop listens on localhost:PORT (bind probe on 127.0.0.1 and ::1).

    A bind probe, not lsof: lsof cannot see other users' processes. It also catches 0.0.0.0 and ::
    listeners on macOS.
    """
    for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        with socket.socket(family, socket.SOCK_STREAM) as probe:
            try:
                probe.bind((host, port))
            except OSError as error:
                if error.errno == errno.EADDRINUSE:
                    return False
    return True


def run_through_forward_master(name, ssh_options, remote_command=None):
    """Run `ssh -S <NAME's socket> SSH_OPTIONS NAME.mvm [REMOTE_COMMAND]`; never raises on failure.

    With `-O check|forward|exit` it talks to the master itself; with a REMOTE_COMMAND it runs that
    command over the master's connection.
    """
    argv = ["ssh", "-S", str(forward_control_socket_path(name)), *ssh_options, ssh_host_for_machine(name)]
    try:
        return subprocess.run(
            argv + ([remote_command] if remote_command else []),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=FORWARD_CONTROL_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(argv, 255, "", "ssh control request timed out")


def find_forward_master_pid(name):
    """PID of NAME's running forward master, or None."""
    if not forward_control_socket_path(name).exists():
        return None
    result = run_through_forward_master(name, ["-O", "check"])
    match = FORWARD_MASTER_PID_PATTERN.search(result.stderr)
    return int(match.group(1)) if result.returncode == 0 and match else None


def list_master_forwarded_ports(master_pid):
    """Laptop ports that forward master MASTER_PID listens on (its -L forwards), sorted."""
    try:
        output = subprocess.run(
            ["lsof", "-nP", "-a", "-p", str(master_pid), "-iTCP", "-sTCP:LISTEN", "-Fn"],
            capture_output=True,
            text=True,
            timeout=FORWARD_CONTROL_TIMEOUT_SECONDS,
        ).stdout
    except subprocess.TimeoutExpired:
        return []
    return sorted({int(line.rsplit(":", 1)[1]) for line in output.splitlines() if line.startswith("n")})


def list_machine_forwarded_ports(name):
    """Laptop ports currently forwarded to NAME by `mvm forward` (empty without a running master)."""
    master_pid = find_forward_master_pid(name)
    return list_master_forwarded_ports(master_pid) if master_pid else []


def start_forward_master(name):
    """Start NAME's background forward master (no forwards yet) and return its PID.

    Its stdout and stderr never reach the caller's: an agent's tool call reading them through a
    pipe would wait for the master to exit. stderr goes to forward_master_log_path(NAME).
    """
    FORWARDS_DIR.mkdir(parents=True, exist_ok=True)
    control_socket = forward_control_socket_path(name)
    # A stale socket would make `ssh -M` fall back to a plain connection without multiplexing.
    control_socket.unlink(missing_ok=True)
    log_path = forward_master_log_path(name)
    with open(log_path, "w") as log_file:
        try:
            result = subprocess.run(
                [
                    "ssh",
                    "-f",
                    "-N",
                    "-M",
                    "-S",
                    str(control_socket),
                    "-o",
                    "ControlPersist=no",
                    ssh_host_for_machine(name),
                ],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=log_file,
                timeout=FORWARD_MASTER_START_TIMEOUT_SECONDS,
            )
            returncode = result.returncode
        except subprocess.TimeoutExpired:
            returncode = None
    master_pid = find_forward_master_pid(name) if returncode == 0 else None
    if master_pid is None:
        log_tail = " | ".join(log_path.read_text().strip().splitlines()[-3:]) or "no output"
        timed_out = f" (timed out after {FORWARD_MASTER_START_TIMEOUT_SECONDS}s)" if returncode is None else ""
        raise MvmError(f"forward: could not connect to {name}{timed_out}: {log_tail}")
    return master_pid


def parse_dev_user_listen_ports(id_and_ss_output):
    """Ports from `id -u; ss -Hltne` output that the dev user listens on, minus MACHINE_SYSTEM_PORTS.

    `ss -e` prints `uid:N` only for sockets of non-root users; the machine's own services run as
    root or system users, dev servers and agent tools as dev.
    """
    lines = id_and_ss_output.splitlines()
    if not lines:
        return []
    owner = f"uid:{lines[0].strip()}"
    ports = set()
    for line in lines[1:]:
        fields = line.split()
        if len(fields) >= 4 and owner in fields:
            port = int(fields[3].rsplit(":", 1)[1])
            if port not in MACHINE_SYSTEM_PORTS:
                ports.add(port)
    return sorted(ports)


def list_machine_dev_listen_ports(name):
    """TCP ports the dev user listens on inside NAME (dev servers), read through NAME's forward master."""
    result = run_through_forward_master(name, ["-o", "BatchMode=yes"], "id -u; ss -Hltne 2>/dev/null")
    if result.returncode != 0:
        raise MvmError(f"forward: could not list {name}'s listening ports: {result.stderr.strip()}")
    return parse_dev_user_listen_ports(result.stdout)


def find_forward_master_names_by_pid():
    """{master pid: machine name} for every running forward master, records or not."""
    if not FORWARDS_DIR.exists():
        return {}
    names_by_pid = {}
    for control_socket in FORWARDS_DIR.glob("*.sock"):
        master_pid = find_forward_master_pid(control_socket.stem)
        if master_pid:
            names_by_pid[master_pid] = control_socket.stem
    return names_by_pid


def describe_laptop_port_holder(port):
    """Who listens on PORT on this laptop: `machine X (mvm forward X --stop)`, `node (pid 123)`, or a fallback."""
    try:
        output = subprocess.run(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-Fpc"],
            capture_output=True,
            text=True,
            timeout=FORWARD_CONTROL_TIMEOUT_SECONDS,
        ).stdout
    except subprocess.TimeoutExpired:
        output = ""
    pids = [int(line[1:]) for line in output.splitlines() if line.startswith("p")]
    commands = [line[1:] for line in output.splitlines() if line.startswith("c")]
    if not pids:
        return "a process this user cannot see"
    other_machine = find_forward_master_names_by_pid().get(pids[0])
    if other_machine:
        return f"the forward to machine {other_machine} (mvm forward {other_machine} --stop)"
    return f"{commands[0] if commands else 'a process'} (pid {pids[0]})"


def add_port_forward(name, port):
    """Ask NAME's forward master to forward laptop localhost:PORT to localhost:PORT on the machine."""
    # `localhost` on the machine side: sshd tries 127.0.0.1 and ::1, whichever the server bound.
    result = run_through_forward_master(name, ["-O", "forward", "-L", f"{port}:localhost:{port}"])
    if result.returncode != 0:
        raise MvmError(f"forward: {name}: forwarding port {port} failed: {result.stderr.strip()}")


def stop_machine_port_forwards(name):
    """Close NAME's forward master and all its laptop ports; returns the ports it had. No-op without one.

    Works from the control socket alone, so it also frees ports of a machine with no record left.
    """
    master_pid = find_forward_master_pid(name)
    ports = list_master_forwarded_ports(master_pid) if master_pid else []
    if master_pid:
        run_through_forward_master(name, ["-O", "exit"])
    forward_control_socket_path(name).unlink(missing_ok=True)
    return ports


def forget_machine_port_forwards(name):
    """For an ended machine: close its forwards (freeing the laptop ports) and delete its master log."""
    stop_machine_port_forwards(name)
    forward_master_log_path(name).unlink(missing_ok=True)


def forward_machine_ports(name, requested_ports):
    """Forward REQUESTED_PORTS (or, when empty, every port the dev user listens on) from NAME.

    Returns the forwarded ports. A busy laptop port is an error when it was requested, and only a
    warning when it was discovered (agent tools also listen as dev; the dev server still forwards).
    """
    master_pid = find_forward_master_pid(name)
    started_master = master_pid is None
    if started_master:
        master_pid = start_forward_master(name)
    already_forwarded = set(list_master_forwarded_ports(master_pid))
    ports = sorted(set(requested_ports)) or list_machine_dev_listen_ports(name)
    if not ports:
        if started_master:
            stop_machine_port_forwards(name)
        dev_server_port = load_machine_record(name).get("devServerPort")
        hint = f"start the dev server (port {dev_server_port})" if dev_server_port else "start the dev server"
        raise MvmError(f"forward: nothing listens on {name} yet: {hint}, or pass PORT")
    forwarded, refused = [], []
    for port in ports:
        if port in already_forwarded:
            forwarded.append(port)
            continue
        if not laptop_port_is_free(port):
            holder = describe_laptop_port_holder(port)
            if requested_ports:
                refused.append(f"port {port} is in use on this laptop by {holder}")
            else:
                log_mvm(f"{name}: skipped port {port}: in use on this laptop by {holder}")
            continue
        add_port_forward(name, port)
        forwarded.append(port)
    if started_master and not forwarded:
        stop_machine_port_forwards(name)
    if refused:
        raise MvmError(f"forward: {name}: " + "; ".join(refused))
    return forwarded


def cmd_forward(args):
    """`mvm forward NAME [PORT...]`: reach NAME's dev servers at http://localhost:PORT; `--stop` closes them."""
    # The name becomes a socket path: never let `../x` through, even for --stop without a record.
    validate_machine_name(args.name)
    if args.stop:
        stopped = stop_machine_port_forwards(args.name)
        log_mvm(
            f"{args.name}: stopped forwarding {', '.join(map(str, stopped))}"
            if stopped
            else f"{args.name}: no forwards"
        )
        return
    load_machine_record(args.name)
    # The master's `mvm proxy` mints the endpoint token: do any SSO prompt here, in the foreground.
    reexec_under_aws_vault()
    for port in forward_machine_ports(args.name, args.ports):
        log_mvm(f"{args.name}: localhost:{port} -> {args.name}:{port}")
        print(f"http://localhost:{port}/")
