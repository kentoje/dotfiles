"""Shared machine registry: every laptop's MachineRecords, in the artifact bucket (S3).

<MACHINE_REGISTRY_PREFIX><name>.json is the source of truth for a machine's name, MicroVM id,
endpoint and dev server port, so any laptop set up with `mvm setup` can list, reach and remove any
machine. machine_registry keeps the laptop's mirror of it, read without an AWS call.

Laptops never overwrite each other, thanks to S3 conditional requests:
- `mvm new` reserves a name by creating its record only when no laptop has it;
- a record is replaced or deleted only in the version this laptop read (its ETag), so a name that
  another laptop reused meanwhile is never overwritten or forgotten;
- names and dev server ports are picked under shared_machine_creation_lock(), so two laptops never
  pick the same port.
The mirror refresh only adds and updates records. Only ended_machine_cleanup deletes one, once AWS
confirmed the MicroVM ended.

Imported by `mvm proxy` on every ssh connection: keep it light and 3.9-compatible.
"""

import contextlib
import datetime as dt
import json
import os
import time
from collections import namedtuple

from mvm_cli.artifact_bucket_access import (
    ArtifactBucketPreconditionFailed,
    delete_artifact_bucket_object,
    get_artifact_bucket_object,
    list_artifact_bucket_objects,
    put_artifact_bucket_object,
)
from mvm_cli.machine_registry import (
    MACHINE_NAME_PATTERN,
    find_machine_record,
    machine_record_bytes,
    mirrored_machine_record_etag,
    save_machine_record_bytes,
)
from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import (
    LAPTOP_NAME,
    MACHINE_CREATION_LOCK_KEY,
    MACHINE_CREATION_LOCK_STALE_SECONDS,
    MACHINE_REGISTRY_PREFIX,
)

# How long `mvm new` waits for another laptop's `mvm new` to release the creation lock, and how
# often it checks.
MACHINE_CREATION_LOCK_WAIT_SECONDS = 180
MACHINE_CREATION_LOCK_POLL_SECONDS = 1.0

# A MachineRecord dict and the ETag of the shared version it was read from or written as.
SharedMachineRecord = namedtuple("SharedMachineRecord", ["record", "etag"])


class MachineNameTaken(MvmError):
    """`mvm new NAME` or a record upload lost: a machine of some laptop already has NAME."""


def shared_machine_record_key(name):
    return f"{MACHINE_REGISTRY_PREFIX}{name}.json"


def machine_name_from_shared_record_key(key):
    """`machines/brisk-otter.json` -> `brisk-otter`; None for any other key."""
    if not (key.startswith(MACHINE_REGISTRY_PREFIX) and key.endswith(".json")):
        return None
    name = key[len(MACHINE_REGISTRY_PREFIX) : -len(".json")]
    return name if MACHINE_NAME_PATTERN.match(name) else None


def fetch_shared_machine_record(name):
    """NAME's shared record (also written to the local mirror), or None when no laptop has a machine by that name."""
    found = get_artifact_bucket_object(shared_machine_record_key(name))
    if found is None:
        return None
    save_machine_record_bytes(name, found.body)
    return SharedMachineRecord(json.loads(found.body), found.etag)


def create_shared_machine_record(record):
    """Reserve record["name"] for all laptops: create its shared record only if no laptop has it. Returns the ETag.

    Raises MachineNameTaken when a machine of any laptop has the name.
    """
    name = record["name"]
    data = machine_record_bytes(record)
    try:
        etag = put_artifact_bucket_object(shared_machine_record_key(name), data, if_none_match=True)
    except ArtifactBucketPreconditionFailed:
        raise MachineNameTaken(f"{name} already exists (see `mvm ls`, or `mvm rm {name}`)") from None
    save_machine_record_bytes(name, data)
    return etag


def replace_shared_machine_record(record, etag):
    """Replace this laptop's own shared record, in version ETAG, and its mirror. Returns the new ETag.

    Raises ArtifactBucketPreconditionFailed when another laptop changed or deleted it meanwhile.
    """
    data = machine_record_bytes(record)
    new_etag = put_artifact_bucket_object(shared_machine_record_key(record["name"]), data, if_match=etag)
    save_machine_record_bytes(record["name"], data)
    return new_etag


def delete_shared_machine_record(name, etag):
    """Delete NAME's shared record in version ETAG. False when another laptop changed it meanwhile (name reused)."""
    try:
        delete_artifact_bucket_object(shared_machine_record_key(name), if_match=etag)
    except ArtifactBucketPreconditionFailed:
        return False
    return True


