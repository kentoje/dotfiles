"""Tests for the shared machine registry: name reservation, compare-and-swap writes, the mirror, the creation lock."""

import contextlib
import io
import threading
import time
import unittest
from unittest import mock

from mvm_cli import machine_registry, shared_machine_registry
from mvm_cli.artifact_bucket_access import ArtifactBucketPreconditionFailed
from mvm_cli.artifact_bucket_access_test import install_fake_artifact_bucket
from mvm_cli.machine_registry_test import isolate_machine_mirror
from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings import (
    MACHINE_CREATION_LOCK_KEY,
    MACHINE_CREATION_LOCK_STALE_SECONDS,
)


def machine_record(name, microvm_id="microvm-1", port=3101):
    return {
        **machine_registry.new_machine_record(name, 3600, port),
        "microvmId": microvm_id,
    }


def isolate_shared_machine_registry(test_case):
    """A FakeArtifactBucket and a temp local mirror for one test; returns the bucket."""
    isolate_machine_mirror(test_case)
    return install_fake_artifact_bucket(test_case)


class SharedMachineRecordTest(unittest.TestCase):
    def setUp(self):
        self.bucket = isolate_shared_machine_registry(self)

    def test_create_reserves_the_name_for_every_laptop(self):
        shared_machine_registry.create_shared_machine_record(machine_record("dev"))
        self.assertEqual(self.bucket.json_at("machines/dev.json")["microvmId"], "microvm-1")
        self.assertEqual(machine_registry.find_machine_record("dev")["microvmId"], "microvm-1")
        with self.assertRaisesRegex(shared_machine_registry.MachineNameTaken, "dev already exists"):
            shared_machine_registry.create_shared_machine_record(machine_record("dev", "microvm-2"))
        self.assertEqual(self.bucket.json_at("machines/dev.json")["microvmId"], "microvm-1")

    def test_replace_only_the_version_this_laptop_wrote(self):
        etag = shared_machine_registry.create_shared_machine_record(machine_record("dev", None))
        new_etag = shared_machine_registry.replace_shared_machine_record(machine_record("dev", "microvm-1"), etag)
        with self.assertRaises(ArtifactBucketPreconditionFailed):
            shared_machine_registry.replace_shared_machine_record(machine_record("dev", "microvm-x"), etag)
        self.assertEqual(self.bucket.json_at("machines/dev.json")["microvmId"], "microvm-1")
        self.assertFalse(shared_machine_registry.delete_shared_machine_record("dev", etag))
        self.assertTrue(shared_machine_registry.delete_shared_machine_record("dev", new_etag))
        self.assertIsNone(self.bucket.get("machines/dev.json"))


class MachineRegistryMirrorTest(unittest.TestCase):
    def setUp(self):
        self.bucket = isolate_shared_machine_registry(self)

    def share_from_another_laptop(self, record):
        self.bucket.put(
            f"machines/{record['name']}.json",
            machine_registry.machine_record_bytes(record),
        )

    def test_refresh_downloads_new_and_changed_records_only(self):
        self.share_from_another_laptop(machine_record("a", "microvm-a"))
        self.share_from_another_laptop(machine_record("b", "microvm-b", 3102))
        self.assertEqual(shared_machine_registry.refresh_machine_registry_mirror(), {"a", "b"})
        self.assertEqual(machine_registry.find_machine_record("b")["microvmId"], "microvm-b")
        # `mvm rm b && mvm new b` on the other laptop: a same-size record with a new MicroVM id.
        self.share_from_another_laptop(machine_record("b", "microvm-c", 3102))
        with mock.patch.object(
            shared_machine_registry,
            "fetch_shared_machine_record",
            wraps=shared_machine_registry.fetch_shared_machine_record,
        ) as fetch:
            shared_machine_registry.refresh_machine_registry_mirror()
        self.assertEqual([call.args[0] for call in fetch.call_args_list], ["b"])
        self.assertEqual(machine_registry.find_machine_record("b")["microvmId"], "microvm-c")

    def test_refresh_never_deletes_a_local_record(self):
        machine_registry.save_machine_record(machine_record("local-only"))
        self.assertEqual(shared_machine_registry.refresh_machine_registry_mirror(), set())
        self.assertIsNotNone(machine_registry.find_machine_record("local-only"))

    def test_refresh_ignores_foreign_keys(self):
        self.bucket.put("machines/notes.txt", b"x")
        self.bucket.put("machines/Bad_Name.json", b"{}")
        self.assertEqual(shared_machine_registry.refresh_machine_registry_mirror(), set())

    def test_resolve_reads_the_mirror_then_the_shared_registry(self):
        self.assertIsNone(shared_machine_registry.resolve_machine_record("dev"))
        self.share_from_another_laptop(machine_record("dev", "microvm-a"))
        self.assertEqual(
            shared_machine_registry.resolve_machine_record("dev")["microvmId"],
            "microvm-a",
        )
        self.assertEqual(machine_registry.find_machine_record("dev")["microvmId"], "microvm-a")
        self.share_from_another_laptop(machine_record("dev", "microvm-b"))
        # The mirror answers first; FRESH asks the shared registry (the name was reused).
        self.assertEqual(
            shared_machine_registry.resolve_machine_record("dev")["microvmId"],
            "microvm-a",
        )
        self.assertEqual(
            shared_machine_registry.resolve_machine_record("dev", fresh=True)["microvmId"],
            "microvm-b",
        )

    def test_resolve_still_finds_a_record_only_this_laptop_has(self):
        machine_registry.save_machine_record(machine_record("old", "microvm-old"))
        self.assertEqual(
            shared_machine_registry.resolve_machine_record("old", fresh=True)["microvmId"],
            "microvm-old",
        )
        with self.assertRaisesRegex(MvmError, "unknown machine 'ghost'"):
            shared_machine_registry.require_machine_record("ghost")

    def test_upload_local_only_record_never_overwrites_another_laptops_name(self):
        record = machine_record("dev", "microvm-old")
        self.assertTrue(quietly(shared_machine_registry.upload_local_only_machine_record, record))
        self.share_from_another_laptop(machine_record("dev", "microvm-new"))
        self.assertFalse(quietly(shared_machine_registry.upload_local_only_machine_record, record))
        self.assertEqual(self.bucket.json_at("machines/dev.json")["microvmId"], "microvm-new")


