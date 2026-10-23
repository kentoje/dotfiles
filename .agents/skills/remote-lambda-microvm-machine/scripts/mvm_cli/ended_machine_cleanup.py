"""Cleanup of ended machines: drop their herdr and tuios entries, local name record, ssh host key and port forwards.

Machines end on their own (8h cap) or through `mvm rm`. `mvm new|rm|ls` prune them, and so does
`mvm proxy` when herdr or tuios tries to reconnect to one. Fails closed: a record is forgotten only after
AWS confirms the MicroVM ended, never because a listing or an auth call failed.
"""

from mvm_cli.aws_cli_access import ENDED_MICROVM_STATES, microvm_has_ended
from mvm_cli.herdr_machine_sync import list_herdr_mvm_profiles, remove_machine_from_herdr
from mvm_cli.machine_port_forwarding import forget_machine_port_forwards
from mvm_cli.machine_registry import (
    delete_machine_record,
    find_machine_record,
    list_machine_records,
    machine_name_from_ssh_host,
)
from mvm_cli.mvm_errors import log_mvm
from mvm_cli.tuios_host_sync import write_tuios_mvm_hosts


def forget_ended_machine(name, ended_microvm_id, herdr_profiles=None):
    """Remove NAME from local state, herdr and tuios, once AWS confirmed ENDED_MICROVM_ID ended.

    Names are reused: when NAME's record now points at another MicroVM (`mvm rm X && mvm new X`
    while a stale herdr proxy for the old X was still exiting), keep everything and return False.
    """
    record = find_machine_record(name)
    if record is not None and record["microvmId"] != ended_microvm_id:
        return False
    # Frees the laptop ports `mvm forward` held for it (the master may already be gone).
    forget_machine_port_forwards(name)
    # Record first: a new machine saves its record before its herdr entry, so once the record is
    # gone no herdr entry for NAME can belong to a newer machine.
    delete_machine_record(name)
    remove_machine_from_herdr(name, herdr_profiles)
    # Rebuilt from the records, so NAME's tuios host goes (tuios applies a removal at once).
    write_tuios_mvm_hosts()
    return True


def prune_ended_machines(microvm_listing):
    """Forget every local machine that AWS confirms ended, and herdr `*.mvm` entries with no record.

    MICROVM_LISTING must come from a successful list_image_microvms() call. Returns pruned names.
    """
    live_ids = {m["microvmId"] for m in microvm_listing if m.get("state") not in ENDED_MICROVM_STATES}
    herdr_profiles = list_herdr_mvm_profiles()
    pruned = []
    for record in list_machine_records():
        if record["microvmId"] in live_ids:
            continue
        # Absent from the listing is not proof: confirm with get-microvm before forgetting.
        if not microvm_has_ended(record["microvmId"]):
            continue
        if forget_ended_machine(record["name"], record["microvmId"], herdr_profiles or []):
            pruned.append(record["name"])
    if herdr_profiles is not None:
        # Without a local record nothing can connect through these entries (the proxy needs it).
        recorded_names = {record["name"] for record in list_machine_records()}
        for profile in herdr_profiles:
            name = machine_name_from_ssh_host(profile["target"])
            if name not in recorded_names and name not in pruned:
                remove_machine_from_herdr(name, [profile])
                pruned.append(name)
    for name in pruned:
        log_mvm(f"{name}: ended, removed from herdr, tuios and local state")
    return pruned
