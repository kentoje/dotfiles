"""AWS access for mvm: persistent credential providers, legacy aws-vault, and MicroVM API calls."""

import json
import os
import shutil
import subprocess
import sys

from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings import (
    AWS_CLI,
    IMAGE_NAME,
    MVM_ENTRY_SCRIPT,
    REGION,
    STACK_NAME,
    aws_authentication,
    aws_vault_profile,
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


# Inherited credential selectors a configured profile replaces. AWS_VAULT marks a shell inside
# `aws-vault exec` (personal SSO): aws-vault refuses to nest, which would break a profile whose
# credential_process runs aws-vault. Container URIs are where `aws-vault exec --server` serves.
INHERITED_AWS_CREDENTIAL_ENV_NAMES = (
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN",
    "AWS_CREDENTIAL_EXPIRATION", "AWS_SESSION_EXPIRATION", "AWS_DEFAULT_PROFILE",
    "AWS_ROLE_ARN", "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_SESSION_NAME",
    "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_VAULT",
)


def configure_aws_authentication():
    """Apply explicit AWS authentication to this process and its SSH/logging children.

    A configured profile owns credential resolution: inherited session credentials, web
    identity selectors and an enclosing personal aws-vault session must not mask its renewable
    provider. Default-chain mode deliberately leaves AWS's own provider chain intact for an
    EC2/ECS workload role.
    """
    auth = aws_authentication()
    if auth is None:
        return False
    if auth["kind"] == "profile":
        for name in INHERITED_AWS_CREDENTIAL_ENV_NAMES:
            os.environ.pop(name, None)
        os.environ["AWS_PROFILE"] = auth["profile"]
    os.environ["AWS_CLI_AUTO_PROMPT"] = "off"
    return True


def reexec_under_aws_vault():
    """Select persistent authentication, or re-exec under aws-vault for legacy interactive use."""
    if configure_aws_authentication() or has_aws_credentials_in_env():
        return
    if not shutil.which("aws-vault"):
        raise MvmError("no AWS credentials in the environment and aws-vault is not installed")
    argv = ["aws-vault", "exec", aws_vault_profile(), "--", sys.executable, str(MVM_ENTRY_SCRIPT), *sys.argv[1:]]
    os.execvp(argv[0], argv)


def run_aws_cli(args, parse_json=True, stdin_text=None, timeout=300):
    """Run `aws <args>` in REGION and return parsed JSON (or text). Raises AwsCliError on failure.

    SSH's `mvm proxy` resolves the same persistent provider without a shell or Flue's .env.
    Explicit providers fail without falling back to an interactive aws-vault login.
    """
    explicit_auth = configure_aws_authentication()
    cmd = [AWS_CLI, *args, "--region", REGION]
    if parse_json:
        cmd += ["--output", "json"]
    using_vault = not explicit_auth and not has_aws_credentials_in_env()
    if using_vault:
        cmd = ["aws-vault", "exec", aws_vault_profile(), "--", *cmd]
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
        recovery = (
            f"if AWS SSO expired, run: aws-vault exec {aws_vault_profile()} -- true"
            if using_vault else "check the configured AWS credential provider and network"
        )
        raise AwsCliError(
            f"aws {' '.join(args[:2])} timed out after {timeout}s; {recovery}",
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
