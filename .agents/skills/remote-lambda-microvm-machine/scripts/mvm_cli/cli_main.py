"""mvm command line: argument parsing and dispatch. Each command lives in its own module (see imports)."""

import argparse
import os
import sys

from mvm_cli.image_build import cmd_image_build
from mvm_cli.machine_lifecycle import cmd_ls, cmd_new, cmd_rm
from mvm_cli.machine_logs import cmd_logs
from mvm_cli.machine_port_forwarding import cmd_forward
from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import EXTRA_PATH_DIRS, NIX_SYSTEM_BIN_DIR
from mvm_cli.ssh_access import cmd_proxy, cmd_ssh
from mvm_cli.stack_setup import cmd_secrets_push, cmd_setup
from mvm_cli.tuios_machine_session import cmd_tuios

MVM_HELP_DESCRIPTION = """\
mvm - dev machines on AWS Lambda MicroVMs.

Machines:
  new [NAME]          start a machine (random name if omitted), wait for ssh, add it to herdr, open its tuios session
  rm NAME...          terminate machines and remove them from herdr and tuios (unpushed work is pushed first)
  ls                  list machines: state, image version, age, time left, herdr label, tuios session, forwarded ports
  ssh NAME [CMD...]   same as `ssh NAME.mvm`
  tuios NAME          open the machine's tuios session aws-NAME again (after a dropped connection)
  forward NAME [PORT...]
                      reach the machine's dev servers at http://localhost:PORT (--stop closes them)
  logs NAME           the machine's logs: workspace setup, hooks, WIP saves

Maintenance:
  setup               one-time: AWS stack, ssh key and ~/.ssh/config block, ~/.local/bin/mvm, fish completion
  secrets push        copy your dev env vars from this shell into the machines' secret
  image build         rebuild the dev image after changing image/

Run `mvm COMMAND --help` for flags. Docs: ~/.agents/skills/remote-lambda-microvm-machine/SKILL.md
"""


def parse_tcp_port(text):
    """argparse type for a TCP port number (1-65535)."""
    try:
        port = int(text)
    except ValueError:
        port = 0
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError(f"invalid port {text!r}: use 1-65535")
    return port


def build_mvm_parser():
    parser = argparse.ArgumentParser(
        prog="mvm",
        usage="mvm COMMAND [ARGS...]",
        description=MVM_HELP_DESCRIPTION,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    # The command list is MVM_HELP_DESCRIPTION: subparsers take description= (shown by
    # `mvm COMMAND --help`), not help=, so argparse adds no second list and `proxy` stays hidden.
    # prog="mvm" keeps subcommand usage as `mvm new ...` despite the custom usage above.
    sub = parser.add_subparsers(dest="command", metavar="COMMAND", help=argparse.SUPPRESS, prog="mvm")
    sub.required = True

    new = sub.add_parser(
        "new", description="Start a machine, wait for ssh, add it to herdr and open its tuios session, both aws-NAME."
    )
    new.add_argument("name", nargs="?", help="machine name (default: random adjective-noun)")
    new.add_argument("--ttl", default="8h", help="lifetime before AWS terminates it: 1m to 8h (default 8h)")
    new.add_argument("--json", action="store_true", help="print the result as JSON")
    new.set_defaults(func=cmd_new)

    rm = sub.add_parser(
        "rm",
        description="Terminate machines and remove them from herdr and tuios. Unpushed work is pushed to wip/mvm/NAME/<branch> first.",
    )
    rm.add_argument("names", nargs="+", metavar="NAME")
    rm.add_argument("--discard", action="store_true", help="do not push unpushed work to wip/mvm/NAME/* branches")
    rm.set_defaults(func=cmd_rm)

    ls = sub.add_parser(
        "ls",
        aliases=["list"],
        description="List machines: state, image version, age, time left, herdr label, tuios session, forwarded ports.",
    )
    ls.add_argument("--json", action="store_true")
    ls.set_defaults(func=cmd_ls)

    ssh = sub.add_parser("ssh", description="Same as `ssh NAME.mvm [CMD...]`.")
    ssh.add_argument("name")
    ssh.add_argument("command", nargs=argparse.REMAINDER, help="optional command to run instead of a shell")
    ssh.set_defaults(func=cmd_ssh)

    tuios = sub.add_parser(
        "tuios",
        description="Open the machine's local tuios session aws-NAME again, its window attaching the machine's own"
        " session `main` over ssh. Replaces a session whose ssh connection dropped; agents on the machine keep running.",
    )
    tuios.add_argument("name")
    tuios.set_defaults(func=cmd_tuios)

    forward = sub.add_parser(
        "forward",
        description="Forward ports of the machine to the same ports on this laptop's localhost, through one"
        " background ssh connection per machine. Without PORT: every port the machine's dev user listens on."
        " Prints one http://localhost:PORT/ line per forwarded port. Re-running is harmless.",
    )
    forward.add_argument("name")
    forward.add_argument("ports", nargs="*", type=parse_tcp_port, metavar="PORT")
    forward.add_argument("--stop", action="store_true", help="close all of the machine's forwards")
    forward.set_defaults(func=cmd_forward)

    logs = sub.add_parser(
        "logs",
        description="The machine's CloudWatch logs: workspace setup, lifecycle hooks, WIP saves. Works after `mvm rm` too.",
    )
    logs.add_argument("name")
    logs.add_argument("--follow", "-f", action="store_true")
    logs.add_argument("--since", default="1h", help="how far back, e.g. 30m, 2h (default 1h)")
    logs.set_defaults(func=cmd_logs)

    sub.add_parser(
        "setup",
        description="Deploy the AWS stack, create the ssh key and ~/.ssh/config block, link ~/.local/bin/mvm and"
        " ~/.config/fish/completions/mvm.fish.",
    ).set_defaults(func=cmd_setup)

    secrets = sub.add_parser("secrets", description="The env secret machines read at start.").add_subparsers(
        dest="secrets_command", metavar="push"
    )
    secrets.required = True
    secrets.add_parser(
        "push", description="Copy the dev env vars from this shell into the secret (prints names, never values)."
    ).set_defaults(func=cmd_secrets_push)

    image = sub.add_parser("image", description="The dev image machines start from.").add_subparsers(
        dest="image_command", metavar="build"
    )
    image.required = True
    build = image.add_parser(
        "build", description="Build a new image version from image/. New machines use the latest successful one."
    )
    build.add_argument("--no-wait", action="store_true", help="return once the build started")
    build.set_defaults(func=cmd_image_build)

    # ssh ProxyCommand for `Host *.mvm` (written by `mvm setup`); not for direct use.
    proxy = sub.add_parser("proxy")
    proxy.add_argument("host")
    proxy.set_defaults(func=cmd_proxy)
    return parser


def run_mvm_cli(argv=None):
    os.environ["PATH"] = os.pathsep.join([NIX_SYSTEM_BIN_DIR, os.environ.get("PATH", "")] + EXTRA_PATH_DIRS)
    parser = build_mvm_parser()
    if not (sys.argv[1:] if argv is None else argv):
        parser.print_help()
        return
    args = parser.parse_args(argv)
    try:
        args.func(args)
    except MvmError as error:
        log_mvm(str(error))
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
