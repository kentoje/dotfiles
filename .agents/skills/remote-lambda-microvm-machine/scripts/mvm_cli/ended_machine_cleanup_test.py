"""Tests for prune_ended_machines: it must fail closed (never forget a machine AWS did not confirm ended)."""

import unittest
from contextlib import ExitStack
from unittest import mock

from mvm_cli import ended_machine_cleanup


def herdr_profile(name, profile_id=None):
    return {"id": profile_id or f"id-{name}", "label": f"aws-{name}", "target": f"{name}.mvm"}


class LocalRecordFakesTestCase(unittest.TestCase):
    """In-memory machine records and herdr removals, shared by the tests below (no tests of its own)."""

    def setUp(self):
        self.records = [{"name": "live", "microvmId": "m-live"}, {"name": "gone", "microvmId": "m-gone"}]
        self.removed_from_herdr = []
        self.deleted = []
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
                ended_machine_cleanup, "forget_machine_port_forwards", side_effect=self.stopped_forwards.append
            ),
            mock.patch.object(ended_machine_cleanup, "list_machine_records", side_effect=lambda: list(self.records)),
            mock.patch.object(ended_machine_cleanup, "find_machine_record", side_effect=self.find_record),
            mock.patch.object(ended_machine_cleanup, "delete_machine_record", side_effect=self.delete_record),
            mock.patch.object(
                ended_machine_cleanup,
                "remove_machine_from_herdr",
                side_effect=lambda name, profiles=None: self.removed_from_herdr.append(name),
            ),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def find_record(self, name):
        return next((r for r in self.records if r["name"] == name), None)

    def delete_record(self, name):
        self.deleted.append(name)
        self.records = [r for r in self.records if r["name"] != name]


class PruneEndedMachinesTest(LocalRecordFakesTestCase):
    def prune(self, listing, has_ended, herdr_profiles):
        with ExitStack() as stack:
            stack.enter_context(mock.patch.object(ended_machine_cleanup, "microvm_has_ended", side_effect=has_ended))
            stack.enter_context(
                mock.patch.object(ended_machine_cleanup, "list_herdr_mvm_profiles", return_value=herdr_profiles)
            )
            return ended_machine_cleanup.prune_ended_machines(listing)

    def test_forgets_only_machines_aws_confirms_ended(self):
        listing = [{"microvmId": "m-live", "state": "RUNNING"}, {"microvmId": "m-gone", "state": "TERMINATED"}]
        pruned = self.prune(listing, lambda mid: mid == "m-gone", [herdr_profile("live"), herdr_profile("gone")])
        self.assertEqual(pruned, ["gone"])
        self.assertEqual(self.deleted, ["gone"])
        self.assertEqual(self.removed_from_herdr, ["gone"])

    def test_absent_from_listing_but_unconfirmed_is_kept(self):
        # e.g. an AWS hiccup: the listing came back empty and get-microvm failed on auth.
        pruned = self.prune([], lambda mid: False, [herdr_profile("live"), herdr_profile("gone")])
        self.assertEqual(pruned, [])
        self.assertEqual(self.deleted, [])
        self.assertEqual(self.removed_from_herdr, [])

    def test_name_reused_during_the_check_is_kept(self):
        # `mvm rm gone && mvm new gone` while this prune was asking AWS about the old MicroVM.
        def has_ended(mid):
            self.records = [r for r in self.records if r["name"] != "gone"] + [{"name": "gone", "microvmId": "m-new"}]
            return mid == "m-gone"

        listing = [{"microvmId": "m-live", "state": "RUNNING"}, {"microvmId": "m-new", "state": "RUNNING"}]
        pruned = self.prune(listing, has_ended, [herdr_profile("live"), herdr_profile("gone")])
        self.assertEqual(pruned, [])
        self.assertEqual(self.deleted, [])
        self.assertEqual(self.removed_from_herdr, [])

    def test_herdr_entry_without_local_record_is_removed(self):
        listing = [{"microvmId": "m-live", "state": "RUNNING"}, {"microvmId": "m-gone", "state": "RUNNING"}]
        pruned = self.prune(listing, lambda mid: False, [herdr_profile("live"), herdr_profile("orphan")])
        self.assertEqual(pruned, ["orphan"])
        self.assertEqual(self.removed_from_herdr, ["orphan"])
        self.assertEqual(self.deleted, [])

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


class ForgetEndedMachineTest(LocalRecordFakesTestCase):
    def test_forgets_when_the_record_still_points_at_the_ended_microvm(self):
        self.assertTrue(ended_machine_cleanup.forget_ended_machine("gone", "m-gone"))
        self.assertEqual(self.deleted, ["gone"])
        self.assertEqual(self.removed_from_herdr, ["gone"])
        self.assertEqual(self.stopped_forwards, ["gone"])
        self.assertEqual(self.closed_tuios_sessions, ["gone"])

    def test_keeps_a_record_that_now_points_at_a_new_microvm(self):
        self.assertFalse(ended_machine_cleanup.forget_ended_machine("gone", "m-older"))
        self.assertEqual(self.deleted, [])
        self.assertEqual(self.removed_from_herdr, [])
        # The new machine's forwards share the name: they must survive.
        self.assertEqual(self.stopped_forwards, [])
        self.assertEqual(self.closed_tuios_sessions, [])

    def test_already_forgotten_record_still_drops_herdr_entry(self):
        self.assertTrue(ended_machine_cleanup.forget_ended_machine("absent", "m-x"))
        self.assertEqual(self.removed_from_herdr, ["absent"])


if __name__ == "__main__":
    unittest.main()
