"""AWS access for mvm: runs the AWS CLI (through aws-vault when the env has no credentials) and the MicroVM API calls."""

import json
import os
import shutil
import subprocess
import sys

from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings import (
    AWS_CLI,
    AWS_VAULT_PROFILE,
    IMAGE_NAME,
    MVM_ENTRY_SCRIPT,
    REGION,
    STACK_NAME,
)

# MicroVM states after which the machine is gone for good: no ssh, no herdr, no local name.
ENDED_MICROVM_STATES = frozenset({"TERMINATING", "TERMINATED", "FAILED"})


class AwsCliError(MvmError):
    """An AWS CLI call exited non-zero. `stderr` keeps the CLI's message (error code included)."""

    def __init__(self, message, stderr):
        super().__init__(message)
        self.stderr = stderr

    def is_resource_not_found(self):
        """True when AWS says the resource does not exist, as opposed to auth or network errors."""
        return "ResourceNotFoundException" in self.stderr


def has_aws_credentials_in_env():
    return bool(os.environ.get("AWS_ACCESS_KEY_ID") or os.environ.get("AWS_PROFILE"))


def reexec_under_aws_vault():
    """Re-run this mvm command inside `aws-vault exec` once, so its AWS calls skip per-call aws-vault."""
    if has_aws_credentials_in_env():
        return
    if not shutil.which("aws-vault"):
        raise MvmError("no AWS credentials in the environment and aws-vault is not installed")
    argv = ["aws-vault", "exec", AWS_VAULT_PROFILE, "--", sys.executable, str(MVM_ENTRY_SCRIPT), *sys.argv[1:]]
    os.execvp(argv[0], argv)


def run_aws_cli(args, parse_json=True, stdin_text=None, timeout=300):
    """Run `aws <args>` in REGION and return parsed JSON (or text). Raises AwsCliError on failure.

    Without credentials in the env (`mvm proxy`, which skips the re-exec), the call goes through
    `aws-vault exec`; the timeout then also bounds a stuck SSO browser login.
    """
    cmd = [AWS_CLI, *args, "--region", REGION]
    if parse_json:
        cmd += ["--output", "json"]
    if not has_aws_credentials_in_env():
        cmd = ["aws-vault", "exec", AWS_VAULT_PROFILE, "--", *cmd]
    try:
        result = subprocess.run(
            cmd,
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "AWS_PAGER": ""},
            stdin=None if stdin_text is not None else subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired:
        raise AwsCliError(
            f"aws {' '.join(args[:2])} timed out after {timeout}s; if AWS SSO expired, "
            f"run: aws-vault exec {AWS_VAULT_PROFILE} -- true",
            stderr="timeout",
        ) from None
    if result.returncode != 0:
        raise AwsCliError(f"aws {' '.join(args[:2])} failed: {result.stderr.strip()[-600:]}", stderr=result.stderr)
    if not parse_json:
        return result.stdout
    return json.loads(result.stdout) if result.stdout.strip() else {}


def read_stack_outputs():
    """Return the CloudFormation outputs of the mvm stack (bucket, roles, secret, log group) as a dict."""
    data = run_aws_cli(["cloudformation", "describe-stacks", "--stack-name", STACK_NAME])
    outputs = data["Stacks"][0].get("Outputs", [])
    return {o["OutputKey"]: o["OutputValue"] for o in outputs}


_ACCOUNT_ID_CACHE = []


def account_id_from_sts():
    if not _ACCOUNT_ID_CACHE:
        _ACCOUNT_ID_CACHE.append(run_aws_cli(["sts", "get-caller-identity"])["Account"])
    return _ACCOUNT_ID_CACHE[0]


def image_arn():
    """The dev image ARN. The lambda-microvms APIs reject a bare image name as identifier."""
    return f"arn:aws:lambda:{REGION}:{account_id_from_sts()}:microvm-image:{IMAGE_NAME}"


def get_microvm(microvm_id, timeout=300):
    """get-microvm: state, endpoint, image version. Raises AwsCliError (see is_resource_not_found)."""
    return run_aws_cli(["lambda-microvms", "get-microvm", "--microvm-identifier", microvm_id], timeout=timeout)


def list_image_microvms():
    """Every MicroVM started from the dev image (all pages), ended ones included. Raises on any error."""
    data = run_aws_cli(["lambda-microvms", "list-microvms", "--image-identifier", image_arn()])
    return data.get("items") or data.get("microvms") or []


def terminate_microvm(microvm_id):
    run_aws_cli(["lambda-microvms", "terminate-microvm", "--microvm-identifier", microvm_id])


def microvm_has_ended(microvm_id, timeout=300):
    """True only when AWS confirms the MicroVM ended (or no longer exists). False on any other error.

    Fails closed on purpose: forgetting a live machine's local name would make it unreachable.
    """
    try:
        info = get_microvm(microvm_id, timeout=timeout)
    except AwsCliError as error:
        return error.is_resource_not_found()
    return info.get("state") in ENDED_MICROVM_STATES
