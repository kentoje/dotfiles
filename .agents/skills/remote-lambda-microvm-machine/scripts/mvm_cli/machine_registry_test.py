"""Tests for machine_registry: names, the local mirror, expiry. Run: python3 -m unittest discover -s mvm_cli -p '*_test.py' -t ."""

import datetime as dt
import hashlib
import random
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from mvm_cli import machine_registry
from mvm_cli.mvm_errors import MvmError


def isolate_machine_mirror(test_case):
    """Point the local mirror (machines/) and known_hosts_mvm at a temp dir for one test; returns the machines dir.

    Keeps tests away from the real ~/.local/state/mvm.
    """
    tmp = tempfile.TemporaryDirectory()
    test_case.addCleanup(tmp.cleanup)
    machines_dir = Path(tmp.name) / "machines"
    for name, value in (
        ("MACHINES_DIR", machines_dir),
        ("KNOWN_HOSTS", Path(tmp.name) / "known_hosts_mvm"),
    ):
        patcher = mock.patch.object(machine_registry, name, value)
        patcher.start()
        test_case.addCleanup(patcher.stop)
    return machines_dir


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
        isolate_machine_mirror(self)

    def test_save_find_list_delete(self):
        record = {
            **machine_registry.new_machine_record("dev", 3600, 3101),
            "microvmId": "microvm-1",
        }
        machine_registry.save_machine_record(record)
        self.assertEqual(machine_registry.find_machine_record("dev")["microvmId"], "microvm-1")
        # completions/mvm.fish reads the port with a regex on this exact formatting.
        self.assertIn('"devServerPort": 3101', machine_registry.machine_record_path("dev").read_text())
        self.assertEqual([r["name"] for r in machine_registry.list_machine_records()], ["dev"])
        machine_registry.delete_machine_record("dev")
        self.assertIsNone(machine_registry.find_machine_record("dev"))
        machine_registry.delete_machine_record("dev")  # idempotent

    def test_new_record_is_a_reservation_until_it_has_a_microvm(self):
        record = machine_registry.new_machine_record("dev", 3600, 3101)
        self.assertTrue(machine_registry.is_machine_reservation(record))
        self.assertEqual(record["createdOn"], machine_registry.LAPTOP_NAME)
        self.assertFalse(
            machine_registry.is_machine_reservation(
                {**record, "microvmId": "microvm-1"}
            )
        )

    def test_mirror_etag_is_the_md5_of_the_shared_bytes(self):
        record = machine_registry.new_machine_record("dev", 3600, 3101)
        machine_registry.save_machine_record(record)
        expected = (
            '"'
            + hashlib.md5(machine_registry.machine_record_bytes(record)).hexdigest()
            + '"'
        )
        self.assertEqual(machine_registry.mirrored_machine_record_etag("dev"), expected)
        self.assertIsNone(machine_registry.mirrored_machine_record_etag("ghost"))

    def test_expiry_uses_ttl_and_defaults_to_eight_hours(self):
        created = dt.datetime(2026, 10, 13, 12, 0, tzinfo=dt.timezone.utc)
        record = {"createdAt": created.isoformat(), "ttlSeconds": 3600}
        self.assertEqual(machine_registry.machine_expires_at(record), created + dt.timedelta(hours=1))
        legacy = {"createdAt": created.isoformat()}
        self.assertEqual(machine_registry.machine_expires_at(legacy), created + dt.timedelta(hours=8))


if __name__ == "__main__":
    unittest.main()
