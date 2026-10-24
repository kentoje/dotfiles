"""Tests for aws_cli_access.microvm_has_ended: only AWS-confirmed ends count. Run: python3 -m unittest discover -s mvm_cli -p '*_test.py' -t ."""

import json
import os
import shutil
import subprocess
import sys
import unittest
from unittest import mock

from mvm_cli import aws_cli_access
from mvm_cli.aws_cli_access import AwsCliError
from mvm_cli.mvm_settings_test import isolate_mvm_laptop_settings


class AwsCredentialProviderTest(unittest.TestCase):
    def setUp(self):
        self.settings_file = isolate_mvm_laptop_settings(self)
        env = {key: value for key, value in os.environ.items() if not key.startswith("AWS_")}
        patcher = mock.patch.dict(os.environ, env, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def select_authentication(self, auth):
        self.settings_file.write_text(json.dumps({"awsAuthentication": auth}))

    def run_fake_cli(self, result=None, error=None):
        with mock.patch.object(aws_cli_access.subprocess, "run", return_value=result, side_effect=error) as run:
            output = aws_cli_access.run_aws_cli(["sts", "get-caller-identity"])
        return output, run.call_args

    def test_profile_is_shared_with_children_and_overrides_stale_credentials(self):
        self.select_authentication({"kind": "profile", "profile": "machine"})
        # As inherited from a shell inside `aws-vault exec --server <personal-sso>`.
        os.environ.update({
            "AWS_PROFILE": "personal-sso", "AWS_ACCESS_KEY_ID": "stale", "AWS_SECRET_ACCESS_KEY": "stale",
            "AWS_SESSION_TOKEN": "stale", "AWS_WEB_IDENTITY_TOKEN_FILE": "/old/token", "AWS_ROLE_ARN": "old-role",
            "AWS_VAULT": "personal-sso", "AWS_CREDENTIAL_EXPIRATION": "2026-01-01T00:00:00Z",
            "AWS_CONTAINER_CREDENTIALS_FULL_URI": "http://127.0.0.1:1/", "AWS_CONTAINER_AUTHORIZATION_TOKEN": "stale",
        })
        with mock.patch.object(aws_cli_access.os, "execvp") as reexec:
            aws_cli_access.reexec_under_aws_vault()
        reexec.assert_not_called()
        self.assertEqual(os.environ["AWS_PROFILE"], "machine")
        for name in aws_cli_access.INHERITED_AWS_CREDENTIAL_ENV_NAMES:
            self.assertNotIn(name, os.environ)
        output, call = self.run_fake_cli(subprocess.CompletedProcess([], 0, '{"Account":"test"}', ""))
        self.assertEqual(output, {"Account": "test"})
        self.assertEqual(call.args[0][0], aws_cli_access.AWS_CLI)
        self.assertEqual(call.kwargs["env"]["AWS_PROFILE"], "machine")

    def test_default_chain_keeps_container_credentials_and_does_not_use_vault(self):
        self.select_authentication({"kind": "default-chain"})
        os.environ["AWS_CONTAINER_CREDENTIALS_FULL_URI"] = "http://localhost/credentials"
        with mock.patch.object(aws_cli_access.os, "execvp") as reexec:
            aws_cli_access.reexec_under_aws_vault()
        reexec.assert_not_called()
        _, call = self.run_fake_cli(subprocess.CompletedProcess([], 0, "{}", ""))
        self.assertEqual(call.args[0][0], aws_cli_access.AWS_CLI)
        self.assertEqual(call.kwargs["env"]["AWS_CONTAINER_CREDENTIALS_FULL_URI"], "http://localhost/credentials")

    def test_independent_ssh_proxy_uses_persistent_profile_without_flue_env(self):
        from mvm_cli.ssh_access import create_ssh_endpoint_token

        self.select_authentication({"kind": "profile", "profile": "machine"})
        result = subprocess.CompletedProcess([], 0, '{"authToken":{"X-aws-proxy-auth":"fake"}}', "")
        with mock.patch.object(aws_cli_access.subprocess, "run", return_value=result) as run:
            self.assertEqual(create_ssh_endpoint_token("microvm-test"), "fake")
        self.assertEqual(run.call_args.args[0][:3], [aws_cli_access.AWS_CLI, "lambda-microvms", "create-microvm-auth-token"])
        self.assertEqual(run.call_args.kwargs["env"]["AWS_PROFILE"], "machine")

    def test_provider_failure_never_retries_under_personal_vault(self):
        self.select_authentication({"kind": "profile", "profile": "machine"})
        result = subprocess.CompletedProcess([], 1, "", "credential_process failed")
        with mock.patch.object(aws_cli_access.subprocess, "run", return_value=result) as run:
            with self.assertRaisesRegex(AwsCliError, "credential_process failed"):
                aws_cli_access.run_aws_cli(["sts", "get-caller-identity"])
        run.assert_called_once()
        self.assertEqual(run.call_args.args[0][0], aws_cli_access.AWS_CLI)

    def test_workload_timeout_does_not_request_a_personal_sso_login(self):
        self.select_authentication({"kind": "default-chain"})
        with self.assertRaisesRegex(AwsCliError, "configured AWS credential provider") as raised:
            self.run_fake_cli(error=subprocess.TimeoutExpired("aws", 1))
        self.assertNotIn("aws-vault", str(raised.exception))

    def test_legacy_interactive_installations_still_use_vault(self):
        self.settings_file.write_text('{"awsVaultProfile":"personal"}')
        _, call = self.run_fake_cli(subprocess.CompletedProcess([], 0, "{}", ""))
        self.assertEqual(call.args[0][:5], ["aws-vault", "exec", "personal", "--", aws_cli_access.AWS_CLI])

    @unittest.skipUnless(shutil.which("aws"), "AWS CLI is needed for credential_process integration")
    def test_real_cli_resolves_fresh_process_credentials_without_sso(self):
        self.select_authentication({"kind": "profile", "profile": "machine"})
        root = self.settings_file.parent
        provider = root / "credential-provider.py"
        counter = root / "calls"
        provider.write_text(
            "import datetime,json,pathlib\n"
            f"counter=pathlib.Path({str(counter)!r})\n"
            "n=int(counter.read_text())+1 if counter.exists() else 1\n"
            "counter.write_text(str(n))\n"
            "expiry=datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=5)\n"
            "print(json.dumps(dict(Version=1,AccessKeyId='FAKE'+str(n),SecretAccessKey='fake',"
            "SessionToken='fake',Expiration=expiry.isoformat())))\n"
        )
        config = root / "aws-config"
        config.write_text(f'[profile machine]\ncredential_process = "{sys.executable}" "{provider}"\n')
        os.environ.update({
            "AWS_CONFIG_FILE": str(config), "AWS_SHARED_CREDENTIALS_FILE": str(root / "no-credentials"),
            "AWS_EC2_METADATA_DISABLED": "true", "AWS_ACCESS_KEY_ID": "stale", "AWS_SECRET_ACCESS_KEY": "stale",
        })
        first = aws_cli_access.run_aws_cli(["configure", "export-credentials", "--format", "process"], timeout=15)
        first_calls = int(counter.read_text())
        second = aws_cli_access.run_aws_cli(["configure", "export-credentials", "--format", "process"], timeout=15)
        self.assertGreater(first_calls, 0)
        self.assertGreater(int(counter.read_text()), first_calls)
        self.assertTrue(first["AccessKeyId"].startswith("FAKE"))
        self.assertTrue(second["AccessKeyId"].startswith("FAKE"))
        self.assertNotEqual(first["AccessKeyId"], second["AccessKeyId"])


class MicrovmHasEndedTest(unittest.TestCase):
    def check(self, side_effect=None, return_value=None):
        with mock.patch.object(aws_cli_access, "get_microvm", side_effect=side_effect, return_value=return_value):
            return aws_cli_access.microvm_has_ended("microvm-1")

    def test_terminated_or_terminating_or_failed_has_ended(self):
        for state in ["TERMINATED", "TERMINATING", "FAILED"]:
            self.assertTrue(self.check(return_value={"state": state}), state)

    def test_live_states_have_not_ended(self):
        for state in ["PENDING", "RUNNING", "SUSPENDING", "SUSPENDED"]:
            self.assertFalse(self.check(return_value={"state": state}), state)

    def test_not_found_has_ended(self):
        error = AwsCliError("x", stderr="An error occurred (ResourceNotFoundException) ... MicroVM not found")
        self.assertTrue(self.check(side_effect=error))

    def test_auth_or_network_errors_do_not_count_as_ended(self):
        for stderr in ["ExpiredTokenException", "Unable to locate credentials", "timeout", "AccessDenied"]:
            self.assertFalse(self.check(side_effect=AwsCliError("x", stderr=stderr)), stderr)


if __name__ == "__main__":
    unittest.main()
