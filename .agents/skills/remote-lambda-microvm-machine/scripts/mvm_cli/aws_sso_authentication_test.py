"""SSO recovery tests: bounded browser login, safe provider selection, and cross-process coordination."""

import fcntl
import io
import json
import os
import subprocess
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from mvm_cli import aws_sso_authentication as sso
from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings_test import isolate_mvm_laptop_settings

EXPIRED_SSO = "Error when retrieving token from sso: Token has expired and refresh failed"


class AwsSsoAuthenticationTest(unittest.TestCase):
    def setUp(self):
        self.settings_file = isolate_mvm_laptop_settings(self)
        self.root = self.settings_file.parent
        self.settings_file.write_text(json.dumps({"awsAuthentication": {"kind": "profile", "profile": "machine"}}))
        self.config = self.root / "aws-config"
        self.config.write_text("[profile machine]\nsso_session = shared\n")
        env = mock.patch.dict(os.environ, {"AWS_CONFIG_FILE": str(self.config)})
        env.start()
        self.addCleanup(env.stop)
        state = mock.patch.object(sso, "STATE_DIR", self.root / "state")
        state.start()
        self.addCleanup(state.stop)
        self.login_command = [sso.AWS_CLI, "sso", "login", "--sso-session", "shared"]

    def cli_result(self, status=0, stdout="", stderr=""):
        return subprocess.CompletedProcess([], status, stdout, stderr)

    def test_selects_the_session_for_expired_invalid_and_missing_sso_tokens(self):
        for stderr in [EXPIRED_SSO, "The SSO session associated with this profile has expired",
                       "Error loading SSO Token: Token for shared does not exist",
                       "Token for shared does not exist",
                       "UnauthorizedException when calling GetRoleCredentials: session token is invalid"]:
            with self.subTest(stderr=stderr):
                self.assertEqual(sso.aws_sso_login_command(stderr), self.login_command)

    def test_legacy_and_default_sso_profiles_use_the_right_selector(self):
        self.config.write_text("[profile machine]\nsso_start_url = https://example.awsapps.com/start\n")
        self.assertEqual(sso.aws_sso_login_command(EXPIRED_SSO), [sso.AWS_CLI, "sso", "login", "--profile", "machine"])
        self.settings_file.write_text('{"awsAuthentication":{"kind":"profile","profile":"default"}}')
        self.config.write_text("[default]\nsso_session = shared\n")
        self.assertEqual(sso.aws_sso_login_command(EXPIRED_SSO), self.login_command)

    def test_non_sso_providers_and_unreadable_config_never_launch_sso_login(self):
        for config in ["", "[profile machine]\ncredential_process = provider\n",
                       "[profile machine]\nsso_session = shared\ncredential_process = provider\n",
                       "[profile machine]\nrole_arn = arn:aws:iam::123:role/test\n", "bad ini"]:
            with self.subTest(config=config):
                self.config.write_text(config)
                self.assertIsNone(sso.aws_sso_login_command(EXPIRED_SSO))
        self.settings_file.write_text('{"awsAuthentication":{"kind":"default-chain"}}')
        self.assertIsNone(sso.aws_sso_login_command(EXPIRED_SSO))

    def test_login_is_bounded_and_never_leaks_credentials_or_browser_urls(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        results = [self.cli_result(255), self.cli_result(stdout="private browser URL")]
        with mock.patch.object(sso.subprocess, "run", side_effect=results) as run, \
                redirect_stdout(stdout), redirect_stderr(stderr):
            sso.renew_aws_sso_session(self.login_command, timeout=300)
        self.assertEqual(run.call_count, 2)
        self.assertEqual(run.call_args.args[0], self.login_command)
        self.assertLessEqual(run.call_args.kwargs["timeout"], 30)
        self.assertEqual(run.call_args.kwargs["stdin"], subprocess.DEVNULL)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("renewing in the laptop browser", stderr.getvalue())
        self.assertNotIn("private browser URL", stderr.getvalue())
        lock = next((self.root / "state" / "aws-sso").glob("*.lock"))
        self.assertEqual(set(json.loads(lock.read_text())), {"attemptedAt"})

    def test_another_process_or_manual_login_can_already_have_restored_credentials(self):
        stdout = io.StringIO()
        with mock.patch.object(sso.subprocess, "run", return_value=self.cli_result(stdout="secret credentials")) as run, \
                redirect_stdout(stdout):
            sso.renew_aws_sso_session(self.login_command)
        run.assert_called_once()
        self.assertIn("export-credentials", run.call_args.args[0])
        self.assertEqual(stdout.getvalue(), "")

    def test_login_failure_has_manual_fallback_and_a_cooldown_but_manual_login_works(self):
        results = [self.cli_result(255), self.cli_result(1), self.cli_result(255), self.cli_result()]
        with mock.patch.object(sso.subprocess, "run", side_effect=results) as run:
            with self.assertRaisesRegex(MvmError, "status 1; run on the laptop: .* --sso-session shared"):
                sso.renew_aws_sso_session(self.login_command)
            with self.assertRaisesRegex(MvmError, "automatic retries paused for 60s"):
                sso.renew_aws_sso_session(self.login_command)
            sso.renew_aws_sso_session(self.login_command)
        self.assertEqual(sum(call.args[0] == self.login_command for call in run.call_args_list), 1)

    def test_login_timeout_and_unavailable_cli_report_a_manual_command(self):
        with mock.patch.object(sso.subprocess, "run", side_effect=[self.cli_result(255), subprocess.TimeoutExpired("aws", 1)]):
            with self.assertRaisesRegex(MvmError, "sign-in did not complete within 1s; run on the laptop:"):
                sso.renew_aws_sso_session(self.login_command, timeout=1)
        with mock.patch.object(sso.subprocess, "run", side_effect=FileNotFoundError("aws executable missing")):
            with self.assertRaisesRegex(MvmError, "aws executable missing; run on the laptop:"):
                sso.renew_aws_sso_session(self.login_command)

    def test_waiting_for_another_login_is_also_bounded(self):
        with mock.patch.object(sso.fcntl, "flock", side_effect=BlockingIOError), \
                mock.patch.object(sso.subprocess, "run") as run:
            with self.assertRaisesRegex(MvmError, "sign-in did not complete within 0.01s"):
                sso.renew_aws_sso_session(self.login_command, timeout=0.01)
        run.assert_not_called()

    def test_manual_command_quotes_session_names(self):
        command = [sso.AWS_CLI, "sso", "login", "--sso-session", "session with spaces"]
        self.assertIn("--sso-session 'session with spaces'", sso.aws_sso_manual_login_hint(command))


class AwsSsoProcessRecoveryTest(unittest.TestCase):
    """Run real MVM Python processes with a local fake AWS executable; never contact AWS."""

    def setUp(self):
        self.settings_file = isolate_mvm_laptop_settings(self)
        self.root = self.settings_file.parent
        self.settings_file.write_text('{"awsAuthentication":{"kind":"profile","profile":"machine"}}')
        config = self.root / "aws-config"
        config.write_text("[profile machine]\nsso_session = shared\n")
        fake_aws = self.root / "aws"
        fake_aws.write_text(
            f"#!{sys.executable}\n"
            "import json,os,pathlib,sys,time\n"
            "root=pathlib.Path(os.environ['FAKE_AWS_ROOT'])\n"
            "ready=root/'credentials-ready'\n"
            "if sys.argv[1:3]==['sso','login']:\n"
            " with (root/'login-calls').open('a') as f: f.write('login\\n')\n"
            " time.sleep(float(os.environ.get('FAKE_AWS_LOGIN_DELAY','0.3')))\n"
            " status=int(os.environ.get('FAKE_AWS_LOGIN_STATUS','0'))\n"
            " if status==0: ready.touch()\n"
            " print('private browser URL')\n"
            " sys.exit(status)\n"
            "if not ready.exists():\n"
            f" print({EXPIRED_SSO!r},file=sys.stderr)\n"
            " sys.exit(255)\n"
            "if sys.argv[1:3]==['configure','export-credentials']:\n"
            " print(json.dumps({'AccessKeyId':'SECRET-MUST-NOT-LEAK'}))\n"
            "else: print(json.dumps({'Account':'fake-account'}))\n"
        )
        fake_aws.chmod(0o700)
        self.env = {key: value for key, value in os.environ.items() if not key.startswith(('AWS_', 'MVM_AWS_'))}
        self.env.update({
            "MVM_AWS_CLI": str(fake_aws), "MVM_SETTINGS_FILE": str(self.settings_file),
            "MVM_STATE_DIR": str(self.root / "state"), "AWS_CONFIG_FILE": str(config),
            "AWS_SHARED_CREDENTIALS_FILE": str(self.root / "no-credentials"),
            "FAKE_AWS_ROOT": str(self.root),
        })
        self.worker_code = (
            "from mvm_cli.aws_cli_access import run_aws_cli\n"
            "print(run_aws_cli(['sts','get-caller-identity'],timeout=2)['Account'])\n"
        )

    def start_worker(self, code=None):
        worker = subprocess.Popen(
            [sys.executable, "-c", code or self.worker_code], env=self.env,
            cwd=Path(__file__).resolve().parent.parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        def cleanup():
            if worker.poll() is None:
                worker.kill()
                worker.communicate()
        self.addCleanup(cleanup)
        return worker

    def test_two_processes_share_one_login_and_both_retry_successfully(self):
        workers = [self.start_worker(), self.start_worker()]
        for worker in workers:
            stdout, stderr = worker.communicate(timeout=10)
            self.assertEqual(worker.returncode, 0, stderr)
            self.assertEqual(stdout, "fake-account\n")
            self.assertNotIn("SECRET-MUST-NOT-LEAK", stderr)
            self.assertNotIn("private browser URL", stderr)
        self.assertEqual((self.root / "login-calls").read_text(), "login\n")

    def test_a_failed_login_is_shared_across_processes_and_releases_the_lock(self):
        self.env['FAKE_AWS_LOGIN_STATUS'] = '1'
        for _ in range(2):
            worker = self.start_worker()
            stdout, stderr = worker.communicate(timeout=10)
            self.assertNotEqual(worker.returncode, 0)
            self.assertEqual(stdout, "")
            self.assertIn("run on the laptop:", stderr)
            self.assertIn("--sso-session shared", stderr)
        self.assertEqual((self.root / "login-calls").read_text(), "login\n")
        # A completed manual login works immediately, despite the failed automatic attempt.
        (self.root / "credentials-ready").touch()
        worker = self.start_worker()
        stdout, stderr = worker.communicate(timeout=10)
        self.assertEqual(worker.returncode, 0, stderr)
        self.assertEqual(stdout, "fake-account\n")
        lock = next((self.root / "state" / "aws-sso").glob("*.lock"))
        with lock.open() as handle:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_a_slow_browser_login_is_killed_and_returns_a_manual_fallback(self):
        self.env['FAKE_AWS_LOGIN_DELAY'] = '10'
        worker = self.start_worker(
            "from mvm_cli.aws_cli_access import run_aws_cli\n"
            "run_aws_cli(['sts','get-caller-identity'],timeout=0.5)\n"
        )
        stdout, stderr = worker.communicate(timeout=5)
        self.assertNotEqual(worker.returncode, 0)
        self.assertEqual(stdout, "")
        self.assertIn("sign-in did not complete within 0.5s; run on the laptop:", stderr)
        self.assertFalse((self.root / "credentials-ready").exists())


if __name__ == "__main__":
    unittest.main()
