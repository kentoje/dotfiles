"""Tests for image_build: what reaches the build zip, and the secret guard on laptop config files."""

import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from mvm_cli import image_build
from mvm_cli.mvm_errors import MvmError
from mvm_cli.mvm_settings_test import isolate_mvm_laptop_settings


class ZipImageContextTest(unittest.TestCase):
    def test_keeps_files_and_modes_and_skips_local_junk(self):
        with tempfile.TemporaryDirectory() as tmp:
            image_dir = Path(tmp) / "image"
            (image_dir / "rootfs/opt/mvm/bin/__pycache__").mkdir(parents=True)
            (image_dir / "Dockerfile").write_text("FROM scratch\n")
            hook = image_dir / "rootfs/opt/mvm/bin/mvm-on-run"
            hook.write_text("#!/bin/sh\n")
            hook.chmod(0o755)
            (image_dir / "rootfs/opt/mvm/bin/__pycache__/x.pyc").write_bytes(b"junk")
            (image_dir / ".DS_Store").write_bytes(b"junk")
            dest = Path(tmp) / "image.zip"
            with mock.patch.object(image_build, "laptop_settings_files", return_value={}):
                with mock.patch.object(image_build, "LAPTOP_CONFIG_FILES", {}):
                    with mock.patch.object(image_build, "LAPTOP_GIT_BUNDLES", {}):
                        image_build.zip_image_context(dest, image_dir=image_dir)
            with zipfile.ZipFile(dest) as zf:
                names = sorted(zf.namelist())
                hook_mode = zf.getinfo("rootfs/opt/mvm/bin/mvm-on-run").external_attr >> 16
        self.assertEqual(names, ["Dockerfile", "rootfs/opt/mvm/bin/mvm-on-run"])
        self.assertEqual(hook_mode & 0o777, 0o755)


class LaptopSettingsFilesTest(unittest.TestCase):
    """The workspace repo list and git identity come from the laptop settings, not from the public repo."""

    def setUp(self):
        self.settings_file = isolate_mvm_laptop_settings(self)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.image_dir = self.tmp / "image"
        self.image_dir.mkdir()
        (self.image_dir / "Dockerfile").write_text("FROM scratch\n")
        for name in ("LAPTOP_CONFIG_FILES", "LAPTOP_GIT_BUNDLES"):
            patcher = mock.patch.object(image_build, name, {})
            patcher.start()
            self.addCleanup(patcher.stop)

    def zip_entries(self):
        dest = self.tmp / "image.zip"
        image_build.zip_image_context(dest, image_dir=self.image_dir)
        with zipfile.ZipFile(dest) as zf:
            return {name: zf.read(name).decode() for name in zf.namelist()}

    def test_repo_list_and_git_identity_reach_the_zip(self):
        self.settings_file.write_text(
            json.dumps(
                {
                    "ownerEmail": "dev@example.com",
                    "gitUserName": "Dev Person",
                    "workspaceRepos": ["group/app", "group/lib"],
                }
            )
        )
        entries = self.zip_entries()
        repos = [line for line in entries["laptop-files/workspace-repos.txt"].splitlines() if not line.startswith("#")]
        self.assertEqual(repos, ["group/app", "group/lib"])
        self.assertIn("[user]", entries["laptop-files/git-identity.gitconfig"])

    def test_git_identity_survives_git_config_special_characters(self):
        name = 'Dev "Q" Person; #1 \\ x'
        self.settings_file.write_text(
            json.dumps({"ownerEmail": "dev@example.com", "gitUserName": name, "workspaceRepos": ["group/app"]})
        )
        identity_file = self.tmp / "identity.gitconfig"
        identity_file.write_text(self.zip_entries()["laptop-files/git-identity.gitconfig"])

        def read_git_config(key):
            return subprocess.run(
                ["git", "config", "--file", str(identity_file), "--get", key],
                capture_output=True,
                text=True,
                check=True,
            ).stdout.rstrip("\n")

        self.assertEqual(read_git_config("user.name"), name)
        self.assertEqual(read_git_config("user.email"), "dev@example.com")

    def test_missing_settings_fail_before_the_zip_is_written(self):
        self.settings_file.write_text(json.dumps({"ownerEmail": "dev@example.com", "gitUserName": "Dev"}))
        dest = self.tmp / "image.zip"
        with self.assertRaisesRegex(MvmError, "mvm settings missing workspaceRepos"):
            image_build.zip_image_context(dest, image_dir=self.image_dir)
        self.assertFalse(dest.exists())


class LaptopConfigFileTest(unittest.TestCase):
    def read(self, text):
        with tempfile.NamedTemporaryFile("w", suffix=".yml", delete=False) as f:
            f.write(text)
        try:
            return image_build.read_laptop_config_file(Path(f.name))
        finally:
            Path(f.name).unlink()

    def test_plain_config_is_kept(self):
        self.assertIsNotNone(self.read("installation: Cloud\nauth_type: basic\nproject:\n  key: CI\n"))

    def test_secret_looking_config_is_refused(self):
        for line in ["api_token: abc", "password = hunter2", "  apiKey: x", "client-secret: y"]:
            self.assertIsNone(self.read(f"server: x\n{line}\n"), line)

    def test_missing_file_is_skipped(self):
        self.assertIsNone(image_build.read_laptop_config_file(Path("/nonexistent/mvm-test.yml")))


if __name__ == "__main__":
    unittest.main()
