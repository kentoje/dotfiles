"""Tests for aws_cli_access.microvm_has_ended: only AWS-confirmed ends count. Run: python3 -m unittest discover -s mvm_cli -p '*_test.py' -t ."""

import unittest
from unittest import mock

from mvm_cli import aws_cli_access
from mvm_cli.aws_cli_access import AwsCliError


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
