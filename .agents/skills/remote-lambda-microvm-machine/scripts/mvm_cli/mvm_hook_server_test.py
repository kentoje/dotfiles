"""Tests for the machine's lifecycle hook server (image/rootfs/opt/mvm/bin/mvm-hook-server).

Loads the real script as a module; its `main()` only runs under `__main__`, so importing starts nothing.
"""

import importlib.machinery
import importlib.util
import resource
import unittest
from unittest import mock

from mvm_cli.mvm_settings import IMAGE_DIR

MVM_HOOK_SERVER_SCRIPT = IMAGE_DIR / "rootfs/opt/mvm/bin/mvm-hook-server"


def load_mvm_hook_server():
    """The hook server script as a fresh module (it has no .py suffix, so name the loader explicitly)."""
    loader = importlib.machinery.SourceFileLoader("mvm_hook_server", str(MVM_HOOK_SERVER_SCRIPT))
    spec = importlib.util.spec_from_loader("mvm_hook_server", loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class RaiseOpenFilesLimitTest(unittest.TestCase):
    """The open files limit Lambda starts with (1024) makes pnpm install fail with EMFILE."""

    def setUp(self):
        self.hook_server = load_mvm_hook_server()
        self.logged = []
        self.hook_server.log_hook_event = self.logged.append

    def raise_limit_from(self, soft, hard, setrlimit_error=None):
        """Run raise_open_files_limit with RLIMIT_NOFILE at (soft, hard); return the setrlimit calls."""
        with mock.patch.object(resource, "getrlimit", return_value=(soft, hard)), mock.patch.object(
            resource, "setrlimit", side_effect=setrlimit_error
        ) as setrlimit:
            self.hook_server.raise_open_files_limit()
        return [call.args for call in setrlimit.call_args_list]

    def test_lambda_default_is_raised_for_soft_and_hard(self):
        calls = self.raise_limit_from(1024, 1024)
        limit = self.hook_server.OPEN_FILES_LIMIT
        self.assertEqual(calls, [(resource.RLIMIT_NOFILE, (limit, limit))])
        self.assertEqual(self.logged, [f"open files limit raised from 1024/1024 to {limit}"])

    def test_a_higher_hard_limit_is_never_lowered(self):
        higher = self.hook_server.OPEN_FILES_LIMIT * 2
        calls = self.raise_limit_from(1024, higher)
        self.assertEqual(calls, [(resource.RLIMIT_NOFILE, (higher, higher))])

    def test_a_limit_already_high_enough_is_left_alone(self):
        limit = self.hook_server.OPEN_FILES_LIMIT
        self.assertEqual(self.raise_limit_from(limit, limit), [])
        self.assertEqual(self.logged, [])

    def test_a_refusal_is_logged_and_does_not_stop_the_server(self):
        self.raise_limit_from(1024, 1024, setrlimit_error=PermissionError("Operation not permitted"))
        self.assertEqual(self.logged, ["open files limit stays 1024/1024: Operation not permitted"])

    def test_main_raises_the_limit_before_serving_hooks(self):
        order = []
        self.hook_server.raise_open_files_limit = lambda: order.append("raise_open_files_limit")
        server = mock.Mock()
        server.serve_forever.side_effect = lambda: order.append("serve_forever")
        self.hook_server.ThreadingHTTPServer = mock.Mock(return_value=server)
        self.hook_server.main()
        self.assertEqual(order, ["raise_open_files_limit", "serve_forever"])


if __name__ == "__main__":
    unittest.main()
