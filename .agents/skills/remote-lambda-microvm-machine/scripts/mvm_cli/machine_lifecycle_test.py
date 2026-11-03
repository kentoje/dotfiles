"""Tests for machine_lifecycle: --ttl durations, the run payload, and machine creation across laptops."""

import argparse
import contextlib
import io
import itertools
import threading
import time
import unittest
from unittest import mock

from mvm_cli import (
    machine_lifecycle,
    machine_port_forwarding,
    machine_registry,
    shared_machine_registry,
)
from mvm_cli.aws_cli_access import AwsCliError
from mvm_cli.machine_registry_test import isolate_machine_mirror
from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings import (
    LAPTOP_SSH_KEYS_PREFIX,
    PNPM_STORE_CACHE_PREFIX,
    STACK_TEMPLATE,
)
from mvm_cli.shared_machine_registry import MachineNameTaken
from mvm_cli.shared_machine_registry_test import isolate_shared_machine_registry


class DurationTest(unittest.TestCase):
    def test_parse_duration_seconds(self):
        self.assertEqual(machine_lifecycle.parse_duration_seconds("8h"), 28800)
        self.assertEqual(machine_lifecycle.parse_duration_seconds("90m"), 5400)
        self.assertEqual(machine_lifecycle.parse_duration_seconds("45s"), 45)
        self.assertEqual(machine_lifecycle.parse_duration_seconds("1.5h"), 5400)
        self.assertEqual(machine_lifecycle.parse_duration_seconds("120"), 120)

    def test_parse_duration_rejects_garbage(self):
        for text in ["", "h", "eight", "8d"]:
            with self.assertRaises(MvmError, msg=text):
                machine_lifecycle.parse_duration_seconds(text)

    def test_format_duration_short(self):
        self.assertEqual(machine_lifecycle.format_duration_short(3725), "1h02m")
        self.assertEqual(machine_lifecycle.format_duration_short(300), "5m")
        self.assertEqual(machine_lifecycle.format_duration_short(-10), "0m")


class MvmRunPayloadTest(unittest.TestCase):
    def test_payload_carries_what_mvm_on_run_reads(self):
        payload = machine_lifecycle.build_mvm_run_payload(
            "quiet-yak",
            {
                "EnvSecretArn": "arn:aws:secretsmanager:x:1:secret:env",
                "ArtifactBucketName": "dev-bucket",
            },
            3101,
        )
        self.assertEqual(payload["name"], "quiet-yak")
        # mvm-authorized-keys copies every object under it: the URI must end with "/".
        self.assertEqual(payload["sshKeysUri"], "s3://dev-bucket/ssh-keys/")
        # No key list frozen at start: a revoked laptop must lose access to running machines too.
        self.assertNotIn("sshAuthorizedKeys", payload)
        self.assertEqual(
            payload["envSecretId"], "arn:aws:secretsmanager:x:1:secret:env"
        )
        self.assertTrue(payload["bootstrapWorkspace"])
        # mvm-pnpm-store-cache appends "<checkout>/<lock hash>.tar.zst": the URI must end with "/".
        self.assertEqual(payload["pnpmStoreCacheUri"], "s3://dev-bucket/pnpm-store/")
        # mvm-on-run copies it into /etc/mvm/machine.json as a number; the bootstrap writes it as PORT.
        self.assertEqual(payload["devServerPort"], 3101)

    def test_cache_prefix_matches_the_stack_policy(self):
        stack = STACK_TEMPLATE.read_text()
        prefix = PNPM_STORE_CACHE_PREFIX
        self.assertIn(f'${{ArtifactBucket.Arn}}/{prefix}*"', stack)
        self.assertIn(f"Prefix: {prefix}\n", stack)

    def test_machines_can_read_but_never_write_laptop_keys(self):
        stack = STACK_TEMPLATE.read_text()
        prefix = LAPTOP_SSH_KEYS_PREFIX
        self.assertIn(
            f'Action: s3:GetObject\n                Resource: !Sub "${{ArtifactBucket.Arn}}/{prefix}*"',
            stack,
        )
        self.assertEqual(
            stack.count(f"/{prefix}*"),
            1,
            "only the GetObject statement may name the key prefix",
        )
        self.assertIn(f"s3:prefix: [pnpm-store/*, {prefix}*]", stack)


