"""Tests for image_build: what reaches the build zip, and the secret guard on laptop config files."""

import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from mvm_cli import image_build


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
            with mock.patch.object(image_build, "LAPTOP_CONFIG_FILES", {}):
                with mock.patch.object(image_build, "LAPTOP_GIT_BUNDLES", {}):
                    image_build.zip_image_context(dest, image_dir=image_dir)
            with zipfile.ZipFile(dest) as zf:
                names = sorted(zf.namelist())
                hook_mode = zf.getinfo("rootfs/opt/mvm/bin/mvm-on-run").external_attr >> 16
        self.assertEqual(names, ["Dockerfile", "rootfs/opt/mvm/bin/mvm-on-run"])
        self.assertEqual(hook_mode & 0o777, 0o755)


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
