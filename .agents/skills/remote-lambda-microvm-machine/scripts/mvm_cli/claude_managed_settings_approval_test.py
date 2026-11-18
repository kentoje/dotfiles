import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from mvm_cli import claude_managed_settings_approval as approval


class ReadLaptopClaudeManagedSettingsApprovalTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        (self.dir / "remote-settings.json").write_text(json.dumps({"model": "x"}))
        (self.dir / "remote-settings.json.signature.json").write_text(json.dumps({"sig": "y"}))
        (self.dir / "remote-settings.json.synced-at").write_text("1795012448727")
        (self.dir / "remote-settings-helper-consent").write_text("ab" * 32)

    def test_reads_every_approval_file(self):
        files = approval.read_laptop_claude_managed_settings_approval(self.dir)
        self.assertEqual(sorted(files), sorted(approval.CLAUDE_MANAGED_SETTINGS_APPROVAL_FILES))
        self.assertEqual(files["remote-settings-helper-consent"], b"ab" * 32)

    def test_none_when_a_file_is_missing(self):
        (self.dir / "remote-settings.json.signature.json").unlink()
        self.assertIsNone(approval.read_laptop_claude_managed_settings_approval(self.dir))

    def test_none_when_the_token_or_settings_are_not_sane(self):
        for content in ("", "yes", "ab" * 31, "AB" * 32, "ab" * 32 + "; rm -rf ~"):
            (self.dir / "remote-settings-helper-consent").write_text(content)
            self.assertIsNone(approval.read_laptop_claude_managed_settings_approval(self.dir), content)
        (self.dir / "remote-settings-helper-consent").write_text("ab" * 32)
        (self.dir / "remote-settings.json").write_text("{not json")
        self.assertIsNone(approval.read_laptop_claude_managed_settings_approval(self.dir))


class RenderClaudeManagedSettingsApprovalScriptTest(unittest.TestCase):
    def test_writes_the_files_and_replaces_stale_ones(self):
        with tempfile.TemporaryDirectory() as home:
            target = Path(home) / ".claude/remote-settings-helper-consent"
            for token in (b"c" * 64, b"d" * 64):
                script = approval.render_claude_managed_settings_approval_script(
                    {"remote-settings-helper-consent": token, "remote-settings.json": b"{'$(x)'}"}
                )
                subprocess.run(["bash", "-c", script], check=True, env={**os.environ, "HOME": home})
                self.assertEqual(target.read_bytes(), token)
                self.assertEqual((Path(home) / ".claude/remote-settings.json").read_bytes(), b"{'$(x)'}")

    def test_nothing_to_copy_no_script(self):
        self.assertEqual(approval.render_claude_managed_settings_approval_script(None), "")


if __name__ == "__main__":
    unittest.main()
