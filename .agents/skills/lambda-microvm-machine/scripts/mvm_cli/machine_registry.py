"""Local registry of mvm machine names: MicroVMs only have ids, so `<name> -> microvmId` lives here.

One JSON file per machine in ~/.local/state/mvm/machines/<name>.json (a MachineRecord). It is the
only name map: never delete a record unless AWS confirmed the MicroVM ended.
"""

import contextlib
import datetime as dt
import fcntl
import json
import random
import re
import subprocess

from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings import (
    KNOWN_HOSTS,
    MACHINES_DIR,
    MAX_LIFETIME_SECONDS,
    REGION,
    SSH_HOST_SUFFIX,
    STATE_DIR,
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


def new_machine_record(name, microvm_id, endpoint, ttl_seconds, dev_server_port):
    """A MachineRecord dict: name, microvmId, endpoint, region, createdAt (UTC ISO), ttlSeconds, devServerPort.

    devServerPort: the machine's own dev server port (see machine_port_forwarding); absent in
    records written before `mvm forward` existed.
    """
    return {
        "name": name,
        "microvmId": microvm_id,
        "endpoint": endpoint,
        "region": REGION,
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "ttlSeconds": ttl_seconds,
        "devServerPort": dev_server_port,
    }


@contextlib.contextmanager
def machine_creation_lock():
    """Serialize `mvm new` on this laptop, from choosing a name and dev server port to saving the record.

    Without it, parallel `mvm new` runs read the same records and pick the same devServerPort.
    """
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with open(STATE_DIR / "new-machine.lock", "w") as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        yield


def find_machine_record(name):
    """The MachineRecord for NAME, or None when this laptop has no machine by that name."""
    path = machine_record_path(name)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def load_machine_record(name):
    record = find_machine_record(name)
    if record is None:
        raise MvmError(f"unknown machine {name!r} (see `mvm ls`)")
    return record


def save_machine_record(record):
    MACHINES_DIR.mkdir(parents=True, exist_ok=True)
    machine_record_path(record["name"]).write_text(json.dumps(record, indent=2) + "\n")


def list_machine_records():
    """All MachineRecords on this laptop, sorted by name."""
    if not MACHINES_DIR.exists():
        return []
    return [json.loads(path.read_text()) for path in sorted(MACHINES_DIR.glob("*.json"))]


def machine_expires_at(record):
    """When Lambda terminates the machine: createdAt + ttlSeconds (8h for records written before ttlSeconds)."""
    created = dt.datetime.fromisoformat(record["createdAt"])
    return created + dt.timedelta(seconds=record.get("ttlSeconds") or MAX_LIFETIME_SECONDS)


def delete_machine_record(name):
    """Forget NAME locally: its record and its ssh host key. Only for machines AWS confirmed ended."""
    machine_record_path(name).unlink(missing_ok=True)
    forget_machine_host_key(name)


def forget_machine_host_key(name):
    """Drop NAME.mvm from ~/.ssh/known_hosts_mvm: every MicroVM gets fresh host keys."""
    if KNOWN_HOSTS.exists():
        subprocess.run(["ssh-keygen", "-R", ssh_host_for_machine(name), "-f", str(KNOWN_HOSTS)], capture_output=True)
