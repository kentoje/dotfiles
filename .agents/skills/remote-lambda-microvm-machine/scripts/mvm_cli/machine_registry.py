"""Machine names and the local mirror of the shared machine registry. MicroVMs only have ids.

A MachineRecord maps `<name>` to its MicroVM. The source of truth is the shared registry in the
artifact bucket (shared_machine_registry), so every laptop sees every machine. This module keeps
the laptop's mirror of it: one JSON file per machine in ~/.local/state/mvm/machines/<name>.json,
read by `mvm proxy` and the fish completion without an AWS call. The mirror holds the exact bytes
of the shared record, so its MD5 equals the S3 ETag. Never delete a record unless AWS confirmed the
MicroVM ended.
"""

import datetime as dt
import hashlib
import json
import random
import re
import subprocess

from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings import (
    KNOWN_HOSTS,
    LAPTOP_NAME,
    MACHINES_DIR,
    MAX_LIFETIME_SECONDS,
    REGION,
    SSH_HOST_SUFFIX,
)

# Lowercase DNS-label style: it becomes a hostname, a herdr label, a log stream and a git ref path.
MACHINE_NAME_PATTERN = re.compile(r"^[a-z](?:[a-z0-9-]{0,22}[a-z0-9])?$")

GENERATED_NAME_ADJECTIVES = [
    "amber",
    "bold",
    "brisk",
    "calm",
    "clever",
    "cosmic",
    "crisp",
    "eager",
    "fuzzy",
    "gentle",
    "jolly",
    "lucky",
    "mellow",
    "nimble",
    "plucky",
    "quiet",
    "rapid",
    "sunny",
    "swift",
    "tidy",
]
GENERATED_NAME_NOUNS = [
    "badger",
    "comet",
    "falcon",
    "fox",
    "gecko",
    "heron",
    "koala",
    "lemur",
    "lynx",
    "marmot",
    "otter",
    "panda",
    "puffin",
    "quokka",
    "raven",
    "seal",
    "tapir",
    "walrus",
    "wombat",
    "yak",
]


def validate_machine_name(name):
    """Raise MvmError unless NAME is a valid machine name (lowercase letters, digits, dashes, max 24)."""
    if not MACHINE_NAME_PATTERN.match(name):
        raise MvmError(
            f"invalid machine name {name!r}: use lowercase letters, digits and dashes "
            "(start with a letter, at most 24 characters)"
        )


def generate_machine_name(taken_names, rng=random):
    """A random `adjective-noun` machine name that is not in TAKEN_NAMES (like boxd's default names)."""
    for _ in range(200):
        name = f"{rng.choice(GENERATED_NAME_ADJECTIVES)}-{rng.choice(GENERATED_NAME_NOUNS)}"
        if name not in taken_names:
            return name
    raise MvmError("could not generate a free machine name; pass one explicitly")


def machine_name_from_ssh_host(host):
    """`brisk-otter.mvm` -> `brisk-otter` (ssh passes %h to the ProxyCommand)."""
    return host[: -len(SSH_HOST_SUFFIX)] if host.endswith(SSH_HOST_SUFFIX) else host


def ssh_host_for_machine(name):
    return f"{name}{SSH_HOST_SUFFIX}"


def machine_record_path(name):
    return MACHINES_DIR / f"{name}.json"


def new_machine_record(name, ttl_seconds, dev_server_port):
    """A name reservation: a MachineRecord whose microvmId and endpoint `mvm new` fills in once AWS started it.

    MachineRecord keys: name, microvmId, endpoint, region, createdAt (UTC ISO), createdOn (laptop
    name), ttlSeconds, devServerPort (the machine's own dev server port, see machine_port_forwarding).
    Records written before the shared registry have no createdOn, and before `mvm forward` no
    devServerPort.
    """
    return {
        "name": name,
        "microvmId": None,
        "endpoint": None,
        "region": REGION,
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "createdOn": LAPTOP_NAME,
        "ttlSeconds": ttl_seconds,
        "devServerPort": dev_server_port,
    }


def is_machine_reservation(record):
    """True while `mvm new` (on any laptop) has reserved the name but not started the MicroVM yet."""
    return not record.get("microvmId")


def machine_record_bytes(record):
    """The one serialization of a MachineRecord, in the mirror and the shared registry alike.

    Indented JSON: completions/mvm.fish reads `"devServerPort": 3101` with a regex.
    """
    return (json.dumps(record, indent=2) + "\n").encode()


def find_machine_record(name):
    """NAME's MachineRecord in the local mirror, or None. See shared_machine_registry.resolve_machine_record."""
    path = machine_record_path(name)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def save_machine_record(record):
    """Write RECORD to the local mirror only (shared_machine_registry writes the shared copy)."""
    save_machine_record_bytes(record["name"], machine_record_bytes(record))


def save_machine_record_bytes(name, data):
    """Write NAME's mirror file with exactly DATA, the bytes of its shared record."""
    MACHINES_DIR.mkdir(parents=True, exist_ok=True)
    machine_record_path(name).write_bytes(data)


def mirrored_machine_record_etag(name):
    """The S3-style ETag (quoted MD5) of NAME's mirror file, or None when this laptop has no record for NAME.

    Equal to the shared record's ETag exactly when the mirror is up to date.
    """
    path = machine_record_path(name)
    if not path.exists():
        return None
    return '"' + hashlib.md5(path.read_bytes()).hexdigest() + '"'


def list_machine_records():
    """Every MachineRecord in the local mirror (all laptops' machines as of the last refresh), sorted by name."""
    if not MACHINES_DIR.exists():
        return []
    return [json.loads(path.read_text()) for path in sorted(MACHINES_DIR.glob("*.json"))]


def machine_expires_at(record):
    """When Lambda terminates the machine: createdAt + ttlSeconds (8h for records written before ttlSeconds)."""
    created = dt.datetime.fromisoformat(record["createdAt"])
    return created + dt.timedelta(seconds=record.get("ttlSeconds") or MAX_LIFETIME_SECONDS)


def delete_machine_record(name):
    """Forget NAME on this laptop: its mirror record and its ssh host key. Only for machines AWS confirmed ended."""
    machine_record_path(name).unlink(missing_ok=True)
    forget_machine_host_key(name)


def forget_machine_host_key(name):
    """Drop NAME.mvm from ~/.ssh/known_hosts_mvm: every MicroVM gets fresh host keys."""
    if KNOWN_HOSTS.exists():
        subprocess.run(["ssh-keygen", "-R", ssh_host_for_machine(name), "-f", str(KNOWN_HOSTS)], capture_output=True)
