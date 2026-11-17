"""Streaming machine logs renew credentials before replacing MVM with the AWS CLI."""

import unittest
from types import SimpleNamespace
from unittest import mock

from mvm_cli import machine_logs


class MachineLogsAuthenticationTest(unittest.TestCase):
    def test_credentials_are_checked_before_the_streaming_cli_starts(self):
        calls = mock.Mock()
        with mock.patch.object(machine_logs, "reexec_under_aws_vault", calls.authenticate), \
                mock.patch.object(machine_logs, "run_aws_cli", calls.credentials), \
                mock.patch.object(machine_logs.os, "execvp", calls.stream):
            machine_logs.cmd_logs(SimpleNamespace(name="dev", since="1h", follow=True))
        self.assertEqual([call[0] for call in calls.mock_calls], ["authenticate", "credentials", "stream"])
        calls.credentials.assert_called_once_with(["configure", "export-credentials", "--format", "process"], timeout=30)
        self.assertIn("--follow", calls.stream.call_args.args[1])


if __name__ == "__main__":
    unittest.main()
