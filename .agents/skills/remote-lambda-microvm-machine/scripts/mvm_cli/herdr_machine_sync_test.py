"""Tests for herdr_machine_sync: herdr listing parsing and targeted removal."""

import subprocess
import unittest
from unittest import mock

from mvm_cli import herdr_machine_sync


def herdr_profile(name, profile_id=None):
    return {"id": profile_id or f"id-{name}", "label": f"aws-{name}", "target": f"{name}.mvm"}


class HerdrMachineSyncTest(unittest.TestCase):
    def test_lists_only_mvm_targets(self):
        output = '[{"id":"a","label":"aws-dev","target":"dev.mvm"},{"id":"b","label":"box","target":"x.boxd"}]'
        done = subprocess.CompletedProcess([], 0, stdout=output, stderr="")
        with mock.patch.object(herdr_machine_sync, "run_herdr_machine_command", return_value=done):
            self.assertEqual([p["id"] for p in herdr_machine_sync.list_herdr_mvm_profiles()], ["a"])

    def test_failed_or_missing_herdr_listing_is_unknown_not_empty(self):
        failed = subprocess.CompletedProcess([], 1, stdout="", stderr="boom")
        for result in [None, failed]:
            with mock.patch.object(herdr_machine_sync, "run_herdr_machine_command", return_value=result):
                self.assertIsNone(herdr_machine_sync.list_herdr_mvm_profiles())

    def test_remove_targets_only_that_machine(self):
        calls = []

        def fake_run(args, timeout=60):
            calls.append(args)
            return subprocess.CompletedProcess([], 0, stdout="", stderr="")

        profiles = [herdr_profile("dev", "p1"), herdr_profile("other", "p2"), herdr_profile("dev", "p3")]
        with mock.patch.object(herdr_machine_sync, "run_herdr_machine_command", side_effect=fake_run):
            self.assertEqual(herdr_machine_sync.remove_machine_from_herdr("dev", profiles), 2)
        self.assertEqual(calls, [["remove", "p1"], ["remove", "p3"]])

    def test_label_prefix(self):
        self.assertEqual(herdr_machine_sync.herdr_label_for_machine("dev"), "aws-dev")


if __name__ == "__main__":
    unittest.main()
