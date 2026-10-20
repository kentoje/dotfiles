"""Tests for the `mvm proxy` cleanup path (herdr reconnects to ended machines)."""

import sys
import unittest
from contextlib import ExitStack
from unittest import mock

from mvm_cli import ssh_access
from mvm_cli.aws_cli_access import AwsCliError
from mvm_cli.mvm_errors import MvmError


class ProxyCleanupTest(unittest.TestCase):
    def run_proxy(self, record, token_error, has_ended):
        forget = mock.Mock(return_value=True)
        remove_from_herdr = mock.Mock(return_value=0)
        with ExitStack() as stack:
            stack.enter_context(mock.patch.object(ssh_access, "find_machine_record", return_value=record))
            stack.enter_context(mock.patch.object(ssh_access, "create_ssh_endpoint_token", side_effect=token_error))
            stack.enter_context(mock.patch.object(ssh_access, "microvm_has_ended", return_value=has_ended))
            stack.enter_context(mock.patch.object(ssh_access, "forget_ended_machine", forget))
            stack.enter_context(mock.patch.object(ssh_access, "remove_machine_from_herdr", remove_from_herdr))
            raised = stack.enter_context(self.assertRaises(MvmError))
            ssh_access.cmd_proxy(mock.Mock(host="dev.mvm"))
        return raised.exception, forget, remove_from_herdr

    def test_ended_machine_is_forgotten(self):
        error, forget, _ = self.run_proxy({"microvmId": "m1"}, AwsCliError("x", stderr="Conflict"), True)
        forget.assert_called_once_with("dev", "m1")
        self.assertIn("has ended", str(error))

    def test_expired_sso_keeps_everything(self):
        error, forget, remove = self.run_proxy({"microvmId": "m1"}, AwsCliError("x", stderr="timeout"), False)
        forget.assert_not_called()
        remove.assert_not_called()
        self.assertIsInstance(error, AwsCliError)

    def test_unknown_machine_drops_its_herdr_entry(self):
        _, forget, remove = self.run_proxy(None, None, False)
        remove.assert_called_once_with("dev")
        forget.assert_not_called()


class ProxyBridgeFailureTest(unittest.TestCase):
    """Lambda mints tokens for terminated MicroVMs, so an ended machine shows up as a websocat failure."""

    def run_bridge(self, websocat_exit_code, has_ended, forgotten=True):
        forget = mock.Mock(return_value=forgotten)
        has_ended_check = mock.Mock(return_value=has_ended)
        with ExitStack() as stack:
            stack.enter_context(
                mock.patch.object(
                    ssh_access, "find_machine_record", return_value={"microvmId": "m1", "endpoint": "e.example"}
                )
            )
            stack.enter_context(mock.patch.object(ssh_access, "create_ssh_endpoint_token", return_value="tok"))
            stack.enter_context(mock.patch.object(ssh_access.shutil, "which", return_value="/bin/websocat"))
            stack.enter_context(mock.patch.object(ssh_access, "run_websocat_bridge", return_value=websocat_exit_code))
            stack.enter_context(mock.patch.object(ssh_access, "microvm_has_ended", has_ended_check))
            stack.enter_context(mock.patch.object(ssh_access, "forget_ended_machine", forget))
            try:
                ssh_access.cmd_proxy(mock.Mock(host="dev.mvm"))
            except (MvmError, SystemExit) as raised:
                return raised, forget, has_ended_check
        self.fail("cmd_proxy returned without exiting")

    def test_bridge_failure_on_ended_machine_forgets_it(self):
        raised, forget, _ = self.run_bridge(1, True)
        forget.assert_called_once_with("dev", "m1")
        self.assertIsInstance(raised, MvmError)
        self.assertIn("has ended", str(raised))

    def test_stale_proxy_for_a_reused_name_reports_it(self):
        raised, forget, _ = self.run_bridge(1, True, forgotten=False)
        forget.assert_called_once_with("dev", "m1")
        self.assertIn("was recreated", str(raised))

    def test_bridge_failure_on_live_machine_keeps_it(self):
        raised, forget, _ = self.run_bridge(1, False)
        forget.assert_not_called()
        self.assertEqual(raised.code, 1)

    def test_clean_exit_and_ssh_hangup_skip_the_aws_check(self):
        for exit_code, wanted in [(0, 0), (-1, 129)]:
            raised, forget, has_ended_check = self.run_bridge(exit_code, True)
            has_ended_check.assert_not_called()
            forget.assert_not_called()
            self.assertEqual(raised.code, wanted)


class RunWebsocatBridgeTest(unittest.TestCase):
    def test_returns_child_exit_code(self):
        with ExitStack() as stack:
            for forwarded_signal in (ssh_access.signal.SIGHUP, ssh_access.signal.SIGTERM, ssh_access.signal.SIGINT):
                previous = ssh_access.signal.getsignal(forwarded_signal)
                stack.callback(ssh_access.signal.signal, forwarded_signal, previous)
            self.assertEqual(ssh_access.run_websocat_bridge([sys.executable, "-c", "raise SystemExit(3)"]), 3)


class SshConfigBlockTest(unittest.TestCase):
    def test_proxy_command_runs_the_entry_script_not_a_module(self):
        block = ssh_access.render_ssh_config_block()
        self.assertIn(f"ProxyCommand {ssh_access.MVM_ENTRY_SCRIPT} proxy %h", block)
        self.assertTrue(str(ssh_access.MVM_ENTRY_SCRIPT).endswith("/scripts/mvm"))


if __name__ == "__main__":
    unittest.main()
