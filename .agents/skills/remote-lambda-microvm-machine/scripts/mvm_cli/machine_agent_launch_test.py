"""Tests for `mvm agent`: agent command lines, the agent's directory, and the launch script run over ssh."""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from mvm_cli import machine_agent_launch
from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings import MACHINE_AGENT_KINDS, TUIOS_REMOTE_BINARY, default_machine_agent


class MachineAgentCommandLineTest(unittest.TestCase):
    def test_every_agent_kind_has_a_command_line(self):
        self.assertEqual(sorted(machine_agent_launch.MACHINE_AGENT_COMMAND_LINES), sorted(MACHINE_AGENT_KINDS))

    def test_prompt_file_is_the_first_message(self):
        line = machine_agent_launch.machine_agent_command_line
        self.assertEqual(line("claude", "/tmp/p.md"), 'claude "$(cat /tmp/p.md)"')
        self.assertEqual(line("omp", "/tmp/p.md"), "omp @/tmp/p.md")
        self.assertEqual(line("pi", "/tmp/p.md"), "pi --approve @/tmp/p.md")
        self.assertEqual(line("claude"), "claude")


class ResolveMachineAgentCwdTest(unittest.TestCase):
    def test_paths_resolve_on_the_machine(self):
        resolve = machine_agent_launch.resolve_machine_agent_cwd
        self.assertEqual(resolve("~/dotfiles"), "/home/dev/dotfiles")
        self.assertEqual(resolve("/tmp/x"), "/tmp/x")
        self.assertEqual(resolve("Documents/x"), "/home/dev/Documents/x")
        with mock.patch.object(machine_agent_launch, "workspace_repo_paths", return_value=["group/repo", "b/c"]):
            self.assertEqual(resolve(None), "/home/dev/Documents/gitlab/aircall/group/repo")


class DefaultMachineAgentTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.settings = Path(tmp.name) / "settings.json"
        patcher = mock.patch.dict(os.environ, {"MVM_SETTINGS_FILE": str(self.settings)})
        patcher.start()
        self.addCleanup(patcher.stop)
        os.environ.pop("MVM_DEFAULT_AGENT", None)

    def test_settings_choose_else_pi(self):
        self.assertEqual(default_machine_agent(), "pi")
        self.settings.write_text(json.dumps({"defaultAgent": "claude"}))
        self.assertEqual(default_machine_agent(), "claude")
        self.settings.write_text(json.dumps({"defaultAgent": "cursor"}))
        with self.assertRaises(MvmError):
            default_machine_agent()


@unittest.skipUnless(shutil.which("jq") and shutil.which("bash"), "needs bash and jq")
class MachineAgentLaunchScriptTest(unittest.TestCase):
    """Runs the rendered script with a fake tuios that records send-text and reports a focused window."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.home = Path(tmp.name)
        self.cwd = self.home / "checkout"
        self.cwd.mkdir()
        status = self.home / ".local/state/mvm/bootstrap-status.json"
        status.parent.mkdir(parents=True)
        status.write_text(json.dumps({"phase": "ready"}))
        self.sent = self.home / "sent.txt"
        self.fake_tuios = self.home / "tuios"
        self.foreground("bash")

    def foreground(self, command):
        windows = json.dumps(
            {"windows": [{"focused": False, "foreground_cmd": "x"}, {"focused": True, "foreground_cmd": command}]}
        )
        self.fake_tuios.write_text(
            "#!/bin/bash\n"
            f"case $1 in list-windows) echo '{windows}' ;; send-text) printf '%s' \"$4\" > {self.sent} ;; esac\n"
        )
        self.fake_tuios.chmod(0o755)

    def run_script(self, agent, prompt_path=None, prompt=""):
        script = machine_agent_launch.render_machine_agent_launch_script(agent, str(self.cwd), prompt_path)
        script = script.replace(f"T={TUIOS_REMOTE_BINARY}", f"T={self.fake_tuios}")
        return subprocess.run(
            ["bash", "-c", script],
            input=prompt,
            capture_output=True,
            text=True,
            env={**os.environ, "HOME": str(self.home)},
        )

    def test_saves_the_prompt_and_types_the_agent_into_main(self):
        prompt_path = str(self.home / "prompt.md")
        result = self.run_script("claude", prompt_path, 'fix it\'s "bug"')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(Path(prompt_path).read_text(), 'fix it\'s "bug"')
        self.assertEqual(self.sent.read_text(), f'cd {self.cwd} && claude "$(cat {prompt_path})"\n')
        # Claude would otherwise stop on its folder trust question in the agent's directory.
        claude_state = json.loads((self.home / ".claude.json").read_text())
        self.assertTrue(claude_state["projects"][str(self.cwd)]["hasTrustDialogAccepted"])

    def test_keeps_the_rest_of_claude_state_when_trusting(self):
        (self.home / ".claude.json").write_text(json.dumps({"hasCompletedOnboarding": True, "projects": {"/a": {}}}))
        self.assertEqual(self.run_script("claude").returncode, 0)
        claude_state = json.loads((self.home / ".claude.json").read_text())
        self.assertTrue(claude_state["hasCompletedOnboarding"])
        self.assertEqual(sorted(claude_state["projects"]), ["/a", str(self.cwd)])

    def test_other_agents_leave_claude_state_alone(self):
        self.assertEqual(self.run_script("omp").returncode, 0)
        self.assertFalse((self.home / ".claude.json").exists())

    def test_refuses_a_busy_main_and_a_missing_directory(self):
        self.foreground("omp")
        result = self.run_script("pi")
        self.assertEqual(result.returncode, 1)
        self.assertIn("mvm agent: session main is busy running omp", result.stderr)
        self.assertFalse(self.sent.exists())
        self.foreground("bash")
        self.cwd.rmdir()
        result = self.run_script("pi")
        self.assertIn(f"mvm agent: no directory {self.cwd}", result.stderr)


if __name__ == "__main__":
    unittest.main()
