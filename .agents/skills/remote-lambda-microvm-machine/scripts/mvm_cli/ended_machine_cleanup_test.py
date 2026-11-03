"""Tests for prune_ended_machines and forget_ended_machine: fail closed, and never forget another laptop's newer machine."""

import contextlib
import datetime as dt
import io
import unittest
from unittest import mock

from mvm_cli import ended_machine_cleanup, machine_registry
from mvm_cli.mvm_settings import ABANDONED_RESERVATION_SECONDS
from mvm_cli.shared_machine_registry import create_shared_machine_record
from mvm_cli.shared_machine_registry_test import (
    isolate_shared_machine_registry,
    machine_record,
)


def herdr_profile(name, profile_id=None):
    return {"id": profile_id or f"id-{name}", "label": f"aws-{name}", "target": f"{name}.mvm"}


class SharedRegistryFakesTestCase(unittest.TestCase):
    """A fake bucket and temp mirror holding `live` and `gone`, plus herdr and forward fakes (no tests of its own)."""

    def setUp(self):
        self.bucket = isolate_shared_machine_registry(self)
        for name in ["live", "gone"]:
            create_shared_machine_record(machine_record(name, f"m-{name}"))
        self.removed_from_herdr = []
        self.stopped_forwards = []
        self.closed_tuios_sessions = []
        self.tuios_sessions = []
        patches = [
            # Never the live tuios daemon: it holds this laptop's real sessions.
            mock.patch.object(
                ended_machine_cleanup,
                "close_tuios_session_for_machine",
                side_effect=lambda name: self.closed_tuios_sessions.append(name) or True,
            ),
            mock.patch.object(
                ended_machine_cleanup, "list_tuios_machine_sessions", side_effect=lambda: list(self.tuios_sessions)
            ),
            mock.patch.object(
                ended_machine_cleanup,
                "forget_machine_port_forwards",
                side_effect=self.stopped_forwards.append,
            ),
            mock.patch.object(
                ended_machine_cleanup,
                "remove_machine_from_herdr",
                side_effect=lambda name, profiles=None: self.removed_from_herdr.append(name),
            ),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def shared_names(self):
        return sorted(item["key"] for item in self.bucket.list("machines/"))

    def mirrored_names(self):
        return [record["name"] for record in machine_registry.list_machine_records()]


class PruneEndedMachinesTest(SharedRegistryFakesTestCase):
    def prune(self, listing, has_ended, herdr_profiles):
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(ended_machine_cleanup, "microvm_has_ended", side_effect=has_ended))
            stack.enter_context(
                mock.patch.object(ended_machine_cleanup, "list_herdr_mvm_profiles", return_value=herdr_profiles)
            )
            stack.enter_context(contextlib.redirect_stderr(io.StringIO()))
            return ended_machine_cleanup.prune_ended_machines(listing)

    def test_forgets_only_machines_aws_confirms_ended_on_every_laptop(self):
        listing = [
            {"microvmId": "m-live", "state": "RUNNING"},
            {"microvmId": "m-gone", "state": "TERMINATED"},
        ]
        pruned = self.prune(
            listing,
            lambda mid: mid == "m-gone",
            [herdr_profile("live"), herdr_profile("gone")],
        )
        self.assertEqual(pruned, ["gone"])
        self.assertEqual(self.shared_names(), ["machines/live.json"])
        self.assertEqual(self.mirrored_names(), ["live"])
        self.assertEqual(self.removed_from_herdr, ["gone"])

    def test_absent_from_listing_but_unconfirmed_is_kept(self):
        # e.g. an AWS hiccup: the listing came back empty and get-microvm failed on auth.
        pruned = self.prune([], lambda mid: False, [herdr_profile("live"), herdr_profile("gone")])
        self.assertEqual(pruned, [])
        self.assertEqual(
            self.shared_names(), ["machines/gone.json", "machines/live.json"]
        )
        self.assertEqual(self.removed_from_herdr, [])

    def test_name_reused_by_another_laptop_during_the_check_is_kept(self):
        # Another laptop ran `mvm rm gone && mvm new gone` while this prune asked AWS about the old MicroVM.
        def has_ended(mid):
            self.bucket.delete("machines/gone.json")
            self.bucket.put(
                "machines/gone.json",
                machine_registry.machine_record_bytes(machine_record("gone", "m-new")),
            )
            return mid == "m-gone"

        listing = [{"microvmId": "m-live", "state": "RUNNING"}, {"microvmId": "m-new", "state": "RUNNING"}]
        pruned = self.prune(listing, has_ended, [herdr_profile("live"), herdr_profile("gone")])
        self.assertEqual(pruned, [])
        self.assertEqual(
            self.bucket.json_at("machines/gone.json")["microvmId"], "m-new"
        )
        self.assertEqual(
            machine_registry.find_machine_record("gone")["microvmId"], "m-new"
        )
        self.assertEqual(self.removed_from_herdr, [])

    def test_machines_of_other_laptops_appear_in_the_mirror(self):
        other = machine_record("other", "m-other", 3105)
        self.bucket.put(
            "machines/other.json", machine_registry.machine_record_bytes(other)
        )
        listing = [
            {"microvmId": mid, "state": "RUNNING"}
            for mid in ["m-live", "m-gone", "m-other"]
        ]
        self.prune(listing, lambda mid: False, [])
        self.assertEqual(
            machine_registry.find_machine_record("other")["devServerPort"], 3105
        )

    def test_live_machine_only_this_laptop_knows_is_shared(self):
        machine_registry.save_machine_record(machine_record("legacy", "m-legacy"))
        listing = [
            {"microvmId": mid, "state": "RUNNING"}
            for mid in ["m-live", "m-gone", "m-legacy"]
        ]
        self.prune(listing, lambda mid: False, [])
        self.assertEqual(
            self.bucket.json_at("machines/legacy.json")["microvmId"], "m-legacy"
        )

    def test_abandoned_reservation_is_dropped_and_a_fresh_one_kept(self):
        fresh = machine_registry.new_machine_record("starting", 3600, 3110)
        old = {
            **machine_registry.new_machine_record("abandoned", 3600, 3111),
            "createdAt": (
                dt.datetime.now(dt.timezone.utc)
                - dt.timedelta(seconds=ABANDONED_RESERVATION_SECONDS + 1)
            ).isoformat(),
        }
        for record in [fresh, old]:
            create_shared_machine_record(record)
        listing = [
            {"microvmId": mid, "state": "RUNNING"} for mid in ["m-live", "m-gone"]
        ]
        self.prune(listing, lambda mid: False, [])
        self.assertIsNone(self.bucket.get("machines/abandoned.json"))
        self.assertIsNone(machine_registry.find_machine_record("abandoned"))
        self.assertIsNotNone(self.bucket.get("machines/starting.json"))

    def test_herdr_entry_without_record_is_removed(self):
        listing = [
            {"microvmId": "m-live", "state": "RUNNING"},
            {"microvmId": "m-gone", "state": "RUNNING"},
        ]
        pruned = self.prune(
            listing, lambda mid: False, [herdr_profile("live"), herdr_profile("orphan")]
        )
        self.assertEqual(pruned, ["orphan"])
        self.assertEqual(self.removed_from_herdr, ["orphan"])

    def test_tuios_session_without_local_record_is_closed(self):
        listing = [{"microvmId": "m-live", "state": "RUNNING"}, {"microvmId": "m-gone", "state": "RUNNING"}]
        self.tuios_sessions = ["aws-live", "aws-orphan"]
        pruned = self.prune(listing, lambda mid: False, [herdr_profile("live"), herdr_profile("orphan")])
        self.assertEqual(pruned, ["orphan"])
        # Closed even though its herdr entry already put it in the pruned list.
        self.assertEqual(self.closed_tuios_sessions, ["orphan"])

    def test_unknown_herdr_listing_skips_herdr_cleanup(self):
        listing = [{"microvmId": "m-live", "state": "RUNNING"}, {"microvmId": "m-gone", "state": "RUNNING"}]
        self.assertEqual(self.prune(listing, lambda mid: False, None), [])
        self.assertEqual(self.removed_from_herdr, [])


