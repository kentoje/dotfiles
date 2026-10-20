"""Tests for machine_lifecycle helpers: durations for --ttl and the `mvm ls` columns."""

import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from mvm_cli import machine_lifecycle, machine_port_forwarding, machine_registry
from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings import PNPM_STORE_CACHE_PREFIX, STACK_TEMPLATE


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
            "ssh-ed25519 AAAA test",
            {"EnvSecretArn": "arn:aws:secretsmanager:x:1:secret:env", "ArtifactBucketName": "dev-bucket"},
            3101,
        )
        self.assertEqual(payload["name"], "quiet-yak")
        self.assertEqual(payload["sshAuthorizedKeys"], ["ssh-ed25519 AAAA test"])
        self.assertEqual(payload["envSecretId"], "arn:aws:secretsmanager:x:1:secret:env")
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


class ParallelMachineCreationTest(unittest.TestCase):
    """Two `mvm new` at once (an agent starting machines for parallel tasks) must not share a dev server port."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        state_dir = Path(tmp.name)
        microvm_ids = iter(["microvm-a", "microvm-b"])

        def slow_run_microvm(args):
            time.sleep(0.2)  # run-microvm takes seconds: both runs overlap without the lock
            return {"microvmId": next(microvm_ids), "endpoint": None}

        patches = [
            mock.patch.object(machine_registry, "STATE_DIR", state_dir),
            mock.patch.object(machine_registry, "MACHINES_DIR", state_dir / "machines"),
            mock.patch.object(machine_lifecycle, "run_aws_cli", side_effect=slow_run_microvm),
            mock.patch.object(machine_lifecycle, "image_arn", return_value="arn:image"),
            mock.patch.object(machine_port_forwarding, "laptop_port_is_free", return_value=True),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def start(self, name, records):
        outputs = {
            "EnvSecretArn": "arn:secret",
            "ArtifactBucketName": "bucket",
            "ExecutionRoleArn": "arn:role",
            "ImageLogGroupName": "group",
        }
        with machine_registry.machine_creation_lock():
            records.append(machine_lifecycle.reserve_and_start_microvm(name, "ssh-ed25519 AAAA", outputs, 3600))

    def test_parallel_starts_get_different_dev_server_ports(self):
        records = []
        threads = [threading.Thread(target=self.start, args=(name, records)) for name in ["a", "b"]]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(len({record["devServerPort"] for record in records}), 2, records)


if __name__ == "__main__":
    unittest.main()
