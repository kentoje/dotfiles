"""Objects in the stack's artifact bucket (S3), with S3 conditional writes and deletes.

The shared machine registry and the laptop ssh keys live there. Conditional requests make them safe
for several laptops: `if_none_match` creates only when the key is absent, and `if_match` replaces or
deletes only the version with that ETag. A lost race raises ArtifactBucketPreconditionFailed.
"""

import datetime as dt
import tempfile
from collections import namedtuple
from pathlib import Path

from mvm_cli.aws_cli_access import AwsCliError, read_stack_outputs, run_aws_cli
from mvm_cli.mvm_errors import MvmError

# Bound for every bucket call. The machine creation lock relies on it staying well below
# MACHINE_CREATION_LOCK_STALE_SECONDS, so a hung call cannot outlive the lock.
ARTIFACT_BUCKET_CALL_TIMEOUT_SECONDS = 30

# body: bytes; etag: S3's quoted ETag (the MD5 of the body for these small single-part objects);
# last_modified: aware datetime.
ArtifactBucketObject = namedtuple("ArtifactBucketObject", ["body", "etag", "last_modified"])


class ArtifactBucketPreconditionFailed(MvmError):
    """A conditional bucket write or delete lost: another laptop created, changed or deleted the object first."""


def artifact_bucket_name():
    return read_stack_outputs()["ArtifactBucketName"]


def parse_s3_timestamp(text):
    """S3 LastModified as printed by the AWS CLI (`2026-10-20T13:36:28+00:00`) -> aware datetime."""
    return dt.datetime.fromisoformat(str(text).replace("Z", "+00:00"))


def run_artifact_bucket_call(args, key):
    """Run `aws s3api ARGS` with the bucket call timeout; a lost conditional request raises ArtifactBucketPreconditionFailed."""
    try:
        return run_aws_cli(["s3api", *args], timeout=ARTIFACT_BUCKET_CALL_TIMEOUT_SECONDS)
    except AwsCliError as error:
        if error.is_precondition_failed():
            raise ArtifactBucketPreconditionFailed(f"artifact bucket object changed meanwhile: {key}") from None
        raise


def put_artifact_bucket_object(key, body, if_none_match=False, if_match=None):
    """Write BODY (bytes) at KEY and return the new ETag.

    if_none_match: create only, when KEY does not exist yet. if_match: replace only the version with
    that ETag. Either way a lost race raises ArtifactBucketPreconditionFailed.
    """
    with tempfile.TemporaryDirectory() as tmp:
        body_file = Path(tmp) / "body"
        body_file.write_bytes(body)
        args = [
            "put-object",
            "--bucket",
            artifact_bucket_name(),
            "--key",
            key,
            "--body",
            str(body_file),
        ]
        if if_none_match:
            args += ["--if-none-match", "*"]
        if if_match:
            args += ["--if-match", if_match]
        try:
            return run_artifact_bucket_call(args, key)["ETag"]
        except AwsCliError as error:
            # If-Match on a key that is gone: it changed meanwhile, like any other lost race.
            if if_match and error.is_no_such_key():
                raise ArtifactBucketPreconditionFailed(f"artifact bucket object changed meanwhile: {key}") from None
            raise


def get_artifact_bucket_object(key):
    """KEY as an ArtifactBucketObject, or None when it does not exist."""
    with tempfile.TemporaryDirectory() as tmp:
        body_file = Path(tmp) / "body"
        try:
            meta = run_artifact_bucket_call(
                [
                    "get-object",
                    "--bucket",
                    artifact_bucket_name(),
                    "--key",
                    key,
                    str(body_file),
                ],
                key,
            )
        except AwsCliError as error:
            if error.is_no_such_key():
                return None
            raise
        return ArtifactBucketObject(
            body_file.read_bytes(),
            meta["ETag"],
            parse_s3_timestamp(meta["LastModified"]),
        )


def delete_artifact_bucket_object(key, if_match=None):
    """Delete KEY; with IF_MATCH only that version (else ArtifactBucketPreconditionFailed). A missing KEY is fine."""
    args = ["delete-object", "--bucket", artifact_bucket_name(), "--key", key]
    if if_match:
        args += ["--if-match", if_match]
    try:
        run_artifact_bucket_call(args, key)
    except AwsCliError as error:
        if not error.is_no_such_key():
            raise


def list_artifact_bucket_objects(prefix):
    """Every object under PREFIX (all pages) as {"key", "etag", "lastModified"}, without bodies."""
    data = run_artifact_bucket_call(
        ["list-objects-v2", "--bucket", artifact_bucket_name(), "--prefix", prefix],
        prefix,
    )
    return [
        {
            "key": item["Key"],
            "etag": item["ETag"],
            "lastModified": parse_s3_timestamp(item["LastModified"]),
        }
        for item in data.get("Contents") or []
    ]
