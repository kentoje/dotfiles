"""`mvm image build`: zip image/ (plus laptop settings and allowlisted laptop files), upload it, build a new image version.

Lambda runs the Dockerfile on its AL2023 base MicroVM, waits for the /ready hook, then snapshots
disk and memory. `mvm new` always starts the latest successful version.
"""

import datetime as dt
import hashlib
import json
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path

from mvm_cli.aws_cli_access import AwsCliError, image_arn, read_stack_outputs, reexec_under_aws_vault, run_aws_cli
from mvm_cli.machine_logs import print_image_build_log_tail
from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import (
    BASE_IMAGE_ARN,
    HOOK_PORT,
    IMAGE_DIR,
    IMAGE_MEMORY_MIB,
    IMAGE_NAME,
    LAPTOP_CONFIG_FILES,
    LAPTOP_GIT_BUNDLES,
    SECRET_LOOKING_LINE,
    SKILL_DIR,
    git_user_name,
    owner_email,
    workspace_repo_paths,
)

ZIP_FIXED_DATE = (2020, 1, 1, 0, 0, 0)
WORKSPACE_REPOS_HEADER = (
    "# GitLab repos cloned by mvm-bootstrap-workspace into ~/Documents/gitlab/aircall/<path>.\n"
    "# Written by `mvm image build` from workspaceRepos in the laptop's mvm settings file.\n"
    "# The first entry is cloned and installed first.\n"
)


def add_zip_entry(zf, digest, rel, data, mode, compress_type=zipfile.ZIP_DEFLATED):
    info = zipfile.ZipInfo(rel, date_time=ZIP_FIXED_DATE)
    info.external_attr = mode << 16
    info.compress_type = compress_type
    zf.writestr(info, data)
    digest.update(rel.encode() + b"\0" + data)


def is_image_context_file(path):
    """False for directories and local junk (.DS_Store, __pycache__) that must not reach the image."""
    return not (path.is_dir() or path.name == ".DS_Store" or "__pycache__" in path.parts)


def zip_image_context(dest, image_dir=IMAGE_DIR):
    """Zip IMAGE_DIR (Dockerfile at the root) keeping file modes, plus laptop-files/. Returns the sha256."""
    settings_files = laptop_settings_files()
    digest = hashlib.sha256()
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(image_dir.rglob("*")):
            if not is_image_context_file(path):
                continue
            add_zip_entry(
                zf, digest, path.relative_to(image_dir).as_posix(), path.read_bytes(), path.stat().st_mode & 0xFFFF
            )
        for zip_name, data in settings_files.items():
            add_zip_entry(zf, digest, f"laptop-files/{zip_name}", data, 0o100644)
        for zip_name, source in LAPTOP_CONFIG_FILES.items():
            data = read_laptop_config_file(source)
            if data is not None:
                add_zip_entry(zf, digest, f"laptop-files/{zip_name}", data, 0o100600)
        for zip_name, checkout in LAPTOP_GIT_BUNDLES.items():
            data = create_laptop_git_bundle(checkout)
            if data is not None:
                add_zip_entry(zf, digest, f"laptop-files/{zip_name}", data, 0o100644, zipfile.ZIP_STORED)
    return digest.hexdigest()


def laptop_settings_files():
    """Build-zip files made from the laptop settings: the machine's workspace repo list and git identity.

    Required, unlike the laptop config files: without them a machine clones nothing and the WIP
    save at terminate cannot commit. Raises MvmError naming the missing setting.
    """
    repos = "".join(f"{repo}\n" for repo in workspace_repo_paths())
    return {
        "workspace-repos.txt": (WORKSPACE_REPOS_HEADER + repos).encode(),
        "git-identity.gitconfig": git_identity_config_text().encode(),
    }


def git_identity_config_text():
    """The machine's ~/.config/git/config: [user] name and email, which git reads next to ~/.gitconfig."""
    name = quote_git_config_value(git_user_name())
    email = quote_git_config_value(owner_email())
    return f"[user]\n\tname = {name}\n\temail = {email}\n"


