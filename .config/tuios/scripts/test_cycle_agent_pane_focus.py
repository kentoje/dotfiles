"""Exercise agent cycling without changing focus in the running TUiOS daemon."""

import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import socketserver
import threading
from contextlib import contextmanager


SCRIPT = Path(__file__).with_name("cycle-agent-pane-focus.sh")


def agent(window_id, workspace=1, session="work", **fields):
    return dict(window_id=window_id, workspace=workspace, session=session, **fields)


def detection(harness="codex", args=None, matched=True):
    return {
        "matched": matched,
        "process": {"argv": args or [harness]},
        "manifests": [{"id": harness, "matched": matched}],
    }


class CycleAgentPaneFocusTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.binary = SCRIPT.parent.parent / "agent-pane-focus/target/release/tuios-agent-pane-focus"
        subprocess.run(["cargo", "build", "--release", "--locked", "--manifest-path",
                        str(SCRIPT.parent.parent / "agent-pane-focus/Cargo.toml")], check=True)

    @contextmanager
    def daemon(self, fixture):
        calls = []
        class Handler(socketserver.StreamRequestHandler):
            def handle(self):
                for line in self.rfile:
                    request = json.loads(line)
                    verb, params = request["verb"], request["params"]
                    error = None
                    if verb in ("hello", "pane-grants"):
                        result = {}
                    elif verb == "list-clients":
                        result = {"clients": fixture.get("clients", [])}
                    elif verb == "list-agents":
                        result = {"agents": fixture["agents"]}
                    elif verb == "explain-agent-detect":
                        result = fixture["detections"][params["window"]]
                        if result is None:
                            error = {"code": "window_not_found", "message": "pane closed"}
                    else:
                        calls.append([verb, params])
                        error = fixture.get("errors", {}).get((verb, params.get("window")))
                        result = {}
                    response = {"id": request["id"]}
                    response["error" if error else "result"] = error or result
                    self.wfile.write((json.dumps(response) + "\n").encode())
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            path = str(Path(directory) / "tuios.sock")
            server = socketserver.ThreadingUnixStreamServer(path, Handler)
            thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.01))
            thread.start()
            try:
                yield path, calls
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def invoke(self, path, direction="next", current="a", session="work"):
        return subprocess.run(
            [str(self.binary), direction, "--socket", path, "--current", current, "--session", session],
            capture_output=True, text=True,
        )

    def cycle(self, agents, detections, direction="next", current="a", session="work", errors=None):
        with self.daemon(dict(agents=agents, detections=detections, errors=errors or {})) as (path, calls):
            result = self.invoke(path, direction, current, session)
            self.assertEqual(result.returncode, 0, result.stderr)
        converted = []
        for verb, params in calls:
            if verb == "focus-window":
                converted.append([verb, "-s", params["session"], params["window"]])
            elif verb == "switch-session":
                converted.append([verb, "-s", params["session"], params["name"]])
        return converted

    def test_skips_headless_claude_in_both_directions(self):
        panes = [agent("a"), agent("worker"), agent("b")]
        for flag in ("-p", "--print", "--print=true"):
            with self.subTest(flag=flag):
                detections = {"a": detection(), "b": detection(),
                              "worker": detection("claude-code", ["claude", flag, "Read Slack"])}
                self.assertEqual(self.cycle(panes, detections), [["focus-window", "-s", "work", "b"]])
                self.assertEqual(self.cycle(panes, detections, "prev", "b"), [["focus-window", "-s", "work", "a"]])

    def test_skips_stale_workflow_report_after_claude_exits(self):
        panes = [agent("a"), agent("worker"), agent("b")]
        detections = {"a": detection(), "b": detection(),
                      "worker": detection(args=["node", "scripts/slack-poll.ts"], matched=False)}
        self.assertEqual(self.cycle(panes, detections), [["focus-window", "-s", "work", "b"]])

    def test_keeps_interactive_claude_in_every_state(self):
        for state in ("working", "idle", "done", "needs_input", "unknown", "errored"):
            with self.subTest(state=state):
                panes = [agent("a"), agent("b", state=state)]
                detections = {"a": detection(), "b": detection("claude-code", ["claude"])}
                self.assertEqual(self.cycle(panes, detections), [["focus-window", "-s", "work", "b"]])

    def test_print_flag_in_prompt_is_not_a_cli_option(self):
        panes = [agent("a"), agent("b")]
        detections = {"a": detection(), "b": detection("claude-code", ["claude", "--", "--print"])}
        self.assertEqual(self.cycle(panes, detections), [["focus-window", "-s", "work", "b"]])

    def test_codex_profile_short_flag_is_interactive(self):
        panes = [agent("a"), agent("b")]
        detections = {"a": detection(), "b": detection(args=["codex", "-p", "work"])}
        self.assertEqual(self.cycle(panes, detections), [["focus-window", "-s", "work", "b"]])

    def test_protocol_panes_remain_reachable(self):
        panes = [agent("a"), agent("b", protocol="acp")]
        self.assertEqual(self.cycle(panes, {"a": detection()}), [["focus-window", "-s", "work", "b"]])

    def test_orders_workspaces_and_wraps_across_sessions(self):
        panes = [agent("c", session="other"), agent("b", workspace=2), agent("a")]
        detections = {key: detection() for key in ("a", "b", "c")}
        self.assertEqual(self.cycle(panes, detections), [["focus-window", "-s", "work", "b"]])
        self.assertEqual(self.cycle(panes, detections, current="b"), [
            ["focus-window", "-s", "other", "c"], ["switch-session", "-s", "work", "other"],
        ])

    def test_non_agent_start_selects_first_or_last(self):
        panes = [agent("a"), agent("b")]
        detections = {"a": detection(), "b": detection()}
        for direction, target in (("next", "a"), ("prev", "b")):
            self.assertEqual(self.cycle(panes, detections, direction, "shell"), [["focus-window", "-s", "work", target]])

    def test_no_eligible_agents_leaves_focus_untouched(self):
        self.assertEqual(self.cycle([], {}), [])
        self.assertEqual(self.cycle([agent("worker")], {"worker": detection(matched=False)}), [])

    def test_closed_pane_during_detection_is_skipped(self):
        panes = [agent("a"), agent("closed"), agent("b")]
        detections = {"a": detection(), "closed": None, "b": detection()}
        self.assertEqual(self.cycle(panes, detections), [["focus-window", "-s", "work", "b"]])

    def test_live_additions_and_removals_between_presses(self):
        fixture = dict(agents=[agent("a"), agent("b")], detections={"a": detection(), "b": detection(), "c": detection()})
        with self.daemon(fixture) as (path, calls):
            self.assertEqual(self.invoke(path).returncode, 0)
            self.assertEqual(calls[-1][1]["window"], "b")
            fixture["agents"] = [agent("a"), agent("c")]
            self.assertEqual(self.invoke(path).returncode, 0)
            self.assertEqual(calls[-1][1]["window"], "c")

    def test_closed_between_detection_and_focus_retries_next(self):
        panes = [agent("a"), agent("closed"), agent("b")]
        errors = {("focus-window", "closed"): {"code": "window_not_found", "message": "gone"}}
        calls = self.cycle(panes, {key: detection() for key in ("a", "closed", "b")}, errors=errors)
        self.assertEqual(calls[-1], ["focus-window", "-s", "work", "b"])

    def test_repeated_cross_session_press_uses_attached_client_session(self):
        fixture = dict(agents=[agent("a"), agent("b", session="other", focused=True), agent("c", session="other")],
                       detections={key: detection() for key in ("a", "b", "c")},
                       clients=[{"session": "other", "client_id": "attached"}, {"session": ""}])
        with self.daemon(fixture) as (path, calls):
            self.assertEqual(self.invoke(path).returncode, 0)
            self.assertEqual(calls, [["focus-window", {"session": "other", "window": "c"}]])

    def test_permission_errors_stop_instead_of_skipping(self):
        fixture = dict(agents=[agent("a"), agent("b")], detections={"a": detection(), "b": detection()},
                       errors={("focus-window", "b"): {"code": "forbidden", "message": "no grant"}})
        with self.daemon(fixture) as (path, calls):
            result = self.invoke(path)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("forbidden", result.stderr)
            self.assertEqual(len(calls), 1)

    def test_repeated_press_uses_daemon_focus_over_stale_frame(self):
        panes = [agent("a"), agent("b", focused=True), agent("c")]
        self.assertEqual(self.cycle(panes, {key: detection() for key in ("a", "b", "c")}),
                         [["focus-window", "-s", "work", "c"]])


if __name__ == "__main__":
    unittest.main()
