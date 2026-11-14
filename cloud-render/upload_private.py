#!/usr/bin/env python3
"""Upload ONLY an explicitly reviewed, hashed cloud artifact as PRIVATE YouTube video.

Requires GitHub environment secrets and a manually attested review. Never auto-publishes.
"""
import argparse
import json
import os
import sys
from pathlib import Path

from release_gate import PHRASE, verify_bundle

SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly"]

def upload(root, expected_hash, phrase, reviewer_note):
    evidence = verify_bundle(root, expected_hash, phrase, reviewer_note)
    required = ["YT_CLIENT_ID","YT_CLIENT_SECRET","YT_REFRESH_TOKEN",
                "YT_EXPECTED_CHANNEL_ID","YT_AUDIENCE"]
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise RuntimeError("Upload is blocked until GitHub environment secrets are configured: " + ", ".join(missing))
    if os.environ["YT_AUDIENCE"] not in ("made_for_kids","not_made_for_kids"):
        raise ValueError("Audience must be explicitly selected in repository environment secrets")

    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    credentials=Credentials(
        token=None,
        refresh_token=os.environ["YT_REFRESH_TOKEN"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["YT_CLIENT_ID"],
        client_secret=os.environ["YT_CLIENT_SECRET"],
        scopes=SCOPES
    )
    credentials.refresh(Request())
    youtube=build("youtube","v3",credentials=credentials,cache_discovery=False)
    channels=youtube.channels().list(part="id,snippet",mine=True,maxResults=1).execute()
    channel=(channels.get("items") or [None])[0]
    if not channel or channel.get("id")!=os.environ["YT_EXPECTED_CHANNEL_ID"]:
        raise RuntimeError("Authenticated YouTube channel is not the explicitly approved channel. No upload performed.")

    root=Path(root)
    info=json.loads((root/"youtube-metadata.json").read_text(encoding="utf-8"))
    body={
      "snippet":{
        "title":info["title"],
        "description":info["description"],
        "tags":info["tags"],
        "categoryId":str(info["categoryId"]),
        "defaultLanguage":info["defaultLanguage"]
      },
      "status":{
        "privacyStatus":"private",
        "selfDeclaredMadeForKids":os.environ["YT_AUDIENCE"]=="made_for_kids",
        "containsSyntheticMedia":True
      }
    }
    media=MediaFileUpload(str(root/"professional.mp4"),mimetype="video/mp4",chunksize=8*1024*1024,resumable=True)
    request=youtube.videos().insert(part="snippet,status",body=body,media_body=media)
    response=None
    while response is None:
        _,response=request.next_chunk(num_retries=3)
    video_id=response.get("id")
    if not video_id or response.get("status",{}).get("privacyStatus")!="private":
        raise RuntimeError("Upload response lacks confirmed PRIVATE status; verify in YouTube Studio immediately.")
    # Never expose tokens/creds. The link refers only to a PRIVATE video.
    receipt={"status":"private_uploaded","video_id":video_id,
             "privacy":"private","video_sha256":evidence["video_sha256"],
             "youtube_studio_url":f"https://studio.youtube.com/video/{video_id}/edit"}
    (root/"private-upload-receipt.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(receipt,indent=2))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--artifact-dir",type=Path,required=True)
    p.add_argument("--sha256",required=True)
    p.add_argument("--approval-phrase",required=True)
    p.add_argument("--review-note",required=True)
    p.add_argument("--upload",action="store_true")
    a=p.parse_args()
    if not a.upload:
        verify_bundle(a.artifact_dir,a.sha256,a.approval_phrase,a.review_note)
        print("PASS: dry-run release gate only. No YouTube API requests were sent.")
    else:
        upload(a.artifact_dir,a.sha256,a.approval_phrase,a.review_note)
