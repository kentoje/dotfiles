"""Tests for artifact_bucket_access, and FakeArtifactBucket: the in-memory bucket every other test uses."""

import datetime as dt
import hashlib
import json
import re
import threading
import unittest
from pathlib import Path
from unittest import mock

from mvm_cli import artifact_bucket_access, laptop_ssh_keys, shared_machine_registry
from mvm_cli.artifact_bucket_access import (
    ArtifactBucketObject,
    ArtifactBucketPreconditionFailed,
)
from mvm_cli.aws_cli_access import AwsCliError

# Modules that import the bucket functions by name: install_fake_artifact_bucket patches each.
ARTIFACT_BUCKET_CONSUMER_MODULES = (shared_machine_registry, laptop_ssh_keys)
ARTIFACT_BUCKET_FUNCTION_NAMES = (
    "put_artifact_bucket_object",
    "get_artifact_bucket_object",
    "delete_artifact_bucket_object",
    "list_artifact_bucket_objects",
)


class FakeArtifactBucket:
    """In-memory artifact bucket with S3's conditional semantics (If-None-Match, If-Match). Thread-safe.

    ETags are the quoted MD5 of the body, like S3's for single-part uploads. LastModified is the
    real time of the write; backdate() ages an object (stale locks, abandoned reservations).
    """

    def __init__(self):
        self.objects = {}
        self.lock = threading.Lock()

    def backdate(self, key, seconds):
        with self.lock:
            obj = self.objects[key]
            self.objects[key] = obj._replace(last_modified=obj.last_modified - dt.timedelta(seconds=seconds))

    def put(self, key, body, if_none_match=False, if_match=None):
        with self.lock:
            current = self.objects.get(key)
            if if_none_match and current is not None:
                raise ArtifactBucketPreconditionFailed(f"fake: {key} exists")
            if if_match and (current is None or current.etag != if_match):
                raise ArtifactBucketPreconditionFailed(f"fake: {key} changed")
            etag = '"' + hashlib.md5(body).hexdigest() + '"'
            self.objects[key] = ArtifactBucketObject(body, etag, dt.datetime.now(dt.timezone.utc))
            return etag

    def get(self, key):
        with self.lock:
            return self.objects.get(key)

    def delete(self, key, if_match=None):
        with self.lock:
            current = self.objects.get(key)
            if current is not None and if_match and current.etag != if_match:
                raise ArtifactBucketPreconditionFailed(f"fake: {key} changed")
            self.objects.pop(key, None)

    def list(self, prefix):
        with self.lock:
            return [
                {"key": key, "etag": obj.etag, "lastModified": obj.last_modified}
                for key, obj in sorted(self.objects.items())
                if key.startswith(prefix)
            ]

    def json_at(self, key):
        found = self.get(key)
        return json.loads(found.body) if found else None


def install_fake_artifact_bucket(test_case):
    """Route every artifact bucket call of the mvm modules to a new FakeArtifactBucket for one test; returns it."""
    bucket = FakeArtifactBucket()
    fakes = dict(
        zip(
            ARTIFACT_BUCKET_FUNCTION_NAMES,
            (bucket.put, bucket.get, bucket.delete, bucket.list),
        )
    )
    for module in ARTIFACT_BUCKET_CONSUMER_MODULES:
        for name, fake in fakes.items():
            if hasattr(module, name):
                patcher = mock.patch.object(module, name, side_effect=fake)
                patcher.start()
                test_case.addCleanup(patcher.stop)
    return bucket


class FakeArtifactBucketCoversConsumersTest(unittest.TestCase):
    def test_every_module_importing_bucket_functions_is_patched(self):
        importers = set()
        for path in Path(artifact_bucket_access.__file__).parent.glob("*.py"):
            if path.name.endswith("_test.py") or path.name == "artifact_bucket_access.py":
                continue
            if re.search(
                r"from mvm_cli\.artifact_bucket_access import \([^)]*_artifact_bucket_object",
                path.read_text(),
            ):
                importers.add(path.stem)
        self.assertEqual(
            importers,
            {module.__name__.split(".")[-1] for module in ARTIFACT_BUCKET_CONSUMER_MODULES},
        )