def quietly(function, *args):
    with contextlib.redirect_stderr(io.StringIO()):
        return function(*args)


class SharedMachineCreationLockTest(unittest.TestCase):
    def setUp(self):
        self.bucket = isolate_shared_machine_registry(self)
        patcher = mock.patch.object(shared_machine_registry, "MACHINE_CREATION_LOCK_POLL_SECONDS", 0.01)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_lock_is_released_even_when_the_body_fails(self):
        with self.assertRaises(ValueError):
            with shared_machine_registry.shared_machine_creation_lock():
                self.assertIsNotNone(self.bucket.get(MACHINE_CREATION_LOCK_KEY))
                raise ValueError("boom")
        self.assertIsNone(self.bucket.get(MACHINE_CREATION_LOCK_KEY))

    def test_holders_never_overlap(self):
        inside, overlaps = [], []

        def hold():
            with (
                contextlib.redirect_stderr(io.StringIO()),
                shared_machine_registry.shared_machine_creation_lock(),
            ):
                inside.append(1)
                if len(inside) > 1:
                    overlaps.append(1)
                time.sleep(0.05)
                inside.pop()

        threads = [threading.Thread(target=hold) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(overlaps, [])
        self.assertIsNone(self.bucket.get(MACHINE_CREATION_LOCK_KEY))

    def test_stale_lock_of_a_crashed_laptop_is_taken_over(self):
        self.bucket.put(MACHINE_CREATION_LOCK_KEY, b'{"laptop": "crashed", "pid": 1}')
        self.bucket.backdate(MACHINE_CREATION_LOCK_KEY, MACHINE_CREATION_LOCK_STALE_SECONDS + 5)
        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            with shared_machine_registry.shared_machine_creation_lock():
                pass
        self.assertIn(
            "took over a stale machine creation lock from crashed (pid 1)",
            stderr.getvalue(),
        )
        self.assertIsNone(self.bucket.get(MACHINE_CREATION_LOCK_KEY))

    def test_release_never_deletes_another_holders_lock(self):
        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            with shared_machine_registry.shared_machine_creation_lock():
                # This holder hung past the stale window and another laptop took the lock over.
                self.bucket.put(MACHINE_CREATION_LOCK_KEY, b'{"laptop": "other", "pid": 2}')
        self.assertIn("taken over before this `mvm new` released it", stderr.getvalue())
        self.assertEqual(self.bucket.json_at(MACHINE_CREATION_LOCK_KEY)["laptop"], "other")

    def test_live_lock_makes_the_next_laptop_wait_then_give_up(self):
        self.bucket.put(MACHINE_CREATION_LOCK_KEY, b'{"laptop": "busy", "pid": 3}')
        with mock.patch.object(shared_machine_registry, "MACHINE_CREATION_LOCK_WAIT_SECONDS", 0.05):
            with contextlib.redirect_stderr(io.StringIO()) as stderr:
                with self.assertRaisesRegex(MvmError, "machine creation lock still held by busy"):
                    with shared_machine_registry.shared_machine_creation_lock():
                        pass
        self.assertIn("waiting for `mvm new` on busy (pid 3)", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