class ForgetEndedMachineTest(SharedRegistryFakesTestCase):
    def test_forgets_when_the_record_still_points_at_the_ended_microvm(self):
        self.assertTrue(ended_machine_cleanup.forget_ended_machine("gone", "m-gone"))
        self.assertIsNone(self.bucket.get("machines/gone.json"))
        self.assertNotIn("gone", self.mirrored_names())
        self.assertEqual(self.removed_from_herdr, ["gone"])
        self.assertEqual(self.stopped_forwards, ["gone"])
        self.assertEqual(self.closed_tuios_sessions, ["gone"])

    def test_keeps_a_record_that_now_points_at_a_new_microvm(self):
        self.assertFalse(ended_machine_cleanup.forget_ended_machine("gone", "m-older"))
        self.assertIsNotNone(self.bucket.get("machines/gone.json"))
        self.assertIn("gone", self.mirrored_names())
        self.assertEqual(self.removed_from_herdr, [])
        # The new machine's forwards share the name: they must survive.
        self.assertEqual(self.stopped_forwards, [])
        self.assertEqual(self.closed_tuios_sessions, [])

    def test_already_forgotten_record_still_drops_herdr_entry(self):
        self.assertTrue(ended_machine_cleanup.forget_ended_machine("absent", "m-x"))
        self.assertEqual(self.removed_from_herdr, ["absent"])


if __name__ == "__main__":
    unittest.main()
