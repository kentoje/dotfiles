"""Exercise Claude hook reporting without touching the live tuios daemon."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("report-interactive-claude-state.sh")


class ReportInteractiveClaudeStateTest(unittest.TestCase):
    def report(self, detection, payload=None, pane="worker"):
        payload = payload or {"hook_event_name": "Stop", "session_id": "headless"}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "detection.json").write_text(json.dumps(detection))
            mock = root / "tuios"
            mock.write_text("""#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ['CLAUDE_HOOK_TEST_DIR'])
if sys.argv[1] == 'explain-agent-detect':
    detection = json.loads((root / 'detection.json').read_text())
    if detection is None:
        sys.exit(1)
    print(json.dumps(detection))
else:
    (root / 'report.json').write_text(json.dumps({
        'args': sys.argv[1:], 'payload': sys.stdin.read(),
    }))
""")
            mock.chmod(0o755)
            raw = json.dumps(payload) + "\n"
            result = subprocess.run(
                ["sh", str(SCRIPT)], input=raw, capture_output=True, text=True,
                env=dict(os.environ, PATH=f"{root}:{os.environ['PATH']}",
                         CLAUDE_HOOK_TEST_DIR=str(root), TUIOS_PANE_ID=pane,
                         TUIOS_SESSION="configs"),
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "")
            report = root / "report.json"
            return json.loads(report.read_text()) if report.exists() else None, raw

    def test_workflow_children_never_report_prompts_tools_or_completions(self):
        detection = {"matched": False, "process": {"argv": ["node", "scripts/slack-poll.ts"]}}
        for event in ("SessionStart", "UserPromptSubmit", "PreToolUse", "Stop", "SessionEnd"):
            with self.subTest(event=event):
                report, _ = self.report(detection, {"hook_event_name": event})
                self.assertIsNone(report)

    def test_print_mode_never_reports_even_when_detected_as_claude(self):
        for flag in ("-p", "--print", "--print=true"):
            with self.subTest(flag=flag):
                report, _ = self.report({"matched": True,
                    "manifests": [{"id": "claude-code", "matched": True}],
                    "process": {"argv": ["claude", flag, "Read Slack"]}})
                self.assertIsNone(report)

    def test_interactive_claude_preserves_the_original_hook_payload(self):
        for argv in (["claude"], ["claude", "--", "--print"]):
            with self.subTest(argv=argv):
                report, raw = self.report({"matched": True,
                    "manifests": [{"id": "claude-code", "matched": True}],
                    "process": {"argv": argv}})
                self.assertEqual(report, {"args": ["agent-hook", "claude-code", "--integration", "3"], "payload": raw})

    def test_failed_detection_does_not_create_a_false_agent(self):
        report, _ = self.report(None)
        self.assertIsNone(report)

    def test_headless_claude_behind_a_node_wrapper_never_reports(self):
        report, _ = self.report({
            "matched": True, "matched_harness": "claude-code",
            "matched_via": ["node"],
            "manifests": [{"id": "claude-code", "matched": False}],
            "process": {"argv": ["node", "scripts/slack-poll.ts"]},
            "group": [{"matched": True, "argv": ["claude", "-p", "Read Slack"]}],
        })
        self.assertIsNone(report)

    def test_without_pane_environment_keeps_native_pane_resolution(self):
        report, raw = self.report(None, pane="")
        self.assertEqual(report["payload"], raw)


if __name__ == "__main__":
    unittest.main()