def upload_local_only_machine_record(record):
    """Share a live machine's record that only this laptop's mirror has (started before the shared registry).

    Leaves the shared registry alone when another laptop took the name meanwhile. Returns True when shared.
    """
    try:
        create_shared_machine_record(record)
    except MachineNameTaken:
        log_mvm(f"{record['name']}: WARNING another laptop now uses this name; this machine keeps it only here")
        return False
    log_mvm(f"{record['name']}: shared its record with the other laptops")
    return True


def refresh_machine_registry_mirror():
    """Download new and changed shared records into the local mirror. Returns the set of names in the shared registry.

    Never deletes a mirror record: a record missing from the shared registry may belong to a live
    machine (see upload_local_only_machine_record); ended_machine_cleanup forgets ended ones.
    """
    shared_names = set()
    for item in list_artifact_bucket_objects(MACHINE_REGISTRY_PREFIX):
        name = machine_name_from_shared_record_key(item["key"])
        if name is None:
            continue
        shared_names.add(name)
        if mirrored_machine_record_etag(name) != item["etag"]:
            fetch_shared_machine_record(name)
    return shared_names


def resolve_machine_record(name, fresh=False):
    """NAME's MachineRecord, or None when no laptop knows that name.

    Reads the local mirror first and asks the shared registry only for a name missing there. With
    FRESH (before acting on the machine: rm, attach), asks the shared registry first, since another
    laptop may have reused the name. A record only this laptop has is still returned.
    """
    if not fresh:
        record = find_machine_record(name)
        if record is not None:
            return record
    shared = fetch_shared_machine_record(name)
    if shared is not None:
        return shared.record
    return find_machine_record(name)


def require_machine_record(name, fresh=False):
    """resolve_machine_record, raising MvmError for an unknown name."""
    record = resolve_machine_record(name, fresh=fresh)
    if record is None:
        raise MvmError(f"unknown machine {name!r} (see `mvm ls`)")
    return record


@contextlib.contextmanager
def shared_machine_creation_lock():
    """Serialize `mvm new` across laptops (and processes) while it picks a name and a dev server port.

    The lock is an object at MACHINE_CREATION_LOCK_KEY, created only when absent. One left behind by
    a crashed `mvm new` is taken over after MACHINE_CREATION_LOCK_STALE_SECONDS, in the exact
    version seen. Released only in the version this process wrote.
    """
    etag = acquire_machine_creation_lock()
    try:
        yield
    finally:
        try:
            delete_artifact_bucket_object(MACHINE_CREATION_LOCK_KEY, if_match=etag)
        except ArtifactBucketPreconditionFailed:
            log_mvm("WARNING the machine creation lock was taken over before this `mvm new` released it")


def acquire_machine_creation_lock():
    """Create the creation lock object (waiting for its holder, or taking over a stale one). Returns its ETag."""
    holder_info = {
        "laptop": LAPTOP_NAME,
        "pid": os.getpid(),
        "acquiredAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    body = (json.dumps(holder_info) + "\n").encode()
    deadline = time.monotonic() + MACHINE_CREATION_LOCK_WAIT_SECONDS
    reported_holder = None
    while True:
        try:
            return put_artifact_bucket_object(MACHINE_CREATION_LOCK_KEY, body, if_none_match=True)
        except ArtifactBucketPreconditionFailed:
            pass
        current = get_artifact_bucket_object(MACHINE_CREATION_LOCK_KEY)
        if current is None:
            continue  # released between the two calls
        holder = describe_machine_creation_lock_holder(current.body)
        age_seconds = (dt.datetime.now(dt.timezone.utc) - current.last_modified).total_seconds()
        if age_seconds > MACHINE_CREATION_LOCK_STALE_SECONDS:
            try:
                etag = put_artifact_bucket_object(MACHINE_CREATION_LOCK_KEY, body, if_match=current.etag)
            except ArtifactBucketPreconditionFailed:
                continue
            log_mvm(f"took over a stale machine creation lock from {holder} ({int(age_seconds)}s old)")
            return etag
        if time.monotonic() > deadline:
            raise MvmError(f"machine creation lock still held by {holder} after {MACHINE_CREATION_LOCK_WAIT_SECONDS}s")
        if holder != reported_holder:
            log_mvm(f"waiting for `mvm new` on {holder}")
            reported_holder = holder
        time.sleep(MACHINE_CREATION_LOCK_POLL_SECONDS)


def describe_machine_creation_lock_holder(body):
    """`<laptop> (pid N)` from a lock object's body, for messages."""
    try:
        holder_info = json.loads(body)
        return f"{holder_info['laptop']} (pid {holder_info['pid']})"
    except (ValueError, KeyError, TypeError):
        return "an unknown laptop"
