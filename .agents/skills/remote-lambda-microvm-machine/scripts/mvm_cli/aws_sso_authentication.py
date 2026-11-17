"""Renew expired AWS SSO sessions on the laptop, sharing one browser login across MVM processes."""

import configparser
import fcntl
import hashlib
import json
import os
import shlex
import subprocess
import time
from pathlib import Path

from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import AWS_CLI, STATE_DIR, aws_authentication

AWS_SSO_RECOVERY_TIMEOUT_SECONDS = 30
AWS_SSO_LOGIN_COOLDOWN_SECONDS = 60


def aws_sso_login_command(stderr):
    """Return a login argv only for an expired/missing token from a configured SSO profile.

    A credential_process or workload role must never trigger a personal SSO login. Prefer
    the shared sso-session; legacy SSO profiles can still renew with --profile.
    """
    lowered = stderr.lower()
    sso_error = "sso" in lowered or "getrolecredentials" in lowered
    missing_token = "token for " in lowered and "does not exist" in lowered
    if not missing_token and not (
        sso_error and any(word in lowered for word in (
            "expired", "invalid", "does not exist", "not found", "unauthorized", "refresh failed",
        ))
    ):
        return None
    auth = aws_authentication()
    if not auth or auth["kind"] != "profile":
        return None
    config = configparser.RawConfigParser()
    try:
        config.read(Path(os.environ.get("AWS_CONFIG_FILE", "~/.aws/config")).expanduser())
    except (OSError, configparser.Error):
        return None
    profile = auth["profile"]
    section = "default" if profile == "default" else f"profile {profile}"
    if config.has_option(section, "credential_process"):
        return None
    session = config.get(section, "sso_session", fallback="").strip()
    if session:
        return [AWS_CLI, "sso", "login", "--sso-session", session]
    if config.has_option(section, "sso_start_url"):
        return [AWS_CLI, "sso", "login", "--profile", profile]
    return None


def aws_sso_manual_login_hint(login_command):
    """A shell-quoted fallback command for the user after automatic SSO recovery fails."""
    return f"run on the laptop: {shlex.join(login_command)}; then retry your MVM/SSH command"


def _sso_remaining_seconds(deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("SSO recovery deadline reached")
    return remaining


def renew_aws_sso_session(login_command, timeout=AWS_SSO_RECOVERY_TIMEOUT_SECONDS):
    """Try browser login once within TIMEOUT seconds; raise MvmError with a manual fallback.

    The session lock covers credential recheck and login. A 60-second cooldown also prevents
    reconnects from repeatedly opening the browser when a person really needs to sign in.
    The lock file stores only an attempt timestamp, never AWS credentials or login URLs.
    """
    timeout = min(timeout, AWS_SSO_RECOVERY_TIMEOUT_SECONDS)
    deadline = time.monotonic() + timeout
    config_path = str(Path(os.environ.get("AWS_CONFIG_FILE", "~/.aws/config")).expanduser().resolve())
    session_key = hashlib.sha256(json.dumps([config_path, login_command[3:]]).encode()).hexdigest()
    lock_dir = STATE_DIR / "aws-sso"
    fallback = aws_sso_manual_login_hint(login_command)

    def login_error(reason):
        return MvmError(f"AWS SSO automatic login failed: {reason}; {fallback}")

    try:
        lock_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        # Never unlink a flock file: another process may already be waiting on its inode.
        fd = os.open(lock_dir / f"{session_key}.lock", os.O_CREAT | os.O_RDWR, 0o600)
        with os.fdopen(fd, "r+", encoding="utf-8") as lock:
            while True:
                _sso_remaining_seconds(deadline)
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    time.sleep(min(0.1, _sso_remaining_seconds(deadline)))

            env = {**os.environ, "AWS_PAGER": "", "AWS_CLI_AUTO_PROMPT": "off"}
            # Another MVM process (or a manual login) may already have renewed this session.
            # Capture and discard the export: credentials must never reach stdout or the lock.
            credentials = subprocess.run(
                [AWS_CLI, "configure", "export-credentials", "--profile", aws_authentication()["profile"],
                 "--format", "process"],
                capture_output=True, text=True, stdin=subprocess.DEVNULL, env=env,
                timeout=min(5, _sso_remaining_seconds(deadline)),
            )
            if credentials.returncode == 0:
                return
            try:
                attempted_at = json.load(lock).get("attemptedAt", 0)
            except (ValueError, AttributeError):
                attempted_at = 0
            if isinstance(attempted_at, (int, float)) and 0 <= time.time() - attempted_at < AWS_SSO_LOGIN_COOLDOWN_SECONDS:
                raise login_error("a recent login attempt did not restore credentials (automatic retries paused for 60s)")

            lock.seek(0)
            json.dump({"attemptedAt": time.time()}, lock)
            lock.truncate()
            lock.flush()
            log_mvm("AWS SSO session expired or missing; renewing in the laptop browser")
            login = subprocess.run(
                login_command, capture_output=True, text=True, stdin=subprocess.DEVNULL, env=env,
                timeout=_sso_remaining_seconds(deadline),
            )
            if login.returncode != 0:
                raise login_error(f"aws sso login exited with status {login.returncode}")
    except (subprocess.TimeoutExpired, TimeoutError):
        raise login_error(f"sign-in did not complete within {timeout:g}s") from None
    except OSError as error:
        raise login_error(str(error)) from None
