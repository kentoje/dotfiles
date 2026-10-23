"""Tests for tuios_host_sync: the hosts file it rebuilds and the `config apply` guard inside tuios."""

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from mvm_cli import tuios_host_sync


class TuiosHostSyncTest(unittest.TestCase):
    def setUp(self):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        self.hosts_file = Path(temp_dir.name) / "config.d" / "mvm-hosts.toml"
        self.records = []
        patches = [
            mock.patch.object(tuios_host_sync, "TUIOS_MVM_HOSTS_FILE", self.hosts_file),
            mock.patch.object(tuios_host_sync, "list_machine_records", side_effect=lambda: list(self.records)),
            mock.patch.object(tuios_host_sync.shutil, "which", return_value="/usr/bin/tuios"),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def test_renders_one_host_table_per_machine_sorted(self):
        text = tuios_host_sync.render_tuios_mvm_hosts(["zeta", "brisk-otter"])
        self.assertLess(text.index("[hosts.aws-brisk-otter]"), text.index("[hosts.aws-zeta]"))
        self.assertIn('addr = "brisk-otter.mvm"', text)
        self.assertIn('command = "/home/dev/.local/bin/tuios"', text)

    def test_rebuild_follows_the_records_and_leaves_no_temp_file(self):
        self.records = [{"name": "dev"}, {"name": "other"}]
        self.assertTrue(tuios_host_sync.write_tuios_mvm_hosts())
        self.assertIn("[hosts.aws-other]", self.hosts_file.read_text())
        self.records = [{"name": "dev"}]
        self.assertTrue(tuios_host_sync.write_tuios_mvm_hosts())
        self.assertNotIn("aws-other", self.hosts_file.read_text())
        self.assertEqual([p.name for p in self.hosts_file.parent.iterdir()], ["mvm-hosts.toml"])

    def test_no_file_without_tuios(self):
        with mock.patch.object(tuios_host_sync.shutil, "which", return_value=None):
            self.assertFalse(tuios_host_sync.write_tuios_mvm_hosts())
        self.assertFalse(self.hosts_file.exists())

    def add_machine(self, inside_tuios=False, daemon_ok=True, apply_output="{}"):
        """add_machine_to_tuios("dev") against a fake tuios; returns (host, tuios calls, log lines).

        The fake daemon holds the host once an apply-config call answers without an error.
        """
        self.records = [{"name": "dev"}]
        calls = []
        applied = []

        def fake_run(args, timeout=60):
            calls.append(args)
            if args[:2] == ["hosts", "test"]:
                return subprocess.CompletedProcess([], 0 if daemon_ok else 1, stdout="{}", stderr="ssh: unreachable")
            if args[:2] == ["call", "apply-config"]:
                if '"error"' not in apply_output:
                    applied.append(json.loads(args[2])["host"])
                return subprocess.CompletedProcess([], 0, stdout=apply_output, stderr="")
            hosts = [{"host": h, "addr": "dev.mvm"} for h in applied]
            return subprocess.CompletedProcess([], 0, stdout=json.dumps({"hosts": hosts}), stderr="")

        env = {k: v for k, v in os.environ.items() if k != "TUIOS_ENV"}
        if inside_tuios:
            env["TUIOS_ENV"] = "1"
        with mock.patch.dict(os.environ, env, clear=True):
            with mock.patch.object(tuios_host_sync, "run_tuios_command", side_effect=fake_run):
                with mock.patch.object(tuios_host_sync, "log_mvm") as log:
                    host = tuios_host_sync.add_machine_to_tuios("dev")
        return host, calls, [c.args[0] for c in log.call_args_list]

    def test_outside_tuios_applies_only_this_host(self):
        host, calls, logs = self.add_machine()
        self.assertEqual(host, "aws-dev")
        self.assertIn(["call", "apply-config", '{"host": "aws-dev"}'], calls)
        self.assertNotIn(["config", "apply"], calls)
        self.assertEqual(logs, ["dev: added to tuios as aws-dev"])

    def test_inside_tuios_only_explains_the_apply(self):
        host, calls, logs = self.add_machine(inside_tuios=True)
        self.assertEqual(host, "aws-dev")
        self.assertFalse([c for c in calls if c[0] in ("call", "config")])
        self.assertTrue(any("tuios config apply" in line for line in logs))

    def test_failed_daemon_start_still_applies_the_host(self):
        _, calls, logs = self.add_machine(daemon_ok=False)
        self.assertIn(["call", "apply-config", '{"host": "aws-dev"}'], calls)
        self.assertEqual(logs[-1], "dev: added to tuios as aws-dev")

    def test_refused_apply_explains_the_apply(self):
        refused = '{"error":{"code":"forbidden","message":"apply-config is for the person"}}'
        _, _, logs = self.add_machine(apply_output=refused)
        self.assertTrue(any("tuios config apply" in line for line in logs))

    def test_lists_applied_hosts_by_addr(self):
        output = '{"hosts":[{"host":"aws-dev","addr":"dev.mvm","status":"up"},{"host":"omarchy","addr":"omarchy.ts"}]}'
        done = subprocess.CompletedProcess([], 0, stdout=output, stderr="")
        with mock.patch.object(tuios_host_sync, "run_tuios_command", return_value=done):
            hosts = tuios_host_sync.list_tuios_hosts_by_addr()
        self.assertEqual(hosts["dev.mvm"], "aws-dev")


if __name__ == "__main__":
    unittest.main()
