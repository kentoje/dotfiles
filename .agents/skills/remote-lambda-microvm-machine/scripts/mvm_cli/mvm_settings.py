"""mvm settings: AWS account layout, image sizing, laptop paths. Override the env-backed ones with MVM_* vars.

Per-person values (AWS authentication, email, git name, workspace repos) are not in this public
repo: they come from the laptop settings file, read on demand by the accessors at the bottom.

Must stay compatible with macOS's /usr/bin/python3 (3.9): ssh and herdr run `mvm proxy` with a
minimal PATH where `env python3` resolves to it.
"""

import json
import os
import re
from pathlib import Path

from mvm_cli.mvm_errors import MvmError

OWNER = os.environ.get("MVM_OWNER", "kento")
REGION = os.environ.get("MVM_REGION", "eu-central-1")
# AWS CLI v2 with the `lambda-microvms` commands (2.35+). nix-darwin's comes first on PATH (see
# NIX_SYSTEM_BIN_DIR), ahead of older standalone installs in /usr/local/bin.
AWS_CLI = os.environ.get("MVM_AWS_CLI", "aws")

STACK_NAME = f"dev-microvm-{OWNER}"
IMAGE_NAME = f"dev-microvm-{OWNER}"
# Same name as the stack's ImageLogGroup; machine streams are `machine-<name>`.
MACHINE_LOG_GROUP = f"/aws/lambda-microvms/dev-microvm-{OWNER}"
BASE_IMAGE_ARN = f"arn:aws:lambda:{REGION}:aws:microvm-image:al2023-1"
# Baseline 8 GB / 4 vCPU, bursts to 32 GB / 16 vCPU, 32 GB disk.
IMAGE_MEMORY_MIB = 8192
# S3 pnpm store cache: key prefix in the artifact bucket. The stack grants the machines'
# execution role read/write under exactly this prefix and expires it (dev-microvm-stack.yaml).
PNPM_STORE_CACHE_PREFIX = "pnpm-store/"
HOOK_PORT = 9000
SSH_BRIDGE_PORT = 2222
# Each machine's dev server port (devServerPort), unique among this laptop's machines: `mvm
# forward` serves it at the same localhost port. Clear of the laptop's own cc-ext dev server
# (3002) and of cc-ext worktree ports (20000-29999, scripts/setup-worktree.sh).
DEV_SERVER_PORT_RANGE = range(3101, 3200)
MAX_LIFETIME_SECONDS = 8 * 3600

AWS_CONNECTOR_PREFIX = f"arn:aws:lambda:{REGION}:aws:network-connector:aws-network-connector"
# ALL_INGRESS cannot be combined with SHELL_INGRESS (token minting rejects it).
INGRESS_CONNECTORS = [f"{AWS_CONNECTOR_PREFIX}:HTTP_INGRESS", f"{AWS_CONNECTOR_PREFIX}:SHELL_INGRESS"]
EGRESS_CONNECTORS = [f"{AWS_CONNECTOR_PREFIX}:INTERNET_EGRESS"]

# Env vars copied by `mvm secrets push` into the MicroVM env secret (same set boxd injects).
SECRET_ENV_NAMES = [
    "AIRCALL_STAGING_EMAIL",
    "AIRCALL_STAGING_PASSWORD",
    "CI_JOB_TOKEN",
    "GEMFURY_AUTH",
    "GITLAB_TOKEN",
    "JIRA_API_TOKEN",
    "JIRA_EMAIL",
    "LLM_GATEWAY_KEY",
    "LOKALISE_API_KEY",
    "STAGING_509_PASSWORD",
    "TYPESAFE_API_KEY",
]

# Non-secret laptop config baked into the image (zip name -> laptop path). Files that look like
# they hold a token or password are refused; secrets only travel through Secrets Manager.
LAPTOP_CONFIG_FILES = {
    "jira-config.yml": Path.home() / ".config/.jira/.config.yml",
}
# Private laptop git checkouts baked into the image as git bundles (zip name -> checkout), since
# the build has no GitHub credentials. The current branch at HEAD is bundled, not the work tree.
LAPTOP_GIT_BUNDLES = {
    "herdr-vim-nav.bundle": Path.home() / "Documents/github/kentoje/herdr-vim-nav",
}
SECRET_LOOKING_LINE = re.compile(r"(?im)^\s*[\w.-]*(token|password|secret|api[_-]?key)[\w.-]*\s*[:=]\s*\S")

# The entry script, not this module: ssh's ProxyCommand, the aws-vault re-exec and the
# ~/.local/bin/mvm symlink all point at it. Resolved through that symlink.
SCRIPTS_DIR = Path(__file__).resolve().parent.parent
MVM_ENTRY_SCRIPT = SCRIPTS_DIR / "mvm"
SKILL_DIR = SCRIPTS_DIR.parent
IMAGE_DIR = SKILL_DIR / "image"
STACK_TEMPLATE = SKILL_DIR / "infra" / "dev-microvm-stack.yaml"
MVM_ON_PATH = Path.home() / ".local/bin/mvm"
# Fish completion: source next to the CLI, linked by `mvm setup` into fish's completions dir
# (gitignored in the dotfiles, like the other tool-owned completions there).
MVM_FISH_COMPLETION_SOURCE = SCRIPTS_DIR / "completions" / "mvm.fish"
MVM_FISH_COMPLETION_LINK = Path.home() / ".config/fish/completions/mvm.fish"

