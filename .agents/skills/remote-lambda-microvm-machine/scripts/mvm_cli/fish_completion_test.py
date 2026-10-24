"""Tests for the fish completion (scripts/completions/mvm.fish): it must keep up with build_mvm_parser()."""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from mvm_cli import cli_main
from mvm_cli.mvm_settings import MVM_FISH_COMPLETION_SOURCE

HIDDEN_COMMANDS = {"proxy"}


def subcommand_parsers(parser):
    """{name: subparser} for PARSER's subcommands, aliases (`list`) folded into their main name."""
    if parser._subparsers is None:
        return {}
    choices = parser._subparsers._group_actions[0].choices
    by_parser = {}
    for name, subparser in choices.items():
        by_parser.setdefault(id(subparser), (name, subparser))
    return dict(by_parser.values())


def long_options(parser):
    return [s for action in parser._actions for s in action.option_strings if s.startswith("--") and s != "--help"]


class FishCompletionCoversParserTest(unittest.TestCase):
    def setUp(self):
        self.lines = MVM_FISH_COMPLETION_SOURCE.read_text().splitlines()

    def completion_lines_for(self, command):
        return [line for line in self.lines if "__fish_seen_subcommand_from" in line and f" {command}" in line]

    def test_every_visible_command_is_offered(self):
        top_level = [line for line in self.lines if "__fish_use_subcommand" in line]
        for name in subcommand_parsers(cli_main.build_mvm_parser()):
            offered = any(f"-a {name} " in line for line in top_level)
            self.assertEqual(offered, name not in HIDDEN_COMMANDS, name)

    def test_every_flag_and_nested_command_is_offered(self):
        for name, subparser in subcommand_parsers(cli_main.build_mvm_parser()).items():
            if name in HIDDEN_COMMANDS:
                continue
            lines = self.completion_lines_for(name)
            for option in long_options(subparser):
                self.assertTrue(any(f"-l {option[2:]} " in line for line in lines), f"mvm {name} {option}")
            for nested_name, nested in subcommand_parsers(subparser).items():
                self.assertTrue(any(f"-a {nested_name} " in line for line in lines), f"mvm {name} {nested_name}")
                nested_lines = self.completion_lines_for(nested_name)
                for option in long_options(nested):
                    self.assertTrue(
                        any(f"-l {option[2:]} " in line for line in nested_lines), f"mvm {name} {nested_name} {option}"
                    )


@unittest.skipUnless(shutil.which("fish"), "fish is not installed")
class FishCompletionInFishTest(unittest.TestCase):
    """Runs the completion in a config-less fish against a scratch MVM_STATE_DIR."""

    def complete(self, command_line):
        with tempfile.TemporaryDirectory() as state_dir:
            (Path(state_dir) / "machines").mkdir()
            for name in ["dev", "quiet-yak"]:
                (Path(state_dir) / "machines" / f"{name}.json").write_text("{}")
            (Path(state_dir) / "machines" / "dev.json").write_text('{\n  "devServerPort": 3101\n}\n')
            result = subprocess.run(
                [
                    "fish",
                    "--no-config",
                    "-c",
                    'source $argv[1]; complete -C "$argv[2]"',
                    MVM_FISH_COMPLETION_SOURCE,
                    command_line,
                ],
                env={**os.environ, "MVM_STATE_DIR": state_dir},
                capture_output=True,
                text=True,
                check=True,
            )
        return [line.split("\t")[0] for line in result.stdout.splitlines()]

    def test_commands_hide_proxy(self):
        self.assertEqual(
            sorted(self.complete("mvm ")),
            ["forward", "image", "logs", "ls", "new", "rm", "secrets", "setup", "ssh", "tuios"],
        )

    def test_machine_names_come_from_local_records(self):
        self.assertEqual(sorted(self.complete("mvm rm ")), ["dev", "quiet-yak"])
        self.assertEqual(self.complete("mvm rm dev "), ["quiet-yak"])
        self.assertEqual(sorted(self.complete("mvm logs --since 2h ")), ["dev", "quiet-yak"])

    def test_forward_offers_names_then_the_dev_server_port(self):
        self.assertEqual(sorted(self.complete("mvm forward ")), ["dev", "quiet-yak"])
        self.assertEqual(self.complete("mvm forward dev "), ["3101"])
        self.assertEqual(self.complete("mvm forward quiet-yak "), [])
        self.assertEqual(self.complete("mvm forward dev --st"), ["--stop"])

    def test_ssh_and_tuios_stop_completing_after_the_name(self):
        self.assertEqual(sorted(self.complete("mvm ssh ")), ["dev", "quiet-yak"])
        self.assertEqual(sorted(self.complete("mvm tuios ")), ["dev", "quiet-yak"])
        self.assertEqual(self.complete("mvm tuios dev "), [])
        self.assertEqual(self.complete("mvm ssh dev "), [])


if __name__ == "__main__":
    unittest.main()
