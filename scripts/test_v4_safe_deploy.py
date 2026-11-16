"""Offline unit tests for pinned V4 installer; never fetch or modify a project."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("v4-safe-deploy.py")
SPEC = importlib.util.spec_from_file_location("v4_safe_deploy", SCRIPT)
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)

class SafeDeployTests(unittest.TestCase):
    def test_patches_single_known_api_anchor(self):
        original = "const express = require('express');\n" + DEPLOY.APP_ANCHOR + "\nconsole.log('old');"
        result=DEPLOY.patch_main(original)
        self.assertIn("mountV4Pilot",result)
        self.assertEqual(result.count(DEPLOY.APP_ANCHOR),1)
        self.assertTrue(result.endswith("console.log('old');"))
        self.assertEqual(DEPLOY.patch_main(result),result)

    def test_refuses_ambiguous_api(self):
        with self.assertRaises(RuntimeError):
            DEPLOY.patch_main("console.log('no API anchor');")
        with self.assertRaises(RuntimeError):
            DEPLOY.patch_main(DEPLOY.APP_ANCHOR+"\n"+DEPLOY.STUDIO_MOUNTS[0])

    def test_patches_sidebar_without_replacing_unrelated_html(self):
        original="<nav>\n"+DEPLOY.SIDEBAR_ANCHOR+">Calendar</button>\n</nav>"
        revised=DEPLOY.patch_sidebar(original)
        self.assertIn('href="/v4-studio.html"',revised)
        self.assertIn("Calendar</button>",revised)
        self.assertEqual(revised,DEPLOY.patch_sidebar(revised))

    def test_sidebar_fails_closed_on_mismatch(self):
        with self.assertRaises(RuntimeError):
            DEPLOY.patch_sidebar("<nav>different layout</nav>")

    def test_git_blob_is_actual_git_hash(self):
        raw=b"V4 offline deployment source only\n"
        result=subprocess.run(["git","hash-object","--stdin"],input=raw,capture_output=True,check=True)
        self.assertEqual(DEPLOY.git_blob(raw),result.stdout.decode().strip())

    def test_symlinks_and_hardlinks_are_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            d=Path(root)
            p=d/"original"
            p.write_text("test")
            linked=d/"shortcut"
            linked.symlink_to(p)
            self.assertFalse(DEPLOY.regular(linked))
            hard=d/"hard"
            import os
            os.link(p,hard)
            self.assertFalse(DEPLOY.regular(p))
            self.assertFalse(DEPLOY.regular(hard))

if __name__=="__main__":
    unittest.main()
