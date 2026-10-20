"""Tests for machine_registry: names, records, expiry. Run: python3 -m unittest discover -s mvm_cli -p '*_test.py' -t ."""

import datetime as dt
import random
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from mvm_cli import machine_registry
from mvm_cli.mvm_errors import MvmError


class MachineNameTest(unittest.TestCase):
    def test_accepts_dns_label_style_names(self):
        for name in ["dev", "brisk-otter", "t1", "a" * 24]:
            machine_registry.validate_machine_name(name)

    def test_rejects_names_that_break_hostnames_or_refs(self):
        for name in ["", "Dev", "1dev", "dev-", "my_box", "dev.mvm", "a" * 25, "dev box"]:
            with self.assertRaises(MvmError, msg=name):
                machine_registry.validate_machine_name(name)

    def test_generated_names_are_valid_and_avoid_taken_names(self):
        rng = random.Random(7)
        taken = set()
        for _ in range(50):
            name = machine_registry.generate_machine_name(taken, rng=rng)
            machine_registry.validate_machine_name(name)
            self.assertNotIn(name, taken)
            taken.add(name)

    def test_ssh_host_round_trip(self):
        self.assertEqual(machine_registry.machine_name_from_ssh_host("brisk-otter.mvm"), "brisk-otter")
        self.assertEqual(machine_registry.ssh_host_for_machine("brisk-otter"), "brisk-otter.mvm")


class MachineRecordTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        patches = [
            mock.patch.object(machine_registry, "MACHINES_DIR", Path(self.tmp.name) / "machines"),
            mock.patch.object(machine_registry, "KNOWN_HOSTS", Path(self.tmp.name) / "known_hosts_mvm"),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_save_find_list_delete(self):
        record = machine_registry.new_machine_record("dev", "microvm-1", "e.on.aws", 3600, 3101)
        machine_registry.save_machine_record(record)
        self.assertEqual(machine_registry.find_machine_record("dev")["microvmId"], "microvm-1")
        # completions/mvm.fish reads the port with a regex on this exact formatting.
        self.assertIn('"devServerPort": 3101', machine_registry.machine_record_path("dev").read_text())
        self.assertEqual([r["name"] for r in machine_registry.list_machine_records()], ["dev"])
        machine_registry.delete_machine_record("dev")
        self.assertIsNone(machine_registry.find_machine_record("dev"))
        machine_registry.delete_machine_record("dev")  # idempotent

    def test_load_unknown_machine_raises(self):
        with self.assertRaises(MvmError):
            machine_registry.load_machine_record("ghost")

    def test_expiry_uses_ttl_and_defaults_to_eight_hours(self):
        created = dt.datetime(2026, 10, 13, 12, 0, tzinfo=dt.timezone.utc)
        record = {"createdAt": created.isoformat(), "ttlSeconds": 3600}
        self.assertEqual(machine_registry.machine_expires_at(record), created + dt.timedelta(hours=1))
        legacy = {"createdAt": created.isoformat()}
        self.assertEqual(machine_registry.machine_expires_at(legacy), created + dt.timedelta(hours=8))


if __name__ == "__main__":
    unittest.main()
