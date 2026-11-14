#!/usr/bin/env python3
"""Separate private-upload release gate. Default deny; never self-approve."""
import argparse
import hashlib
import json
from pathlib import Path

PHRASE = "I_REVIEWED_FULL_AUDIO_VISUALS_FACTS_AND_RIGHTS"

def verify_bundle(root, expected_hash, approval_phrase, reviewer_note):
    root=Path(root)
    files=("professional.mp4","quality-report.json","production-report.json","youtube-metadata.json","professional.srt")
    if any(not (root/f).is_file() for f in files):
        raise ValueError("Missing complete production artifact")
    video=root/"professional.mp4"
    digest=hashlib.sha256(video.read_bytes()).hexdigest()
    if not expected_hash or digest!=expected_hash:
        raise ValueError("Hash mismatch: wrong video or unapproved changes")
    if approval_phrase!=PHRASE:
        raise ValueError("Human approval for this exact video not attested")
    if len(reviewer_note.strip())<35:
        raise ValueError("Specific editorial, fact and rights reviewer note required")
    qc=json.loads((root/"quality-report.json").read_text(encoding="utf-8"))
    production=json.loads((root/"production-report.json").read_text(encoding="utf-8"))
    metadata=json.loads((root/"youtube-metadata.json").read_text(encoding="utf-8"))
    if qc.get("technical_qc")!="PASSED" or qc.get("video_sha256")!=digest:
        raise ValueError("Video did not pass its independent technical quality test")
    if production.get("sha256")!=digest or production.get("voice_eos_warnings")!=0:
        raise ValueError("Video production integrity failure")
    voice_label=production.get("narration","")
    if voice_label!="User-consented private voice reference on Hindi Pocket TTS research model":
        raise ValueError("Public demo or unverified narrator cannot be released as custom-voice production")
    if metadata.get("privacyStatus")!="private" or metadata.get("ready_for_upload") is not False:
        raise ValueError("Private-only upload policy or original review lock changed")
    if qc.get("upload_ready") is not False or production.get("upload_ready") is not False:
        raise ValueError("Unexpected preapproval; no auto-approved assets accepted")
    if qc.get("subtitles")!="estimated_timing_not_forced_aligned":
        raise ValueError("Unknown caption tracking mode")
    return {"video_sha256":digest,"title":metadata["title"],"privacy":"private",
            "human_reviewer_note":reviewer_note.strip(),
            "audio_visual_fact_rights_attested":True,"status":"reviewed_for_private_upload"}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--artifact-dir",type=Path,required=True)
    ap.add_argument("--sha256",required=True)
    ap.add_argument("--approval-phrase",required=True)
    ap.add_argument("--review-note",required=True)
    ap.add_argument("--output",type=Path)
    args=ap.parse_args()
    evidence=verify_bundle(args.artifact_dir,args.sha256,args.approval_phrase,args.review_note)
    if args.output:
        args.output.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("PASS: Exact artifact, technical QC and explicit editorial attestation. Privacy fixed to PRIVATE.")

if __name__=="__main__":
    main()
