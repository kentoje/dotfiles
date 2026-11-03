"""Cleanup of ended machines: drop their shared record, mirror record, herdr and tuios entries, ssh host key and port forwards.

Machines end on their own (8h cap) or through `mvm rm` on any laptop. `mvm new|rm|ls` prune them,
and so does `mvm proxy` when herdr or a tuios window tries to reconnect to one. Fails closed: a record is forgotten
only after AWS confirms the MicroVM ended, never because a listing or an auth call failed, and a
shared record only in the version that still points at the ended MicroVM.
"""

import datetime as dt

from mvm_cli.aws_cli_access import ENDED_MICROVM_STATES, microvm_has_ended
from mvm_cli.herdr_machine_sync import list_herdr_mvm_profiles, remove_machine_from_herdr
from mvm_cli.machine_port_forwarding import forget_machine_port_forwards
from mvm_cli.machine_registry import (
    delete_machine_record,
    find_machine_record,
    is_machine_reservation,
    list_machine_records,
    machine_name_from_ssh_host,
)
from mvm_cli.mvm_errors import log_mvm
from mvm_cli.mvm_settings import ABANDONED_RESERVATION_SECONDS
from mvm_cli.shared_machine_registry import (
    delete_shared_machine_record,
    fetch_shared_machine_record,
    refresh_machine_registry_mirror,
    upload_local_only_machine_record,
)
from mvm_cli.tuios_machine_session import (
    close_tuios_session_for_machine,
    list_tuios_machine_sessions,
    machine_name_for_tuios_session,
)


def forget_ended_machine(name, ended_microvm_id, herdr_profiles=None):
    """Forget NAME on all laptops' registry and on this laptop (herdr, tuios), once AWS confirmed ENDED_MICROVM_ID ended.

    Names are reused, possibly by another laptop: when NAME's shared record now points at another
    MicroVM (`mvm rm X && mvm new X` while a stale herdr proxy for the old X was still exiting),
    keep everything, mirror the new record and return False.
    """
    shared = fetch_shared_machine_record(name)
    if shared is not None:
        if shared.record.get("microvmId") != ended_microvm_id:
            return False
        if not delete_shared_machine_record(name, shared.etag):
            return False
    record = find_machine_record(name)
    if record is not None and record.get("microvmId") != ended_microvm_id:
        return False
    # Frees the laptop ports `mvm forward` held for it (the master may already be gone).
    forget_machine_port_forwards(name)
    # Record first: a new machine saves its record before its herdr entry, so once the record is
    # gone no herdr entry for NAME can belong to a newer machine.
    delete_machine_record(name)
    remove_machine_from_herdr(name, herdr_profiles)
    close_tuios_session_for_machine(name)
    return True


def forget_abandoned_reservation(record):
    """Drop a name reservation whose `mvm new` never started a MicroVM (run-microvm failed, laptop crashed).

    Only when it is older than ABANDONED_RESERVATION_SECONDS and still the same reservation in the
    shared registry. Returns True when dropped.
    """
    created_at = dt.datetime.fromisoformat(record["createdAt"])
    if (
        dt.datetime.now(dt.timezone.utc) - created_at
    ).total_seconds() < ABANDONED_RESERVATION_SECONDS:
        return False
    name = record["name"]
    shared = fetch_shared_machine_record(name)
    if shared is not None:
        if shared.record != record:
            return False  # started or replaced meanwhile; the mirror now has the new record
        if not delete_shared_machine_record(name, shared.etag):
            return False
    delete_machine_record(name)
    log_mvm(f"{name}: dropped a name reservation whose machine never started")
    return True


def prune_ended_machines(microvm_listing):
    """Refresh the mirror, then forget every machine AWS confirms ended, and herdr `*.mvm` entries and tuios `aws-*` sessions with no record.

    Also shares live machines only this laptop knows (started before the shared registry) and drops
    abandoned name reservations. MICROVM_LISTING must come from a successful list_image_microvms()
    call. Returns pruned names.
    """
    shared_names = refresh_machine_registry_mirror()
    live_ids = {
        m["microvmId"]
        for m in microvm_listing
        if m.get("state") not in ENDED_MICROVM_STATES
    }
    herdr_profiles = list_herdr_mvm_profiles()
    pruned = []
    for record in list_machine_records():
        if is_machine_reservation(record):
            forget_abandoned_reservation(record)
            continue
        if record["microvmId"] in live_ids:
            if record["name"] not in shared_names:
                upload_local_only_machine_record(record)
            continue
        # Absent from the listing is not proof: confirm with get-microvm before forgetting.
        if not microvm_has_ended(record["microvmId"]):
            continue
        if forget_ended_machine(record["name"], record["microvmId"], herdr_profiles or []):
            pruned.append(record["name"])
    # Without a record nothing can connect through these entries (the proxy needs it).
    recorded_names = {record["name"] for record in list_machine_records()}
    for profile in herdr_profiles or []:
        name = machine_name_from_ssh_host(profile["target"])
        if name not in recorded_names and name not in pruned:
            remove_machine_from_herdr(name, [profile])
            pruned.append(name)
    for session in list_tuios_machine_sessions() or []:
        name = machine_name_for_tuios_session(session)
        if name not in recorded_names and close_tuios_session_for_machine(name) and name not in pruned:
            pruned.append(name)
    for name in pruned:
        log_mvm(f"{name}: ended, removed from herdr, tuios and local state")
    return pruned