class MachineCreationAcrossLaptopsTest(unittest.TestCase):
    """`mvm new` on several laptops, or by parallel agents on one, never shares a name or a dev server port."""

    def setUp(self):
        self.bucket = isolate_shared_machine_registry(self)
        microvm_ids = itertools.count(1)
        ids_lock = threading.Lock()

        def slow_run_microvm(args):
            time.sleep(0.1)  # run-microvm takes seconds: parallel starts overlap
            with ids_lock:
                return {"microvmId": f"microvm-{next(microvm_ids)}", "endpoint": None}

        self.run_microvm = mock.Mock(side_effect=slow_run_microvm)
        patches = [
            mock.patch.object(machine_lifecycle, "run_aws_cli", self.run_microvm),
            mock.patch.object(machine_lifecycle, "image_arn", return_value="arn:image"),
            mock.patch.object(
                machine_port_forwarding, "laptop_port_is_free", return_value=True
            ),
            mock.patch.object(
                shared_machine_registry, "MACHINE_CREATION_LOCK_POLL_SECONDS", 0.01
            ),
            contextlib.redirect_stderr(io.StringIO()),
        ]
        for patch in patches:
            patch.__enter__()
            self.addCleanup(patch.__exit__, None, None, None)

    def start(self, name, records=None):
        record, etag = machine_lifecycle.reserve_machine_name_and_port(name, 3600)
        record, _ = machine_lifecycle.start_reserved_microvm(
            record, etag, STACK_OUTPUTS
        )
        if records is not None:
            records.append(record)
        return record

    def switch_to_another_laptop(self):
        """Same bucket, empty mirror: what a second laptop sees."""
        isolate_machine_mirror(self)

    def test_parallel_starts_get_different_dev_server_ports(self):
        records = []
        threads = [
            threading.Thread(target=self.start, args=(name, records))
            for name in ["a", "b", "c"]
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(
            len({record["devServerPort"] for record in records}), 3, records
        )
        self.assertEqual(len(self.bucket.list("machines/")), 3)

    def test_another_laptop_avoids_the_first_laptops_ports_and_names(self):
        first = self.start("a")
        self.switch_to_another_laptop()
        second = self.start(None)
        self.assertNotEqual(second["devServerPort"], first["devServerPort"])
        self.assertNotEqual(second["name"], "a")
        self.assertEqual(
            machine_registry.find_machine_record("a")["microvmId"], first["microvmId"]
        )

    def test_a_name_taken_on_another_laptop_is_refused(self):
        self.start("dev")
        self.switch_to_another_laptop()
        with self.assertRaisesRegex(MachineNameTaken, "dev already exists"):
            self.start("dev")
        self.assertEqual(self.run_microvm.call_count, 1)

    def test_shared_record_gets_the_microvm_id(self):
        record = self.start("dev")
        self.assertEqual(self.bucket.json_at("machines/dev.json"), record)
        self.assertEqual(record["createdOn"], machine_registry.LAPTOP_NAME)

    def test_failed_start_frees_the_name(self):
        self.run_microvm.side_effect = AwsCliError(
            "run-microvm failed", stderr="ServiceException"
        )
        with self.assertRaises(AwsCliError):
            self.start("dev")
        self.assertEqual(self.bucket.list("machines/"), [])
        self.assertIsNone(machine_registry.find_machine_record("dev"))
        self.run_microvm.side_effect = lambda args: {
            "microvmId": "microvm-2",
            "endpoint": None,
        }
        self.assertEqual(self.start("dev")["microvmId"], "microvm-2")


class NewMachineRegistersLaptopKeyTest(unittest.TestCase):
    """Machines accept only registered keys, so `mvm new` registers this laptop's key before starting one."""

    def setUp(self):
        self.bucket = isolate_shared_machine_registry(self)
        self.events = []
        self.run_microvm = mock.Mock(
            side_effect=lambda args: (
                self.events.append("run-microvm")
                or {"microvmId": "microvm-1", "endpoint": "e"}
            )
        )
        self.register = mock.Mock(side_effect=lambda: self.events.append("register"))
        patches = [
            mock.patch.object(
                machine_lifecycle, "register_laptop_ssh_key", self.register
            ),
            mock.patch.object(machine_lifecycle, "run_aws_cli", self.run_microvm),
            mock.patch.object(machine_lifecycle, "image_arn", return_value="arn:image"),
            mock.patch.object(machine_lifecycle, "reexec_under_aws_vault"),
            mock.patch.object(
                machine_lifecycle, "list_image_microvms", return_value=[]
            ),
            mock.patch.object(machine_lifecycle, "prune_ended_machines"),
            mock.patch.object(
                machine_lifecycle, "read_stack_outputs", return_value=STACK_OUTPUTS
            ),
            mock.patch.object(
                machine_lifecycle,
                "wait_for_microvm_state",
                return_value={"endpoint": "e"},
            ),
            mock.patch.object(machine_lifecycle, "forget_machine_host_key"),
            mock.patch.object(machine_lifecycle, "wait_for_ssh"),
            mock.patch.object(
                machine_lifecycle, "add_machine_to_herdr", return_value=False
            ),
            mock.patch.object(
                machine_lifecycle, "open_tuios_session_for_machine", return_value=None
            ),
            mock.patch.object(
                machine_port_forwarding, "laptop_port_is_free", return_value=True
            ),
            contextlib.redirect_stderr(io.StringIO()),
            contextlib.redirect_stdout(io.StringIO()),
        ]
        for patch in patches:
            patch.__enter__()
            self.addCleanup(patch.__exit__, None, None, None)

    def new_machine(self, name):
        machine_lifecycle.cmd_new(argparse.Namespace(name=name, ttl="1h", json=False))

    def test_key_is_registered_before_the_machine_starts(self):
        self.new_machine("dev")
        self.assertEqual(self.events, ["register", "run-microvm"])

    def test_failed_registration_starts_nothing_and_reserves_no_name(self):
        self.register.side_effect = AwsCliError(
            "put-object failed", stderr="AccessDenied"
        )
        with self.assertRaises(AwsCliError):
            self.new_machine("dev")
        self.run_microvm.assert_not_called()
        self.assertEqual(self.bucket.list("machines/"), [])


STACK_OUTPUTS = {
    "EnvSecretArn": "arn:secret",
    "ArtifactBucketName": "bucket",
    "ExecutionRoleArn": "arn:role",
    "ImageLogGroupName": "group",
}


if __name__ == "__main__":
    unittest.main()
