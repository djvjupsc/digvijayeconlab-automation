"""Offline checks for GitHub Free/private workflow authentication boundaries."""
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
PRODUCER=(ROOT/".github/workflows/jugnu-cloud-preview.yml").read_text(encoding="utf-8")
UPLOADER=(ROOT/".github/workflows/youtube-private-upload.yml").read_text(encoding="utf-8")

class PrivateWorkflowTests(unittest.TestCase):
    def test_private_voice_disallowed_in_public_repo(self):
        self.assertIn("github.event.repository.private != true",PRODUCER)
        self.assertIn("github.event.repository.private == true",PRODUCER)

    def test_upload_only_manual_on_main_and_private(self):
        self.assertIn("workflow_dispatch:",UPLOADER)
        self.assertNotIn("\n  push:",UPLOADER)
        self.assertNotIn("\n  schedule:",UPLOADER)
        self.assertIn("github.ref == 'refs/heads/main' && github.event.repository.private == true",UPLOADER)

    def test_actor_gate_is_fail_closed(self):
        self.assertIn("secrets.YT_APPROVED_GITHUB_ACTOR",UPLOADER)
        self.assertIn('[ -z "$APPROVED_ACTOR" ]',UPLOADER)
        self.assertIn('"$INVOKING_ACTOR" != "$APPROVED_ACTOR"',UPLOADER)

    def test_upload_uses_repo_secrets_not_paid_private_environments(self):
        self.assertNotIn("    environment: youtube-private-upload",UPLOADER)
        self.assertIn("secrets.YT_REFRESH_TOKEN",UPLOADER)
        self.assertIn("secrets.YT_EXPECTED_CHANNEL_ID",UPLOADER)

    def test_review_gate_and_producer_origin_present(self):
        self.assertIn("cloud-render/release_gate.py",UPLOADER)
        self.assertIn("run.conclusion !== 'success'",UPLOADER)
        self.assertIn("run.head_branch !== 'main'",UPLOADER)

if __name__=="__main__":
    unittest.main()
