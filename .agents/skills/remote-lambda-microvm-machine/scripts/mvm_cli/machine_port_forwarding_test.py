"""Tests for machine_port_forwarding: dev server port choice, listen port discovery, `mvm forward` decisions."""

import socket
import unittest
from unittest import mock

from mvm_cli import machine_port_forwarding
from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings import DEV_SERVER_PORT_RANGE

# `id -u; ss -Hltne` on a v12 machine (fwd-probe), plus two dev listeners: a dev server on
# 0.0.0.0:3101 and a worktree dev server on [::1]:23456.
MACHINE_ID_AND_SS_OUTPUT = """1000
LISTEN 0      1024         0.0.0.0:2222  0.0.0.0:* ino:8401 sk:3001 cgroup:/ <->
LISTEN 0      128        127.0.0.1:55514 0.0.0.0:* uid:993 ino:9244 sk:3002 cgroup:unreachable:7c7 <->
LISTEN 0      4096       127.0.0.1:1144  0.0.0.0:* uid:991 ino:15412 sk:3003 cgroup:unreachable:85a <->
LISTEN 0      4096       127.0.0.1:34307 0.0.0.0:* ino:2590 sk:3004 cgroup:unreachable:91e <->
LISTEN 0      32     169.254.53.53:53    0.0.0.0:* ino:13359 sk:3005 cgroup:unreachable:7f8 <->
LISTEN 0      128        127.0.0.1:22    0.0.0.0:* ino:15449 sk:3006 cgroup:/ <->
LISTEN 0      5            0.0.0.0:9000  0.0.0.0:* ino:3161 sk:3008 cgroup:/ <->
LISTEN 0      4096               *:8443        *:* uid:991 ino:11362 sk:300a cgroup:unreachable:85a v6only:0 <->
LISTEN 0      511          0.0.0.0:3101  0.0.0.0:* uid:1000 ino:22222 sk:300c cgroup:/ <->
LISTEN 0      511            [::1]:23456    [::]:* uid:1000 ino:22223 sk:300d cgroup:/ v6only:1 <->
"""


class DevUserListenPortsTest(unittest.TestCase):
    def test_keeps_only_the_dev_users_ports(self):
        ports = machine_port_forwarding.parse_dev_user_listen_ports(MACHINE_ID_AND_SS_OUTPUT)
        self.assertEqual(ports, [3101, 23456])

    def test_never_forwards_the_machines_own_services(self):
        output = "1000\nLISTEN 0 5 0.0.0.0:9000 0.0.0.0:* uid:1000 ino:1 <->\n"
        self.assertEqual(machine_port_forwarding.parse_dev_user_listen_ports(output), [])

    def test_empty_output(self):
        self.assertEqual(machine_port_forwarding.parse_dev_user_listen_ports(""), [])


class DevServerPortChoiceTest(unittest.TestCase):
    def test_lowest_port_free_everywhere(self):
        first = DEV_SERVER_PORT_RANGE.start
        pick = machine_port_forwarding.pick_dev_server_port
        self.assertEqual(pick(set(), is_port_free=lambda port: True), first)
        self.assertEqual(pick({first}, is_port_free=lambda port: True), first + 1)
        self.assertEqual(pick({first}, is_port_free=lambda port: port != first + 1), first + 2)

    def test_full_range_is_an_error(self):
        with self.assertRaises(MvmError):
            machine_port_forwarding.pick_dev_server_port(set(DEV_SERVER_PORT_RANGE), is_port_free=lambda port: True)

    def test_laptop_port_probe_sees_a_listener(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            self.assertFalse(machine_port_forwarding.laptop_port_is_free(port))
        self.assertTrue(machine_port_forwarding.laptop_port_is_free(port))


class ForwardMachinePortsTest(unittest.TestCase):
    """forward_machine_ports with the ssh master, lsof and the laptop port probe faked out."""

    def setUp(self):
        self.master_pid = None
        self.forwarded = []
        self.busy_ports = set()
        self.listening = [3101]
        self.started = 0
        self.stopped = 0
        self.warnings = []
        fakes = {
            "find_forward_master_pid": lambda name: self.master_pid,
            "start_forward_master": self.start_master,
            "list_master_forwarded_ports": lambda pid: sorted(self.forwarded),
            "list_machine_dev_listen_ports": lambda name: list(self.listening),
            "laptop_port_is_free": lambda port: port not in self.busy_ports,
            "describe_laptop_port_holder": lambda port: "node (pid 42)",
            "add_port_forward": lambda name, port: self.forwarded.append(port),
            "stop_machine_port_forwards": self.stop_master,
            "load_machine_record": lambda name: {"name": name, "devServerPort": 3101},
            "log_mvm": self.warnings.append,
        }
        for attribute, fake in fakes.items():
            patch = mock.patch.object(machine_port_forwarding, attribute, side_effect=fake)
            patch.start()
            self.addCleanup(patch.stop)

    def start_master(self, name):
        self.started += 1
        self.master_pid = 4242
        return self.master_pid

    def stop_master(self, name):
        self.stopped += 1
        self.master_pid = None
        self.forwarded = []

    def forward(self, ports=()):
        return machine_port_forwarding.forward_machine_ports("dev", list(ports))

    def test_discovers_listening_ports_and_starts_one_master(self):
        self.listening = [3101, 23456]
        self.assertEqual(self.forward(), [3101, 23456])
        self.assertEqual(self.started, 1)

    def test_rerun_reuses_the_master_and_keeps_existing_forwards(self):
        self.forward([3101])
        self.assertEqual(self.forward([3101]), [3101])
        self.assertEqual((self.started, self.forwarded), (1, [3101]))

    def test_requested_busy_port_is_refused_with_its_holder(self):
        self.busy_ports = {3101}
        with self.assertRaises(MvmError) as raised:
            self.forward([3101])
        self.assertIn("port 3101 is in use on this laptop by node (pid 42)", str(raised.exception))
        # Nothing was forwarded: the master started for this call is closed again.
        self.assertEqual(self.stopped, 1)

    def test_discovered_busy_port_is_skipped_with_a_warning(self):
        self.listening = [3101, 9222]
        self.busy_ports = {9222}
        self.assertEqual(self.forward(), [3101])
        self.assertTrue(any("skipped port 9222" in line for line in self.warnings), self.warnings)

    def test_nothing_listening_names_the_dev_server_port(self):
        self.listening = []
        with self.assertRaises(MvmError) as raised:
            self.forward()
        self.assertIn("port 3101", str(raised.exception))
        self.assertEqual(self.stopped, 1)

    def test_running_master_is_not_closed_when_a_new_request_fails(self):
        self.forward([3101])
        self.busy_ports = {23456}
        with self.assertRaises(MvmError):
            self.forward([23456])
        self.assertEqual((self.stopped, self.forwarded), (0, [3101]))


if __name__ == "__main__":
    unittest.main()
