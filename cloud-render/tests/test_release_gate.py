import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from release_gate import PHRASE,verify_bundle

NOTE="I listened to each scene, reviewed factual claims, subtitle timings and all visual rights."

class ManualReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        movie=b"not a real video, a checksum-gate unit-test fixture"
        (self.root/"professional.mp4").write_bytes(movie)
        self.digest=hashlib.sha256(movie).hexdigest()
        for file,data in {
            "quality-report.json":{"technical_qc":"PASSED","video_sha256":self.digest,"upload_ready":False,"subtitles":"estimated_timing_not_forced_aligned"},
            "production-report.json":{"sha256":self.digest,"voice_eos_warnings":0,"upload_ready":False},
            "youtube-metadata.json":{"privacyStatus":"private","ready_for_upload":False,"title":"Preview"},
        }.items():
            (self.root/file).write_text(json.dumps(data),encoding="utf-8")
        (self.root/"professional.srt").write_text("test",encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_exact_hash_and_attestation_succeeds(self):
        self.assertEqual(verify_bundle(self.root,self.digest,PHRASE,NOTE)["status"],"reviewed_for_private_upload")

    def test_wrong_hash_blocks(self):
        with self.assertRaises(ValueError):
            verify_bundle(self.root,"0"*64,PHRASE,NOTE)

    def test_unapproved_phrase_blocks(self):
        with self.assertRaises(ValueError):
            verify_bundle(self.root,self.digest,"yes",NOTE)

    def test_empty_review_note_blocks(self):
        with self.assertRaises(ValueError):
            verify_bundle(self.root,self.digest,PHRASE,"okay")

    def test_absent_quality_report_blocks(self):
        (self.root/"quality-report.json").unlink()
        with self.assertRaises(ValueError):
            verify_bundle(self.root,self.digest,PHRASE,NOTE)

    def test_public_privacy_blocks(self):
        (self.root/"youtube-metadata.json").write_text(json.dumps({"title":"x","privacyStatus":"public","ready_for_upload":False}),encoding="utf-8")
        with self.assertRaises(ValueError):
            verify_bundle(self.root,self.digest,PHRASE,NOTE)

    def test_no_secret_upload_attempt_when_missing(self):
        from upload_private import upload
        from unittest.mock import patch
        with patch.dict("os.environ",{},clear=True):
            with self.assertRaisesRegex(RuntimeError,"secrets"):
                upload(self.root,self.digest,PHRASE,NOTE)

if __name__=="__main__":
    unittest.main()
