"""CloudWatch logs of machines and image builds (`mvm logs NAME`, and the tail printed when a build fails).

A machine's stream is `machine-<name>`: lifecycle hooks, workspace setup, network doctor, WIP
saves. It outlives the machine, so `mvm logs NAME` still works after `mvm rm NAME`.
"""

import os

from mvm_cli.aws_cli_access import reexec_under_aws_vault, run_aws_cli
from mvm_cli.machine_registry import validate_machine_name
from mvm_cli.mvm_errors import log_mvm
from mvm_cli.mvm_settings import AWS_CLI, MACHINE_LOG_GROUP, REGION


def cmd_logs(args):
    """`mvm logs NAME [-f] [--since 1h]`: the machine's CloudWatch stream."""
    validate_machine_name(args.name)
    reexec_under_aws_vault()
    argv = [
        AWS_CLI,
        "logs",
        "tail",
        MACHINE_LOG_GROUP,
        "--region",
        REGION,
        "--since",
        args.since,
        "--log-stream-names",
        f"machine-{args.name}",
        "--format",
        "short",
    ]
    if args.follow:
        argv.append("--follow")
    os.execvp(argv[0], argv)


def print_image_build_log_tail(since="20m", lines=40):
    """Print the last LINES build log lines (machine streams excluded) after a failed image build."""
    try:
        text = run_aws_cli(["logs", "tail", MACHINE_LOG_GROUP, "--since", since], parse_json=False)
    except Exception as error:  # the build already failed; never hide that behind a logs error
        log_mvm(f"could not read the build logs: {error}")
        return
    build_lines = [
        line
        for line in text.splitlines()
        if len(line.split(" ", 2)) > 1 and not line.split(" ", 2)[1].startswith("machine-")
    ]
    for line in build_lines[-lines:]:
        print(line.split(" ", 2)[-1])
