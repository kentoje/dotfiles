"""Tests for cli_main: the command surface and the hidden `proxy` command."""

import contextlib
import io
import unittest

from mvm_cli import cli_main


class MvmParserTest(unittest.TestCase):
    def setUp(self):
        self.parser = cli_main.build_mvm_parser()

    def test_help_lists_commands_once_and_hides_proxy(self):
        text = self.parser.format_help()
        self.assertNotIn("proxy", text)
        self.assertEqual(text.count("new [NAME]"), 1)
        self.assertNotIn("positional arguments", text)
        self.assertTrue(text.startswith("usage: mvm COMMAND [ARGS...]\n"), text)

    def test_subcommand_usage_names_the_command(self):
        rm = self.parser._subparsers._group_actions[0].choices["rm"]
        self.assertTrue(rm.format_usage().startswith("usage: mvm rm "), rm.format_usage())

    def test_parses_the_daily_commands(self):
        self.assertIsNone(self.parser.parse_args(["new"]).name)
        self.assertEqual(self.parser.parse_args(["new", "dev", "--ttl", "2h"]).ttl, "2h")
        self.assertEqual(self.parser.parse_args(["rm", "a", "b", "--discard"]).names, ["a", "b"])
        self.assertTrue(self.parser.parse_args(["ls", "--json"]).json)
        self.assertEqual(self.parser.parse_args(["ssh", "dev", "uptime", "-a"]).command, ["uptime", "-a"])
        self.assertTrue(self.parser.parse_args(["logs", "dev", "-f"]).follow)
        self.assertEqual(self.parser.parse_args(["forward", "dev"]).ports, [])
        self.assertEqual(self.parser.parse_args(["forward", "dev", "3101", "23456"]).ports, [3101, 23456])
        self.assertTrue(self.parser.parse_args(["forward", "dev", "--stop"]).stop)
        self.assertEqual(self.parser.parse_args(["proxy", "dev.mvm"]).host, "dev.mvm")

    def test_dropped_commands_are_gone(self):
        for command in ["exec", "cp", "get", "doctor", "bootstrap", "suspend", "resume"]:
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit, msg=command):
                self.parser.parse_args([command, "dev"])

    def test_forward_rejects_invalid_ports(self):
        for port in ["0", "65536", "http"]:
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit, msg=port):
                self.parser.parse_args(["forward", "dev", port])

    def test_rm_needs_a_name(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            self.parser.parse_args(["rm"])


if __name__ == "__main__":
    unittest.main()