STATE_DIR = Path(os.environ.get("MVM_STATE_DIR", str(Path.home() / ".local/state/mvm")))
MACHINES_DIR = STATE_DIR / "machines"
# `mvm forward`: one ssh control socket (NAME.sock) and master log (NAME.log) per machine.
FORWARDS_DIR = STATE_DIR / "forwards"
SSH_KEY = Path.home() / ".ssh" / "id_ed25519_mvm"
KNOWN_HOSTS = Path.home() / ".ssh" / "known_hosts_mvm"
SSH_CONFIG = Path.home() / ".ssh" / "config"
SSH_HOST_SUFFIX = ".mvm"
# Herdr sidebar label prefix: keeps MicroVMs apart from boxd machines.
HERDR_LABEL_PREFIX = "aws-"
# tuios host name prefix: the same as herdr's label, so both sidebars name a machine alike.
TUIOS_HOST_PREFIX = HERDR_LABEL_PREFIX
# The tuios [hosts] entries for live machines. mvm owns and rewrites this whole file; tuios reads
# every config.d/*.toml next to its config.toml. ~/.config is the dotfiles checkout: gitignored.
TUIOS_MVM_HOSTS_FILE = Path(
    os.environ.get("MVM_TUIOS_HOSTS_FILE", str(Path.home() / ".config/tuios/config.d/mvm-hosts.toml"))
)
# Where the image installs tuios (image/Dockerfile): the link runs it without searching.
TUIOS_REMOTE_BINARY = "/home/dev/.local/bin/tuios"

# Prepended to PATH: nix-darwin's aws (awscli2) and websocat win over older copies elsewhere.
NIX_SYSTEM_BIN_DIR = "/run/current-system/sw/bin"
# Appended to PATH: ssh and herdr run `mvm proxy` with whatever PATH they were started with.
EXTRA_PATH_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", str(Path.home() / ".local/bin")]

# Laptop settings file: untracked JSON with the per-person values below. MVM_SETTINGS_FILE overrides the path.
MVM_LAPTOP_SETTINGS_FILE = Path.home() / ".config/mvm/settings.json"


def mvm_laptop_settings_path():
    return Path(os.environ.get("MVM_SETTINGS_FILE") or MVM_LAPTOP_SETTINGS_FILE)


def read_mvm_laptop_settings():
    """Read laptop settings on demand; an absent file is allowed for environment-only callers."""
    path = mvm_laptop_settings_path()
    try:
        settings = json.loads(path.read_text())
    except FileNotFoundError:
        settings = {}
    except (OSError, ValueError) as error:
        raise MvmError(f"mvm settings file unreadable: {path}: {error}") from None
    if not isinstance(settings, dict):
        raise MvmError(f"mvm settings file unreadable: {path}: expected a JSON object")
    return settings


def read_mvm_laptop_setting(key, env_name=None):
    """Return one required laptop setting, preferring its environment override when present."""
    if env_name and os.environ.get(env_name):
        return os.environ[env_name]
    path = mvm_laptop_settings_path()
    settings = read_mvm_laptop_settings()
    value = settings.get(key)
    if not value:
        override = f" (or set {env_name})" if env_name else ""
        raise MvmError(f"mvm settings missing {key}: add it to {path}{override}")
    return value


def aws_authentication():
    """Select persistent AWS authentication for CLI and independent SSH proxy processes.

    None preserves legacy environment/aws-vault behavior. An explicit selection never falls
    back to the personal awsVaultProfile (SSO). MVM_AWS_PROFILE allows a deliberate per-command
    profile override, such as an admin SSO profile for `mvm image build`.
    """
    override = os.environ.get("MVM_AWS_PROFILE")
    if override:
        return {"kind": "profile", "profile": override}
    settings = read_mvm_laptop_settings()
    if "awsAuthentication" not in settings:
        return None
    auth = settings["awsAuthentication"]
    if isinstance(auth, dict):
        if auth == {"kind": "default-chain"}:
            return auth
        if set(auth) == {"kind", "profile"} and auth["kind"] == "profile":
            profile = auth["profile"]
            if isinstance(profile, str) and profile.strip():
                return {"kind": "profile", "profile": profile.strip()}
    raise MvmError(
        f"mvm settings awsAuthentication invalid: {mvm_laptop_settings_path()}: "
        'use {"kind":"profile","profile":"NAME"} or {"kind":"default-chain"}'
    )


def aws_vault_profile():
    """aws-vault profile for AWS calls when awsAuthentication is unset (legacy interactive SSO)."""
    return read_mvm_laptop_setting("awsVaultProfile", "MVM_AWS_VAULT_PROFILE")


def owner_email():
    """Owner email: the stack's and image's owner tags, and git user.email on the machines."""
    return read_mvm_laptop_setting("ownerEmail", "MVM_OWNER_EMAIL")


def git_user_name():
    """git user.name on the machines (the WIP save at terminate commits with it)."""
    return read_mvm_laptop_setting("gitUserName", "MVM_GIT_USER_NAME")


def workspace_repo_paths():
    """GitLab repo paths (`group/repo`) every new machine clones; the first one is cloned and installed first."""
    repos = read_mvm_laptop_setting("workspaceRepos")
    if not isinstance(repos, list) or not all(isinstance(repo, str) and repo.strip() for repo in repos):
        raise MvmError(f"mvm settings workspaceRepos must be a list of GitLab paths: {mvm_laptop_settings_path()}")
    return [repo.strip() for repo in repos]
