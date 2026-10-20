"""Tests for the on-machine S3 pnpm store cache script (image/rootfs/opt/mvm/bin/mvm-pnpm-store-cache).

Runs the real bash script against a fake `aws s3 cp` backed by a temp dir, with a fixture HOME.
Needs bash, zstd, jq and sha256sum (on the laptop: `nix shell nixpkgs#zstd`).
"""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from mvm_cli.mvm_settings import IMAGE_DIR

PNPM_STORE_CACHE_SCRIPT = IMAGE_DIR / "rootfs/opt/mvm/bin/mvm-pnpm-store-cache"
CACHE_URI = "s3://dev-bucket/pnpm-store/"

# `aws s3 cp SRC DST` against $FAKE_S3_ROOT; FAKE_S3_DENY=1 answers 403 like a broken role.
FAKE_AWS_CLI = r"""#!/usr/bin/env bash
echo "$*" >>"$FAKE_S3_ROOT/calls.log"
args=()
while [ $# -gt 0 ]; do
  case $1 in --region) shift 2 ;; --only-show-errors) shift ;; *) args+=("$1"); shift ;; esac
done
src=${args[2]} dst=${args[3]}
if [ -n "${FAKE_S3_DENY:-}" ]; then
  echo "fatal error: An error occurred (403) when calling the HeadObject operation: Forbidden" >&2
  exit 1
fi
if [[ $src == s3://* ]]; then
  f="$FAKE_S3_ROOT/${src#s3://}"
  if [ ! -f "$f" ]; then
    echo "fatal error: An error occurred (404) when calling the HeadObject operation: Key does not exist" >&2
    exit 1
  fi
  if [ "$dst" = - ]; then cat "$f"; else cp "$f" "$dst"; fi
else
  f="$FAKE_S3_ROOT/${dst#s3://}"
  mkdir -p "$(dirname "$f")"
  if [ "$src" = - ]; then cat >"$f"; else cp "$src" "$f"; fi
fi
"""