def quote_git_config_value(value):
    """Double-quote a git config value so `#`, `;` and surrounding spaces survive."""
    if "\n" in value:
        raise MvmError(f"git config value cannot span lines: {value!r}")
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def create_laptop_git_bundle(checkout):
    """Return a git bundle (current branch + HEAD) of a laptop checkout, or None when absent."""
    if not (checkout / ".git").exists():
        return None
    branch = subprocess.run(
        ["git", "-C", str(checkout), "symbolic-ref", "--quiet", "HEAD"], capture_output=True, text=True
    ).stdout.strip()
    with tempfile.TemporaryDirectory() as tmp:
        bundle = Path(tmp) / "repo.bundle"
        result = subprocess.run(
            [
                "git",
                "-C",
                str(checkout),
                "bundle",
                "create",
                "--quiet",
                str(bundle),
                "HEAD",
                *([branch] if branch else []),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise MvmError(f"git bundle failed for {checkout}: {result.stderr.strip()}")
        return bundle.read_bytes()


def read_laptop_config_file(source):
    """Return the bytes of an allowlisted laptop config file, or None when absent or secret-looking."""
    if not source.exists():
        return None
    data = source.read_bytes()
    if SECRET_LOOKING_LINE.search(data.decode(errors="replace")):
        log_mvm(f"not adding {source} to the image: it looks like it holds a secret")
        return None
    return data


def image_hooks_config():
    """Lifecycle hooks served by /opt/mvm/bin/mvm-hook-server (/run timeout is capped at 60s)."""
    return {
        "port": HOOK_PORT,
        "microvmHooks": {
            "run": "ENABLED",
            "runTimeoutInSeconds": 60,
            "resume": "ENABLED",
            "resumeTimeoutInSeconds": 30,
            "suspend": "ENABLED",
            "suspendTimeoutInSeconds": 60,
            "terminate": "ENABLED",
            "terminateTimeoutInSeconds": 60,
        },
        "microvmImageHooks": {"ready": "ENABLED", "readyTimeoutInSeconds": 600},
    }


def image_exists():
    try:
        run_aws_cli(["lambda-microvms", "get-microvm-image", "--image-identifier", image_arn()])
    except AwsCliError as error:
        if error.is_resource_not_found():
            return False
        raise
    return True


def cmd_image_build(args):
    """Upload image/ and build a new image version; on failure print the build log tail."""
    reexec_under_aws_vault()
    outputs = read_stack_outputs()
    git_rev = (
        subprocess.run(
            ["git", "-C", str(SKILL_DIR), "rev-parse", "--short", "HEAD"], capture_output=True, text=True
        ).stdout.strip()
        or "nogit"
    )
    with tempfile.TemporaryDirectory() as tmp:
        zip_path = Path(tmp) / "image.zip"
        digest = zip_image_context(zip_path)
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        uri = f"s3://{outputs['ArtifactBucketName']}/builds/{stamp}-{digest[:12]}.zip"
        run_aws_cli(["s3", "cp", str(zip_path), uri], parse_json=False)
        log_mvm(f"uploaded {uri} ({zip_path.stat().st_size // 1024} KiB)")

    common = [
        "--code-artifact",
        f"uri={uri}",
        "--base-image-arn",
        BASE_IMAGE_ARN,
        "--build-role-arn",
        outputs["BuildRoleArn"],
        "--hooks",
        json.dumps(image_hooks_config()),
        "--resources",
        json.dumps([{"minimumMemoryInMiB": IMAGE_MEMORY_MIB}]),
        "--cpu-configurations",
        json.dumps([{"architecture": "ARM_64"}]),
        "--additional-os-capabilities",
        "ALL",
        "--logging",
        json.dumps({"cloudWatch": {"logGroup": outputs["ImageLogGroupName"]}}),
        "--description",
        f"dotfiles {git_rev}, context {digest[:12]}, {stamp}",
    ]
    if image_exists():
        result = run_aws_cli(["lambda-microvms", "update-microvm-image", "--image-identifier", image_arn(), *common])
    else:
        result = run_aws_cli(
            [
                "lambda-microvms",
                "create-microvm-image",
                "--name",
                IMAGE_NAME,
                *common,
                "--tags",
                json.dumps({"owner": owner_email(), "purpose": "dev-microvm"}),
            ]
        )
    version = result.get("imageVersion") or result.get("version")
    log_mvm(f"build started: image {IMAGE_NAME} version {version}")
    if args.no_wait:
        return
    wait_for_image_version(version)


def wait_for_image_version(version):
    started = time.monotonic()
    last = None
    while True:
        info = run_aws_cli(
            [
                "lambda-microvms",
                "get-microvm-image-version",
                "--image-identifier",
                image_arn(),
                "--image-version",
                str(version),
            ]
        )
        state = info.get("state")
        if state != last:
            log_mvm(f"version {version}: {state} ({int(time.monotonic() - started)}s)")
            last = state
        if state == "SUCCESSFUL":
            return info
        if state == "FAILED":
            print_image_build_log_tail()
            raise MvmError(f"image build failed: {info.get('stateReason')} (build log tail above)")
        time.sleep(15)
