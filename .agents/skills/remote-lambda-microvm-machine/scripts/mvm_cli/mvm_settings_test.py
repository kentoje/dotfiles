"""Tests for the laptop settings accessors: env overrides, the settings file, and errors naming what is missing."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from mvm_cli import mvm_settings
from mvm_cli.mvm_errors import MvmError

LAPTOP_SETTINGS_ENV_NAMES = ("MVM_SETTINGS_FILE", "MVM_AWS_VAULT_PROFILE", "MVM_OWNER_EMAIL", "MVM_GIT_USER_NAME")


def isolate_mvm_laptop_settings(test_case):
    """Point the laptop settings at a fresh temp file (not created) and clear the MVM_* overrides for one test.

    Keeps tests from reading the real ~/.config/mvm/settings.json. Returns the temp file path.
    """
    tmp = tempfile.TemporaryDirectory()
    test_case.addCleanup(tmp.cleanup)
    settings_file = Path(tmp.name) / "settings.json"
    env = {name: value for name, value in os.environ.items() if name not in LAPTOP_SETTINGS_ENV_NAMES}
    env["MVM_SETTINGS_FILE"] = str(settings_file)
    patcher = mock.patch.dict(os.environ, env, clear=True)
    patcher.start()
    test_case.addCleanup(patcher.stop)
    return settings_file


class LaptopSettingsTest(unittest.TestCase):
    def setUp(self):
        self.settings_file = isolate_mvm_laptop_settings(self)

    def write_settings(self, settings):
        self.settings_file.write_text(json.dumps(settings))

    def test_reads_every_value_from_the_settings_file(self):
        self.write_settings(
            {
                "awsVaultProfile": "dev-admin",
                "ownerEmail": "dev@example.com",
                "gitUserName": "Dev Person",
                "workspaceRepos": [" group/app ", "group/lib"],
            }
        )
        self.assertEqual(mvm_settings.aws_vault_profile(), "dev-admin")
        self.assertEqual(mvm_settings.owner_email(), "dev@example.com")
        self.assertEqual(mvm_settings.git_user_name(), "Dev Person")
        self.assertEqual(mvm_settings.workspace_repo_paths(), ["group/app", "group/lib"])

    def test_env_var_overrides_the_file(self):
        self.write_settings({"awsVaultProfile": "from-file"})
        with mock.patch.dict(os.environ, {"MVM_AWS_VAULT_PROFILE": "from-env"}):
            self.assertEqual(mvm_settings.aws_vault_profile(), "from-env")

    def test_env_var_works_without_a_settings_file(self):
        with mock.patch.dict(os.environ, {"MVM_OWNER_EMAIL": "dev@example.com"}):
            self.assertEqual(mvm_settings.owner_email(), "dev@example.com")

    def test_missing_setting_names_the_key_the_file_and_the_env_var(self):
        with self.assertRaises(MvmError) as raised:
            mvm_settings.owner_email()
        message = str(raised.exception)
        self.assertTrue(message.startswith("mvm settings missing ownerEmail"), message)
        self.assertIn(str(self.settings_file), message)
        self.assertIn("MVM_OWNER_EMAIL", message)

    def test_a_missing_key_does_not_break_the_others(self):
        # `mvm proxy` needs only the profile: an incomplete file must not break ssh.
        self.write_settings({"awsVaultProfile": "dev-admin"})
        self.assertEqual(mvm_settings.aws_vault_profile(), "dev-admin")
        with self.assertRaisesRegex(MvmError, "mvm settings missing gitUserName"):
            mvm_settings.git_user_name()

    def test_invalid_json_is_reported_with_the_path(self):
        self.settings_file.write_text("{not json")
        with self.assertRaisesRegex(MvmError, "mvm settings file unreadable") as raised:
            mvm_settings.aws_vault_profile()
        self.assertIn(str(self.settings_file), str(raised.exception))

    def test_non_object_json_is_reported(self):
        self.settings_file.write_text("[]")
        with self.assertRaisesRegex(MvmError, "expected a JSON object"):
            mvm_settings.aws_vault_profile()

    def test_workspace_repos_must_be_a_list_of_paths(self):
        for repos in ["group/app", ["group/app", " "], [1]]:
            self.write_settings({"workspaceRepos": repos})
            with self.assertRaisesRegex(MvmError, "mvm settings workspaceRepos must be a list", msg=repr(repos)):
                mvm_settings.workspace_repo_paths()

    def test_empty_workspace_repos_is_missing(self):
        self.write_settings({"workspaceRepos": []})
        with self.assertRaisesRegex(MvmError, "mvm settings missing workspaceRepos"):
            mvm_settings.workspace_repo_paths()


if __name__ == "__main__":
    unittest.main()
