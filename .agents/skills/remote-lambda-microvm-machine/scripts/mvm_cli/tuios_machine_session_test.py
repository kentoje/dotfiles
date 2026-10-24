"""Tests for tuios_machine_session: the `aws-<name>` session, its ssh window, and never closing the caller's session."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from mvm_cli import tuios_machine_session


class FakeTuiosDaemon:
    """Answers `tuios call` like the daemon does: sessions by name, errors as {"error": {"code": ...}}."""

    def __init__(self, sessions=(), window_error=None):
        self.sessions = {name: "mvm" for name in sessions}
        self.window_error = window_error
        self.calls = []

    def call(self, verb, params, timeout=30):
        self.calls.append((verb, params))
        if verb == "new-session":
            if params["name"] in self.sessions:
                return {"error": {"code": "session_exists", "message": f"session {params['name']} already exists"}}
            self.sessions[params["name"]] = params.get("space")
            return {"type": "session_created", "session": params["name"]}
        if verb == "kill-session":
            if self.sessions.pop(params["session"], None) is None:
                return {"error": {"code": "session_not_found", "message": "not found"}}
            return {"type": "ok"}
        if verb == "new-window":
            if self.window_error:
                return {"error": {"code": self.window_error, "message": "failed to start ssh"}}
            return {"type": "window_created"}
        if verb == "list-sessions":
            return {"sessions": [{"name": name, "space": space} for name, space in self.sessions.items()]}
        raise AssertionError(f"unexpected verb {verb}")

    def verbs(self):
        return [verb for verb, _ in self.calls]


class TuiosMachineSessionTest(unittest.TestCase):
    def setUp(self):
        patches = [
            mock.patch.object(tuios_machine_session.shutil, "which", side_effect=lambda tool: f"/usr/bin/{tool}"),
            mock.patch.object(tuios_machine_session, "start_machine_tuios_session", return_value=True),
            mock.patch.object(tuios_machine_session, "log_mvm"),
            mock.patch.dict(os.environ, {k: v for k, v in os.environ.items() if k != "TUIOS_SESSION"}, clear=True),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def open_with(self, daemon):
        with mock.patch.object(tuios_machine_session, "call_tuios_verb", side_effect=daemon.call):
            return tuios_machine_session.open_tuios_session_for_machine("dev")

    def test_opens_a_session_in_the_mvm_space_with_one_ssh_window(self):
        daemon = FakeTuiosDaemon()
        self.assertEqual(self.open_with(daemon), "aws-dev")
        self.assertEqual(daemon.calls[0], ("new-session", {"name": "aws-dev", "space": "mvm", "window": False}))
        verb, window = daemon.calls[1]
        self.assertEqual(verb, "new-window")
        self.assertEqual(window["session"], "aws-dev")
        self.assertEqual(window["name"], "dev.mvm")
        self.assertEqual(
            window["command"],
            [
                "/usr/bin/ssh",
                "-t",
                "dev.mvm",
                "/home/dev/.local/bin/tuios",
                "attach",
                "main",
                "--create",
                "--terminal-mode",
            ],
        )
        self.assertEqual(window["grants"], ["none"])
        self.assertTrue(window["keep_open"])
        self.assertFalse(window["focus"])

    def test_replaces_a_session_left_by_an_earlier_machine(self):
        daemon = FakeTuiosDaemon(sessions=["aws-dev"])
        self.assertEqual(self.open_with(daemon), "aws-dev")
        self.assertEqual(daemon.verbs(), ["new-session", "kill-session", "new-session", "new-window"])

    def test_inside_the_session_adds_the_window_without_closing_it(self):
        daemon = FakeTuiosDaemon(sessions=["aws-dev"])
        with mock.patch.dict(os.environ, {"TUIOS_SESSION": "aws-dev"}):
            self.assertEqual(self.open_with(daemon), "aws-dev")
        self.assertEqual(daemon.verbs(), ["new-session", "new-window"])

    def test_failed_window_closes_the_new_session(self):
        daemon = FakeTuiosDaemon(window_error="window_not_found")
        self.assertIsNone(self.open_with(daemon))
        self.assertEqual(daemon.verbs(), ["new-session", "new-window", "kill-session"])
        self.assertEqual(daemon.sessions, {})

    def test_without_tuios_does_nothing(self):
        daemon = FakeTuiosDaemon()
        with mock.patch.object(tuios_machine_session.shutil, "which", return_value=None):
            self.assertIsNone(self.open_with(daemon))
        self.assertEqual(daemon.calls, [])

    def test_close_treats_a_missing_session_as_closed(self):
        daemon = FakeTuiosDaemon()
        with mock.patch.object(tuios_machine_session, "call_tuios_verb", side_effect=daemon.call):
            self.assertTrue(tuios_machine_session.close_tuios_session_for_machine("dev"))

    def test_close_never_kills_the_callers_session(self):
        daemon = FakeTuiosDaemon(sessions=["aws-dev"])
        with mock.patch.dict(os.environ, {"TUIOS_SESSION": "aws-dev"}):
            with mock.patch.object(tuios_machine_session, "call_tuios_verb", side_effect=daemon.call):
                self.assertFalse(tuios_machine_session.close_tuios_session_for_machine("dev"))
        self.assertEqual(daemon.calls, [])

    def test_lists_only_aws_sessions_in_the_mvm_space(self):
        daemon = FakeTuiosDaemon(sessions=["aws-dev"])
        daemon.sessions.update({"aws-mine": None, "work": "mvm"})
        with mock.patch.object(tuios_machine_session, "call_tuios_verb", side_effect=daemon.call):
            self.assertEqual(tuios_machine_session.list_tuios_machine_sessions(), ["aws-dev"])

    def test_unanswered_listing_is_unknown_not_empty(self):
        no_reply = {"error": {"code": "no_reply", "message": "daemon not running"}}
        with mock.patch.object(tuios_machine_session, "call_tuios_verb", return_value=no_reply):
            self.assertIsNone(tuios_machine_session.list_tuios_machine_sessions())

    def test_call_turns_a_plain_text_failure_into_no_reply(self):
        failed = subprocess.CompletedProcess([], 1, stdout="", stderr="no daemon running")
        with mock.patch.object(tuios_machine_session.subprocess, "run", return_value=failed):
            reply = tuios_machine_session.call_tuios_verb("list-sessions", {})
        self.assertEqual(reply["error"]["code"], "no_reply")

    def test_tuios_command_reopens_a_known_machine_and_prints_the_session(self):
        daemon = FakeTuiosDaemon(sessions=["aws-dev"])
        args = mock.Mock(name="args")
        args.name = "dev"
        with mock.patch.object(tuios_machine_session, "load_machine_record", return_value={"name": "dev"}):
            with mock.patch.object(tuios_machine_session, "call_tuios_verb", side_effect=daemon.call):
                with mock.patch("builtins.print") as printed:
                    tuios_machine_session.cmd_tuios(args)
        printed.assert_called_once_with("aws-dev")
        self.assertEqual(daemon.verbs(), ["new-session", "kill-session", "new-session", "new-window"])

    def test_tuios_command_refuses_an_unknown_machine(self):
        args = mock.Mock(name="args")
        args.name = "nope"
        unknown = tuios_machine_session.MvmError("unknown machine 'nope' (see `mvm ls`)")
        with mock.patch.object(tuios_machine_session, "load_machine_record", side_effect=unknown):
            with self.assertRaises(tuios_machine_session.MvmError):
                tuios_machine_session.cmd_tuios(args)

    def test_machine_script_writes_the_config_file_then_creates_main(self):
        with tempfile.TemporaryDirectory() as home:
            result = subprocess.run(
                ["bash", "-c", tuios_machine_session.render_machine_tuios_session_script()],
                env={"HOME": home, "PATH": os.environ.get("PATH", "")},
                capture_output=True,
                text=True,
            )
            written = (Path(home) / ".config/tuios/config.d/mvm-laptop-window.toml").read_text()
        # No tuios at /home/dev here: `tuios new` fails, the script still succeeds.
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(written, tuios_machine_session.MACHINE_TUIOS_CONFIG_TOML)
        self.assertIn('dockbar_position = "hidden"', written)
        self.assertIn("[appearance.sidebar]\nenabled = false", written)
        script = tuios_machine_session.render_machine_tuios_session_script()
        self.assertIn("T=/home/dev/.local/bin/tuios", script)
        # Created when missing; an existing `main` without a window gets one.
        self.assertIn("$T new --detach main >/dev/null 2>&1 ||", script)
        self.assertIn("$T new-window -s main", script)


if __name__ == "__main__":
    unittest.main()
