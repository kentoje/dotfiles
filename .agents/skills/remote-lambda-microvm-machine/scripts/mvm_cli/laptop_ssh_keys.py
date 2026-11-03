"""Laptop ssh keys shared through the artifact bucket, so every laptop set up with `mvm setup` reaches every machine.

`mvm setup`, `mvm new` and `mvm attach` register this laptop's public key at
<LAPTOP_SSH_KEYS_PREFIX><key id>.pub. These registered keys are the only keys a machine accepts: its
sshd reads them from S3 at every login (image/rootfs/opt/mvm/bin/mvm-authorized-keys), so a laptop
set up after a machine started gets in, and `mvm keys remove KEY_ID` revokes a laptop on every
machine at its next login. Sessions already open stay open.
"""

import hashlib

from mvm_cli.artifact_bucket_access import (
    delete_artifact_bucket_object,
    get_artifact_bucket_object,
    list_artifact_bucket_objects,
    put_artifact_bucket_object,
)
from mvm_cli.aws_cli_access import reexec_under_aws_vault
from mvm_cli.mvm_errors import MvmError, log_mvm
from mvm_cli.mvm_settings import LAPTOP_NAME, LAPTOP_SSH_KEYS_PREFIX, OWNER
from mvm_cli.ssh_access import read_mvm_ssh_public_key


def laptop_ssh_key_id(public_key):
    """`<laptop name>-<12 hex of the key's sha256>`: stable for a key whatever its comment, readable in `mvm keys`."""
    key_body = public_key.split()[1]
    return f"{LAPTOP_NAME}-{hashlib.sha256(key_body.encode()).hexdigest()[:12]}"


def laptop_ssh_key_object_key(key_id):
    return f"{LAPTOP_SSH_KEYS_PREFIX}{key_id}.pub"


def register_laptop_ssh_key():
    """Upload this laptop's mvm public key, with the comment `mvm-<owner>@<laptop>`. Idempotent. Returns its key id."""
    key_type, key_body = read_mvm_ssh_public_key().split()[:2]
    key_id = laptop_ssh_key_id(f"{key_type} {key_body}")
    line = f"{key_type} {key_body} mvm-{OWNER}@{LAPTOP_NAME}\n"
    put_artifact_bucket_object(laptop_ssh_key_object_key(key_id), line.encode())
    return key_id


def list_registered_laptop_ssh_keys():
    """Every registered laptop key, sorted by id: [{"id", "publicKey"}]."""
    keys = []
    for item in list_artifact_bucket_objects(LAPTOP_SSH_KEYS_PREFIX):
        object_key = item["key"]
        if not object_key.endswith(".pub"):
            continue
        found = get_artifact_bucket_object(object_key)
        if found is None:
            continue  # removed between the listing and the read
        keys.append(
            {
                "id": object_key[len(LAPTOP_SSH_KEYS_PREFIX) : -len(".pub")],
                "publicKey": found.body.decode().strip(),
            }
        )
    return sorted(keys, key=lambda key: key["id"])


def cmd_keys(args):
    """`mvm keys`: list the laptop ssh keys every machine authorizes; `mvm keys remove KEY_ID` revokes one."""
    reexec_under_aws_vault()
    if args.keys_command == "remove":
        remove_laptop_ssh_key(args.key_id)
        return
    own_key_id = laptop_ssh_key_id(read_mvm_ssh_public_key())
    registered = list_registered_laptop_ssh_keys()
    if not registered:
        print("no laptop keys registered (run: mvm setup)")
        return
    for key in registered:
        comment = " ".join(key["publicKey"].split()[2:]) or "-"
        marker = "  (this laptop)" if key["id"] == own_key_id else ""
        print(f"{key['id']}  {comment}{marker}")


def remove_laptop_ssh_key(key_id):
    """Revoke a laptop: delete its registered key, so no machine accepts it at the next login."""
    object_key = laptop_ssh_key_object_key(key_id)
    if get_artifact_bucket_object(object_key) is None:
        raise MvmError(f"unknown laptop key {key_id!r} (see `mvm keys`)")
    delete_artifact_bucket_object(object_key)
    log_mvm(f"removed laptop key {key_id}; machines refuse it from the next login (open sessions stay open)")
