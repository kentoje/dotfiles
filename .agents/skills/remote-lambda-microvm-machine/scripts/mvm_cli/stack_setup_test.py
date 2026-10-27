"""Tests for link_mvm_laptop_file, behind `mvm setup`'s ~/.local/bin/mvm and fish completion links."""

import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from mvm_cli import stack_setup


class LinkMvmLaptopFileTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name).resolve()
        self.target = self.root / "skill" / "mvm.fish"
        self.target.parent.mkdir()
        self.target.write_text("# completion\n")
        self.link = self.root / "fish" / "completions" / "mvm.fish"

    def link_quietly(self):
        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            stack_setup.link_mvm_laptop_file(self.link, self.target)
        return stderr.getvalue()

    def test_creates_missing_dirs_and_link_then_is_idempotent(self):
        self.assertIn("linked", self.link_quietly())
        self.assertEqual(self.link.resolve(), self.target)
        self.assertEqual(self.link_quietly(), "")

    def test_never_replaces_a_file_or_foreign_link(self):
        self.link.parent.mkdir(parents=True)
        self.link.write_text("# hand-written\n")
        self.assertIn("not touching", self.link_quietly())
        self.assertEqual(self.link.read_text(), "# hand-written\n")
        self.link.unlink()
        (self.root / "elsewhere.fish").write_text("# another tool's completion\n")
        self.link.symlink_to(self.root / "elsewhere.fish")
        self.assertIn("not touching", self.link_quietly())
        self.assertEqual(self.link.readlink(), self.root / "elsewhere.fish")

    def test_replaces_a_dangling_link_left_by_a_moved_skill(self):
        self.link.parent.mkdir(parents=True)
        self.link.symlink_to(self.root / "old-skill-name" / "mvm.fish")
        self.assertIn("linked", self.link_quietly())
        self.assertEqual(self.link.resolve(), self.target)


class MergeEnvSecretValuesTest(unittest.TestCase):
    def test_shell_values_replace_absent_ones_keep_the_secret_value(self):
        merged, pushed, kept, missing = stack_setup.merge_env_secret_values(
            {"GITLAB_TOKEN": "old", "GEMFURY_AUTH": "kept", "UNLISTED": "stays"},
            {"GITLAB_TOKEN": "new", "JIRA_EMAIL": ""},
            ["GITLAB_TOKEN", "GEMFURY_AUTH", "JIRA_EMAIL"],
        )
        self.assertEqual(merged, {"GITLAB_TOKEN": "new", "GEMFURY_AUTH": "kept", "UNLISTED": "stays"})
        self.assertEqual((pushed, kept, missing), (["GITLAB_TOKEN"], ["GEMFURY_AUTH"], ["JIRA_EMAIL"]))

    def test_claude_token_comes_from_its_laptop_name_only(self):
        names = ["CLAUDE_CODE_OAUTH_TOKEN"]
        merged, pushed, _, _ = stack_setup.merge_env_secret_values(
            {}, {"MVM_CLAUDE_CODE_OAUTH_TOKEN": "sub-token"}, names
        )
        self.assertEqual((merged, pushed), ({"CLAUDE_CODE_OAUTH_TOKEN": "sub-token"}, names))
        merged, _, _, missing = stack_setup.merge_env_secret_values(
            {}, {"CLAUDE_CODE_OAUTH_TOKEN": "laptop-login"}, names
        )
        self.assertEqual((merged, missing), ({}, names))


if __name__ == "__main__":
    unittest.main()
