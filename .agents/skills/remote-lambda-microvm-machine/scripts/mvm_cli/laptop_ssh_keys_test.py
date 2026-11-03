"""Tests for laptop_ssh_keys: registering, listing and revoking the laptop keys every machine authorizes."""

import contextlib
import io
import unittest
from unittest import mock

from mvm_cli import laptop_ssh_keys
from mvm_cli.artifact_bucket_access_test import install_fake_artifact_bucket
from mvm_cli.mvm_errors import MvmError

THIS_LAPTOP_KEY = "ssh-ed25519 AAAAthislaptop mvm-kento"
OTHER_LAPTOP_KEY = "ssh-ed25519 AAAAotherlaptop mvm-kento@other"


class LaptopSshKeysTest(unittest.TestCase):
    def setUp(self):
        self.bucket = install_fake_artifact_bucket(self)
        patcher = mock.patch.object(laptop_ssh_keys, "read_mvm_ssh_public_key", return_value=THIS_LAPTOP_KEY)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_key_id_names_the_laptop_and_ignores_the_comment(self):
        key_id = laptop_ssh_keys.laptop_ssh_key_id(THIS_LAPTOP_KEY)
        self.assertTrue(key_id.startswith(f"{laptop_ssh_keys.LAPTOP_NAME}-"), key_id)
        self.assertEqual(
            key_id,
            laptop_ssh_keys.laptop_ssh_key_id("ssh-ed25519 AAAAthislaptop other comment"),
        )
        self.assertNotEqual(key_id, laptop_ssh_keys.laptop_ssh_key_id(OTHER_LAPTOP_KEY))

    def test_register_is_idempotent_and_names_the_laptop(self):
        key_id = laptop_ssh_keys.register_laptop_ssh_key()
        self.assertEqual(laptop_ssh_keys.register_laptop_ssh_key(), key_id)
        [registered] = laptop_ssh_keys.list_registered_laptop_ssh_keys()
        self.assertEqual(registered["id"], key_id)
        self.assertEqual(
            registered["publicKey"],
            f"ssh-ed25519 AAAAthislaptop mvm-kento@{laptop_ssh_keys.LAPTOP_NAME}",
        )

    def test_list_reads_only_key_files(self):
        laptop_ssh_keys.register_laptop_ssh_key()
        self.bucket.put("ssh-keys/other-0123456789ab.pub", (OTHER_LAPTOP_KEY + "\n").encode())
        self.bucket.put("ssh-keys/README.txt", b"not a key")
        listed = laptop_ssh_keys.list_registered_laptop_ssh_keys()
        self.assertEqual(
            sorted(key["id"] for key in listed),
            sorted(
                [
                    laptop_ssh_keys.laptop_ssh_key_id(THIS_LAPTOP_KEY),
                    "other-0123456789ab",
                ]
            ),
        )

    def test_remove_revokes_a_laptop_and_rejects_unknown_ids(self):
        self.bucket.put("ssh-keys/other-0123456789ab.pub", (OTHER_LAPTOP_KEY + "\n").encode())
        with contextlib.redirect_stderr(io.StringIO()):
            laptop_ssh_keys.remove_laptop_ssh_key("other-0123456789ab")
        self.assertEqual(laptop_ssh_keys.list_registered_laptop_ssh_keys(), [])
        with self.assertRaisesRegex(MvmError, "unknown laptop key 'other-0123456789ab'"):
            laptop_ssh_keys.remove_laptop_ssh_key("other-0123456789ab")


if __name__ == "__main__":
    unittest.main()
