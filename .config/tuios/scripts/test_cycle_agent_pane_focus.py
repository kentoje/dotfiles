"""Exercise agent cycling without changing focus in the running TUiOS daemon."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


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
    def cycle(self, agents, detections, direction="next", current="a", session="work"):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "fixture.json").write_text(json.dumps({
                "agents": agents, "detections": detections,
            }))
            mock = root / "tuios"
            mock.write_text("""#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ['CYCLE_TEST_DIR'])
fixture = json.loads((root / 'fixture.json').read_text())
args = sys.argv[1:]
if args[0] == 'list-agents':
    print(json.dumps({'agents': fixture['agents']}))
elif args[0] == 'explain-agent-detect':
    result = fixture['detections'][args[args.index('-w') + 1]]
    if result is None:
        sys.exit(1)
    print(json.dumps(result))
else:
    with (root / 'focus.jsonl').open('a') as output:
        output.write(json.dumps(args) + '\\n')
""")
            mock.chmod(0o755)
            result = subprocess.run(
                ["sh", str(SCRIPT), direction], capture_output=True, text=True,
                env=dict(os.environ, PATH=f"{root}:{os.environ['PATH']}",
                         CYCLE_TEST_DIR=str(root), TUIOS_ACTIVE_PANE_ID=current,
                         TUIOS_SESSION=session),
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            log = root / "focus.jsonl"
            return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

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
            ["switch-session", "-s", "work", "other"], ["focus-window", "-s", "other", "c"],
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


if __name__ == "__main__":
    unittest.main()
