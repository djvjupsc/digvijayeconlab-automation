#!/usr/bin/env python3
"""Fail-closed cloud video gate. Technical PASS never implies editorial approval."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from professional import probe

BAD_PHRASES = (
    "welcome back", "this section covers", "specific case study", "the potential for growth",
    "early adopters", "[example", "[placeholder", "subscribe for more",
    "that's everything you need to know",
)
EXPECTED_TYPES = ("question","bank","chart","emi","calendar")
REQUIRED_REVIEW = ("factualClaimInventoryReviewed","editorialApproved","rightsApproved","uploadApproved")

def inspect_script(path):
    data=json.loads(path.read_text(encoding="utf-8"))
    scenes=data.get("scenes")
    if not isinstance(scenes,list) or len(scenes)!=5:
        raise ValueError("Expected exactly five storyboard scenes")
    if tuple(x.get("visual") for x in scenes)!=EXPECTED_TYPES:
        raise ValueError("Storyboard visuals must be topic-specific")
    combined=" ".join(str(x.get("narration","")) for x in scenes)
    for phrase in BAD_PHRASES:
        if phrase in combined.lower():
            raise ValueError(f"Generic or placeholder narration: {phrase}")
    if sum("\u0900"<=c<="\u097f" for c in combined) < 200:
        raise ValueError("Hindi-first narration required")
    sources=data.get("sources")
    if not isinstance(sources,list) or len(sources)<2:
        raise ValueError("At least two fact sources required")
    ids=set()
    for source in sources:
        if not isinstance(source,dict) or source.get("reviewed") is not False:
            raise ValueError("Source review must start pending")
        if not re.match(r"^https://(old\.)?rbi\.org\.in/",source.get("url",""),re.I):
            raise ValueError("Pilot sources must be official RBI HTTPS pages")
        if not source.get("id") or source["id"] in ids:
            raise ValueError("Duplicate or empty source id")
        ids.add(source["id"])
    claims=data.get("claims")
    if not isinstance(claims,list) or len(claims)<3:
        raise ValueError("Missing factual claim inventory")
    for claim in claims:
        if claim.get("reviewed") is not False or not claim.get("sourceIds"):
            raise ValueError("Claims must be sourced and pending review")
        if not set(claim["sourceIds"]).issubset(ids):
            raise ValueError("Unknown source in claim")
        if not claim.get("text"):
            raise ValueError("Empty claim")
    review=data.get("review")
    if not isinstance(review,dict) or any(review.get(k) is not False for k in REQUIRED_REVIEW):
        raise ValueError("Cloud generation must not self-approve review gates")
    rights=data.get("rights",{})
    if rights.get("visuals")!="original_graphics" or rights.get("music")!="none" or rights.get("externalFootage")!=[]:
        raise ValueError("Unexpected or unlicensed visual/music assets")
    return data

def ffmpeg_decode(path):
    proc=subprocess.run(["ffmpeg","-hide_banner","-nostdin","-v","error","-xerror",
        "-i",str(path),"-map","0:v:0","-map","0:a:0","-f","null","-"],
        stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
    if proc.returncode:
        raise RuntimeError(f"MP4 decode failed: {proc.stderr[-300:]}")

def parse_subtitles(path):
    s=path.read_text(encoding="utf-8-sig")
    matches=re.findall(r"(?m)^(\d+)\s*\n(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})\s*\n(.+?)(?:\n\n|\Z)",s,re.S)
    if not matches:
        raise ValueError("No subtitles")
    def seconds(t):
        hh,mm,ss=t.replace(",",":").split(":")
        a,b=ss,0
        return int(hh)*3600+int(mm)*60+int(a)+int(b)/1000
    # 00:00:01,200 becomes five values on replace; parse explicitly below.
    def ts(t):
        clock,ms=t.split(",")
        h,m,s=map(int,clock.split(":"))
        return 3600*h+60*m+s+int(ms)/1000
    cues=[]
    last=0.0
    for i,(idx,start,end,words) in enumerate(matches,1):
        a,b=ts(start),ts(end)
        if int(idx)!=i or a<last-0.001 or b<=a:
            raise ValueError(f"Non-monotonic subtitle cue {i}")
        if b-a>4.6 or len(words.strip())>95 or len(words.strip())<3:
            raise ValueError(f"Bad subtitle density at cue {i}")
        cues.append((a,b))
        last=b
    if len(cues)<8:
        raise ValueError("Short form captions must have multiple short cues")
    return cues

def analyze_audio(path):
    import wave
    import numpy as np
    # Must contain real voice content; not a token or blank WAV.
    with wave.open(str(path),"rb") as wf:
        if wf.getnchannels()!=1 or wf.getsampwidth()!=4 or wf.getframerate()<16000:
            raise ValueError("Unexpected narration WAV format")
        raw=wf.readframes(wf.getnframes())
        if len(raw)<32000: raise ValueError("Empty narration")
        samples=np.frombuffer(raw,dtype=np.float32)
    if not np.isfinite(samples).all():
        raise ValueError("Non-finite narration audio")
    peak=float(np.max(np.abs(samples)))
    rms=float(np.sqrt(np.mean(samples.astype(np.float64)**2)))
    if not (0.003<rms<0.45) or peak<0.03 or peak>=0.999:
        raise ValueError(f"Speech loudness/clipping failed: rms={rms:.5f} peak={peak:.5f}")
    # Chunked RMS: reject mostly-silent or stuck voices.
    slices=np.array_split(samples,min(24,max(4,len(samples)//24000)))
    active=sum(float(np.sqrt(np.mean(x.astype(np.float64)**2)))>0.005 for x in slices)
    if active/max(1,len(slices))<0.55:
        raise ValueError("Narration has excessive near-silence")
    return {"rms":round(rms,5),"peak":round(peak,5),"active_chunks":int(active),"chunks":len(slices)}

def inspect_render(script,out):
    inspect_script(script)
    mp4=out/"professional.mp4"
    subs=out/"professional.srt"
    report=out/"production-report.json"
    thumb=out/"thumbnail.jpg"
    meta=out/"youtube-metadata.json"
    required=[mp4,subs,report,thumb,meta,out/"manifest.json"]
    for x in required:
        if not x.is_file() or x.stat().st_size<200:
            raise ValueError(f"Missing/empty output {x.name}")
    data=probe(mp4)
    streams=data.get("streams",[])
    vs=[s for s in streams if s.get("codec_type")=="video"]
    aus=[s for s in streams if s.get("codec_type")=="audio"]
    if len(vs)!=1 or len(aus)!=1:
        raise ValueError("Video needs exactly one video and audio stream")
    if (vs[0].get("codec_name"),vs[0].get("width"),vs[0].get("height"))!=("h264",720,1280):
        raise ValueError("Wrong codec/resolution; Shorts require vertical format")
    if aus[0].get("codec_name")!="aac":
        raise ValueError("AAC audio required")
    duration=float(data["format"]["duration"])
    if not 15<duration<180:
        raise ValueError("Duration outside Shorts range")
    cues=parse_subtitles(subs)
    if abs(cues[-1][1]-duration)>0.9:
        raise ValueError(f"Caption ends at {cues[-1][1]}, video at {duration}")
    manifest=json.loads((out/"manifest.json").read_text(encoding="utf-8"))
    if manifest.get("tts_eos_warning_count")!=0:
        raise ValueError("TTS model failed to terminate cleanly")
    for i in range(5):
        analyze_audio(out/f"{i:02d}.wav")
    if not thumb.is_file():
        raise ValueError("Thumbnail missing")
    from PIL import Image
    with Image.open(thumb) as im:
        if im.size!=(1080,1920): raise ValueError("Wrong vertical thumbnail dimensions")
    mt=json.loads(meta.read_text(encoding="utf-8"))
    if mt.get("privacyStatus")!="private" or mt.get("ready_for_upload") is not False:
        raise ValueError("Privacy or review bypass")
    note=json.loads(report.read_text(encoding="utf-8"))
    digest=hashlib.sha256(mp4.read_bytes()).hexdigest()
    if note.get("sha256")!=digest or note.get("upload_ready") is not False:
        raise ValueError("Missing immutable render hash or review lock")
    ffmpeg_decode(mp4)
    result={
        "technical_qc":"PASSED",
        "duration_seconds":round(duration,3),
        "resolution":"720x1280","codec":"H264/AAC",
        "subtitles":"estimated_timing_not_forced_aligned",
        "subtitle_cue_count":len(cues),
        "narration_eos_warnings":0,
        "video_sha256":digest,
        "human_voice_quality_review":"PENDING",
        "human_visual_review":"PENDING",
        "factual_claim_review":"PENDING",
        "rights_review":"PENDING",
        "youtube_upload":"NOT_ATTEMPTED",
        "upload_ready":False,
    }
    (out/"quality-report.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return result

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--script",type=Path,default=Path(__file__).parent/"examples/repo-rate-hindi.json")
    parser.add_argument("--output",type=Path,default=Path(__file__).parent/"output")
    parser.add_argument("--preflight",action="store_true")
    args=parser.parse_args()
    result=inspect_script(args.script) if args.preflight else inspect_render(args.script,args.output)
    print(json.dumps({"preflight":"PASS","scenes":len(result["scenes"])} if args.preflight else result,ensure_ascii=False,indent=2))