@unittest.skipUnless(
    all(shutil.which(tool) for tool in ["bash", "zstd", "jq", "sha256sum"]),
    "needs bash, zstd, jq and sha256sum (laptop: nix shell nixpkgs#zstd)",
)
class PnpmStoreCacheScriptTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.s3 = self.root / "s3"
        self.s3.mkdir()
        fake_bin = self.root / "bin"
        fake_bin.mkdir()
        (fake_bin / "aws").write_text(FAKE_AWS_CLI)
        (fake_bin / "aws").chmod(0o755)
        self.machine_json = self.root / "machine.json"
        self.write_machine_json(CACHE_URI)
        self.env = {
            **os.environ,
            "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
            "FAKE_S3_ROOT": str(self.s3),
            "MVM_MACHINE_JSON": str(self.machine_json),
        }

    def write_machine_json(self, cache_uri):
        self.machine_json.write_text(json.dumps({"region": "eu-central-1", "pnpmStoreCacheUri": cache_uri}))

    def new_home(self, lockfile_text="lockfileVersion: '9.0'\n"):
        home = Path(tempfile.mkdtemp(dir=self.root))
        checkout = home / "Documents/conversation-center-ext"
        checkout.mkdir(parents=True)
        (checkout / "pnpm-lock.yaml").write_text(lockfile_text)
        return home, checkout

    def fill_pnpm_store(self, home):
        store = home / ".local/share/pnpm/store/v11"
        (store / "files/ab").mkdir(parents=True)
        (store / "files/ab/cdef").write_text("package file")
        (store / "index.db").write_text("index")
        (home / ".cache/pnpm/metadata").mkdir(parents=True)
        (home / ".cache/pnpm/metadata/react.json").write_text("{}")

    def run_cache(self, command, home, checkout, **extra_env):
        result = subprocess.run(
            ["bash", str(PNPM_STORE_CACHE_SCRIPT), command, str(checkout)],
            env={**self.env, "HOME": str(home), **extra_env},
            capture_output=True,
            text=True,
        )
        return result.returncode, result.stdout.strip(), result.stderr

    def save_snapshot(self, lockfile_text="lockfileVersion: '9.0'\n"):
        home, checkout = self.new_home(lockfile_text)
        self.fill_pnpm_store(home)
        self.assertEqual(self.run_cache("archive", home, checkout)[0], 0)
        self.assertEqual(self.run_cache("upload", home, checkout)[0], 0)

    def test_exact_snapshot_is_restored_into_place(self):
        self.save_snapshot()
        home, checkout = self.new_home()
        code, hit, _ = self.run_cache("restore", home, checkout)
        self.assertEqual((code, hit), (0, "exact"))
        self.assertEqual((home / ".local/share/pnpm/store/v11/files/ab/cdef").read_text(), "package file")
        self.assertTrue((home / ".cache/pnpm/metadata/react.json").exists())
        self.assertEqual(list((home / ".cache/mvm/pnpm-store-cache").iterdir()), [])

    def test_latest_snapshot_serves_a_changed_lockfile(self):
        self.save_snapshot()
        latest = (self.s3 / "dev-bucket/pnpm-store/conversation-center-ext/latest").read_text()
        self.assertRegex(latest, r"^[0-9a-f]{64}\.tar\.zst$")
        home, checkout = self.new_home("lockfileVersion: '9.0'\n# a newer dependency\n")
        self.assertEqual(self.run_cache("restore", home, checkout)[1], "latest")
        self.assertTrue((home / ".local/share/pnpm/store/v11/index.db").exists())

    def test_empty_cache_is_a_miss(self):
        home, checkout = self.new_home()
        code, hit, stderr = self.run_cache("restore", home, checkout)
        self.assertEqual((code, hit), (0, "miss"))
        self.assertIn("not cached yet", stderr)

    def test_unreadable_snapshot_is_a_miss_and_leaves_no_partial_store(self):
        self.save_snapshot()
        for snapshot in (self.s3 / "dev-bucket/pnpm-store/conversation-center-ext").glob("*.tar.zst"):
            snapshot.write_bytes(b"not zstd")
        home, checkout = self.new_home()
        code, hit, stderr = self.run_cache("restore", home, checkout)
        self.assertEqual((code, hit), (0, "miss"))
        self.assertIn("unreadable", stderr)
        self.assertFalse((home / ".local/share/pnpm/store").exists())

    def test_existing_store_is_never_overwritten(self):
        self.save_snapshot()
        home, checkout = self.new_home()
        (home / ".local/share/pnpm/store/v11").mkdir(parents=True)
        (home / ".local/share/pnpm/store/v11/mine").write_text("keep")
        self.assertEqual(self.run_cache("restore", home, checkout)[1], "present")
        self.assertEqual((home / ".local/share/pnpm/store/v11/mine").read_text(), "keep")

    def test_no_cache_location_skips_without_calling_aws(self):
        self.write_machine_json("")
        home, checkout = self.new_home()
        self.fill_pnpm_store(home)
        self.assertEqual(self.run_cache("restore", home, checkout)[1], "miss")
        self.assertEqual(self.run_cache("archive", home, checkout)[0], 0)
        self.assertEqual(self.run_cache("upload", home, checkout)[0], 0)
        self.assertFalse((self.s3 / "calls.log").exists())

    def test_denied_role_is_a_logged_miss(self):
        home, checkout = self.new_home()
        code, hit, stderr = self.run_cache("restore", home, checkout, FAKE_S3_DENY="1")
        self.assertEqual((code, hit), (0, "miss"))
        self.assertIn("cache read failed", stderr)
        self.assertIn("(403)", stderr)

    def test_latest_moves_only_after_a_successful_upload(self):
        home, checkout = self.new_home()
        self.fill_pnpm_store(home)
        self.assertEqual(self.run_cache("archive", home, checkout)[0], 0)
        code, _, stderr = self.run_cache("upload", home, checkout, FAKE_S3_DENY="1")
        self.assertEqual(code, 1)
        self.assertIn("upload failed", stderr)
        self.assertFalse((self.s3 / "dev-bucket/pnpm-store/conversation-center-ext/latest").exists())

    def test_upload_without_archive_is_a_no_op(self):
        home, checkout = self.new_home()
        code, _, stderr = self.run_cache("upload", home, checkout)
        self.assertEqual(code, 0)
        self.assertIn("no archived snapshot", stderr)


if __name__ == "__main__":
    unittest.main()
