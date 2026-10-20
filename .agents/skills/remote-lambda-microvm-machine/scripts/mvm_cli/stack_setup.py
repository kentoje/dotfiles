"""One-time and occasional setup: `mvm setup` (stack, ssh, ~/.local/bin/mvm, fish completion) and `mvm secrets push`."""

import json
import os
import subprocess

from mvm_cli.aws_cli_access import read_stack_outputs, reexec_under_aws_vault, run_aws_cli
from mvm_cli.mvm_errors import log_mvm
from mvm_cli.mvm_settings import (
    AWS_CLI,
    MVM_ENTRY_SCRIPT,
    MVM_FISH_COMPLETION_LINK,
    MVM_FISH_COMPLETION_SOURCE,
    MVM_ON_PATH,
    OWNER,
    REGION,
    SECRET_ENV_NAMES,
    STACK_NAME,
    STACK_TEMPLATE,
    owner_email,
)
from mvm_cli.ssh_access import ensure_mvm_ssh_key, write_ssh_config_block


def link_mvm_laptop_file(link, target):
    """Symlink LINK to TARGET (a file in this skill). Idempotent; never replaces a file it did not create.

    A dangling symlink is replaced: that is what an old link looks like after the skill moved
    (renamed folder, other checkout), and it points at nothing that could be lost.
    """
    if link.is_symlink() and link.resolve() == target:
        return
    dangling = link.is_symlink() and not link.exists()
    if link.exists() and not dangling:
        log_mvm(f"not touching {link}: it is not a link to {target}")
        return
    if dangling:
        link.unlink()
    link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(target)
    log_mvm(f"linked {link} -> {target}")


def install_mvm_on_path():
    """Symlink ~/.local/bin/mvm to the entry script; leaves any other `mvm` there alone."""
    link_mvm_laptop_file(MVM_ON_PATH, MVM_ENTRY_SCRIPT)


def install_mvm_fish_completion():
    """Symlink ~/.config/fish/completions/mvm.fish (tab completion) to scripts/completions/mvm.fish."""
    link_mvm_laptop_file(MVM_FISH_COMPLETION_LINK, MVM_FISH_COMPLETION_SOURCE)


def cmd_setup(args):
    """Deploy the CloudFormation stack, create the ssh key and config block, put `mvm` on PATH, link fish completion."""
    reexec_under_aws_vault()
    email = owner_email()
    log_mvm(f"deploying stack {STACK_NAME} in {REGION}")
    subprocess.run(
        [
            AWS_CLI,
            "cloudformation",
            "deploy",
            "--region",
            REGION,
            "--stack-name",
            STACK_NAME,
            "--template-file",
            str(STACK_TEMPLATE),
            "--capabilities",
            "CAPABILITY_NAMED_IAM",
            "--parameter-overrides",
            f"Owner={OWNER}",
            f"OwnerEmail={email}",
            "--tags",
            f"owner={email}",
            "purpose=dev-microvm",
            "--no-fail-on-empty-changeset",
        ],
        check=True,
    )
    ensure_mvm_ssh_key()
    write_ssh_config_block()
    install_mvm_on_path()
    install_mvm_fish_completion()
    for key, value in read_stack_outputs().items():
        print(f"{key}: {value}")


def cmd_secrets_push(args):
    """Copy SECRET_ENV_NAMES (+ MVM_EXTRA_SECRET_NAMES) from this shell into the env secret. Prints names only."""
    reexec_under_aws_vault()
    names = SECRET_ENV_NAMES + [n for n in os.environ.get("MVM_EXTRA_SECRET_NAMES", "").split(",") if n]
    values = {n: os.environ[n] for n in names if os.environ.get(n)}
    missing = [n for n in names if n not in values]
    if missing:
        log_mvm(f"not in this environment, skipped: {', '.join(missing)}")
    secret_arn = read_stack_outputs()["EnvSecretArn"]
    run_aws_cli(
        ["secretsmanager", "put-secret-value", "--secret-id", secret_arn, "--secret-string", "file:///dev/stdin"],
        stdin_text=json.dumps(values),
    )
    log_mvm(f"pushed {len(values)} vars to {secret_arn}: {', '.join(sorted(values))}")
