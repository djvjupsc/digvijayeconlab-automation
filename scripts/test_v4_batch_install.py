import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

MODULE_PATH = Path(__file__).with_name("v4-batch-install.py")
spec = importlib.util.spec_from_file_location("v4_batch_installer", MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class V4PinnedBatchInstallSafetyTests(unittest.TestCase):
    def test_git_blob_algorithm_matches_known_sample(self):
        self.assertEqual(
            mod.blob_sha(b"hello\n"),
            "ce013625030ba8dba906f756967f9e9ca394464a"
        )

    def test_manifest_file_names_and_pinned_sha_lengths(self):
        self.assertEqual(len(mod.FILES), 10)
        for relative, (old, new) in mod.FILES.items():
            self.assertFalse(Path(relative).is_absolute())
            self.assertNotIn("..", Path(relative).parts)
            self.assertEqual(len(new), 40)
            int(new, 16)
            if old:
                self.assertEqual(len(old), 40)
                int(old, 16)
        self.assertNotIn("index.js", mod.FILES)
        self.assertNotIn("database/db.js", mod.FILES)
        self.assertNotIn("agents/publishing-scheduling-agent.js", mod.FILES)

    def test_existing_unrelated_edits_block_without_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            file = root / "script.js"
            file.write_text("user private work")
            with self.assertRaisesRegex(RuntimeError, "untracked modifications"):
                mod.local_state(file, mod.blob_sha(b"old"), mod.blob_sha(b"new"))
            self.assertEqual(file.read_text(), "user private work")

    def test_new_file_must_be_absent_or_already_matching(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "new.js"
            expected = mod.blob_sha(b"expected")
            self.assertEqual(mod.local_state(file, None, expected), "new")
            file.write_bytes(b"expected")
            self.assertEqual(mod.local_state(file, None, expected), "installed")
            file.write_bytes(b"unexpected")
            with self.assertRaisesRegex(RuntimeError, "untracked modifications"):
                mod.local_state(file, None, expected)

    def test_symlink_destination_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "new.js"
            file.symlink_to(Path(directory) / "missing-target")
            with self.assertRaisesRegex(RuntimeError, "symlink target"):
                mod.local_state(file, None, mod.blob_sha(b"x"))

    def test_atomic_write_updates_one_named_file(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "existing.js"
            file.write_bytes(b"old")
            mod.atomic_write(file, b"new")
            self.assertEqual(file.read_bytes(), b"new")
            self.assertEqual(sorted(p.name for p in Path(directory).iterdir()), ["existing.js"])

    def test_explicit_install_only_mode_skips_any_render(self):
        with mock.patch.object(mod, "install") as install, \
             mock.patch.object(mod.subprocess, "run") as runner, \
             mock.patch.object(mod.sys, "argv", ["installer", "--install-only"]):
            self.assertEqual(mod.main(), 0)
            install.assert_called_once()
            runner.assert_not_called()

    def test_full_mode_invokes_foreground_review_only_node_cli(self):
        class Result:
            returncode = 0
        with mock.patch.object(mod, "install"), \
             mock.patch.object(mod.subprocess, "run", return_value=Result()) as runner, \
             mock.patch.object(mod.sys, "argv", ["installer"]):
            self.assertEqual(mod.main(), 0)
            args, kwargs = runner.call_args
            self.assertEqual(args[0], [
                "node", "scripts/v4-one-shot-review.js", "--formats=short,medium,long"
            ])
            self.assertEqual(kwargs["env"]["DVE_V4_REVIEW_BATCH_ENABLED"], "true")
            self.assertEqual(kwargs["env"]["DVE_V4_SCENE_SMOKE_ENABLED"], "true")
            self.assertEqual(kwargs["cwd"], mod.ROOT)
            self.assertIs(kwargs["check"], False)


if __name__ == "__main__":
    unittest.main()
