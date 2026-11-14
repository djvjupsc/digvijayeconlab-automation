import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from quality import inspect_script, parse_subtitles

DEMO=Path(__file__).resolve().parents[1]/"examples/repo-rate-hindi.json"

class QualityTests(unittest.TestCase):
    def setUp(self):
        self.source=json.loads(DEMO.read_text(encoding="utf-8"))

    def save(self,root):
        path=root/"script.json"
        path.write_text(json.dumps(self.source,ensure_ascii=False),encoding="utf-8")
        return path

    def test_official_sources_with_unapproved_inventory_accepted(self):
        self.assertEqual(len(inspect_script(DEMO)["scenes"]),5)

    def test_generic_text_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.source["scenes"][0]["narration"]="Welcome back " + self.source["scenes"][0]["narration"]
            with self.assertRaises(ValueError):
                inspect_script(self.save(Path(d)))

    def test_no_sources_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.source["sources"]=[]
            with self.assertRaises(ValueError):
                inspect_script(self.save(Path(d)))

    def test_fake_claim_review_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.source["claims"][0]["reviewed"]=True
            with self.assertRaises(ValueError):
                inspect_script(self.save(Path(d)))

    def test_premature_upload_approval_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.source["review"]["uploadApproved"]=True
            with self.assertRaises(ValueError):
                inspect_script(self.save(Path(d)))

    def test_placeholder_broll_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.source["rights"]["externalFootage"]=["unknown.mp4"]
            with self.assertRaises(ValueError):
                inspect_script(self.save(Path(d)))

    def test_caption_time_validation(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"test.srt"
            p.write_text("\n\n".join(
                f"{i}\n00:00:{i:02d},000 --> 00:00:{i+1:02d},000\nGood subtitle text"
                for i in range(1,10)
            ),encoding="utf-8")
            self.assertEqual(len(parse_subtitles(p)),9)
            p.write_text(p.read_text().replace("00:00:02,000 --> 00:00:03,000","00:00:02,000 --> 00:00:07,000"),encoding="utf-8")
            with self.assertRaises(ValueError):
                parse_subtitles(p)

if __name__=="__main__":
    unittest.main()