class FakeArtifactBucketTest(unittest.TestCase):
    """The fake must behave like S3, or the registry tests prove nothing."""

    def setUp(self):
        self.bucket = FakeArtifactBucket()

    def test_create_only_when_absent(self):
        self.bucket.put("k", b"1", if_none_match=True)
        with self.assertRaises(ArtifactBucketPreconditionFailed):
            self.bucket.put("k", b"2", if_none_match=True)
        self.assertEqual(self.bucket.get("k").body, b"1")

    def test_replace_and_delete_only_the_version_read(self):
        etag = self.bucket.put("k", b"1")
        newer = self.bucket.put("k", b"2", if_match=etag)
        with self.assertRaises(ArtifactBucketPreconditionFailed):
            self.bucket.put("k", b"3", if_match=etag)
        with self.assertRaises(ArtifactBucketPreconditionFailed):
            self.bucket.delete("k", if_match=etag)
        self.bucket.delete("k", if_match=newer)
        self.assertIsNone(self.bucket.get("k"))
        self.bucket.delete("k", if_match=newer)  # already gone: fine, like S3

    def test_etag_is_the_md5_of_the_body(self):
        self.assertEqual(self.bucket.put("k", b"abc"), '"900150983cd24fb0d6963f7d28e17f72"')


class ArtifactBucketCliTest(unittest.TestCase):
    """The real functions: AWS CLI arguments, and how S3 errors map to results."""

    def setUp(self):
        self.calls = []
        self.response = {}
        self.error = None
        patches = [
            mock.patch.object(
                artifact_bucket_access,
                "artifact_bucket_name",
                return_value="dev-bucket",
            ),
            mock.patch.object(artifact_bucket_access, "run_aws_cli", side_effect=self.fake_run_aws_cli),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def fake_run_aws_cli(self, args, timeout=None):
        self.calls.append(args)
        self.assertEqual(timeout, artifact_bucket_access.ARTIFACT_BUCKET_CALL_TIMEOUT_SECONDS)
        if self.error:
            raise self.error
        if args[1] == "get-object":
            Path(args[-1]).write_bytes(b"body")
        return self.response

    def test_create_only_sends_if_none_match(self):
        self.response = {"ETag": '"e1"'}
        self.assertEqual(
            artifact_bucket_access.put_artifact_bucket_object("k", b"x", if_none_match=True),
            '"e1"',
        )
        self.assertEqual(self.calls[0][-2:], ["--if-none-match", "*"])

    def test_lost_race_raises_precondition_failed(self):
        self.error = AwsCliError(
            "x",
            stderr="An error occurred (PreconditionFailed) when calling the PutObject",
        )
        with self.assertRaises(ArtifactBucketPreconditionFailed):
            artifact_bucket_access.put_artifact_bucket_object("k", b"x", if_match='"e1"')
        self.assertEqual(self.calls[0][-2:], ["--if-match", '"e1"'])

    def test_replace_of_a_deleted_key_is_a_lost_race(self):
        self.error = AwsCliError("x", stderr="An error occurred (NoSuchKey) when calling the PutObject")
        with self.assertRaises(ArtifactBucketPreconditionFailed):
            artifact_bucket_access.put_artifact_bucket_object("k", b"x", if_match='"e1"')

    def test_get_returns_body_etag_and_time(self):
        self.response = {"ETag": '"e1"', "LastModified": "2026-10-20T13:36:28+00:00"}
        found = artifact_bucket_access.get_artifact_bucket_object("k")
        self.assertEqual((found.body, found.etag), (b"body", '"e1"'))
        self.assertEqual(
            found.last_modified,
            dt.datetime(2026, 10, 20, 13, 36, 28, tzinfo=dt.timezone.utc),
        )

    def test_get_missing_key_is_none(self):
        self.error = AwsCliError("x", stderr="An error occurred (NoSuchKey) when calling the GetObject")
        self.assertIsNone(artifact_bucket_access.get_artifact_bucket_object("k"))

    def test_auth_errors_are_not_swallowed(self):
        self.error = AwsCliError("x", stderr="ExpiredToken")
        with self.assertRaises(AwsCliError):
            artifact_bucket_access.get_artifact_bucket_object("k")
        with self.assertRaises(AwsCliError):
            artifact_bucket_access.delete_artifact_bucket_object("k")

    def test_list_reads_every_object_under_the_prefix(self):
        self.response = {
            "Contents": [
                {
                    "Key": "machines/a.json",
                    "ETag": '"e"',
                    "LastModified": "2026-10-20T13:00:00Z",
                }
            ]
        }
        listed = artifact_bucket_access.list_artifact_bucket_objects("machines/")
        self.assertEqual([item["key"] for item in listed], ["machines/a.json"])
        self.assertEqual(self.calls[0][-2:], ["--prefix", "machines/"])
        self.response = {}
        self.assertEqual(artifact_bucket_access.list_artifact_bucket_objects("machines/"), [])


class RealAwsCallGuardTest(unittest.TestCase):
    def test_unit_tests_cannot_reach_aws(self):
        with self.assertRaisesRegex(AssertionError, "reached a real AWS call"):
            artifact_bucket_access.run_aws_cli(["s3api", "list-buckets"])


if __name__ == "__main__":
    unittest.main()
