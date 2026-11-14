#!/usr/bin/env python3
"""GitHub-only Pocket TTS Hindi + FFmpeg preview renderer. No channel access."""
import argparse
import hashlib
import json
import os
import logging
import math
import re
import subprocess
from pathlib import Path

MODEL_CONFIG = "hf://saryps-labs/pocket-tts-hindi/config.yaml@dbaa326069d20bfbdaeb625613736773741a24ea"
PUBLIC_VOICE = "hf://kyutai/tts-voices/alba-mackenna/casual.wav"
SCENE_TYPES = {"question", "bank", "chart", "emi", "calendar"}

def chunk_hindi(text, maximum=11):
    """Tiny self-contained prompts avoid Pocket TTS max-length truncation."""
    replacements = {"RBI": "आर बी आई", "EMI": "ई एम आई", "Repo Rate": "रेपो दर",
                    "Floating": "फ्लोटिंग", "Rate": "रेट"}
    for old, new in replacements.items():
        text = text.replace(old,new)
    words=re.sub(r"[।?!,;:]", " ", text).split()
    if not words:
        raise ValueError("Empty TTS script")
    chunks=[" ".join(words[i:i+maximum]) for i in range(0,len(words),maximum)]
    if len(chunks)>1 and len(chunks[-1].split())<=3:
        chunks[-2] += " " + chunks[-1]
        chunks.pop()
    return chunks

def invoke(args):
    subprocess.run(args, check=True, stdin=subprocess.DEVNULL)

def probe(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=codec_type,width,height", "-of", "json", str(path)],
        check=True, capture_output=True, text=True
    )
    return json.loads(result.stdout)

def validate(path):
    source = json.loads(path.read_text(encoding="utf-8"))
    scenes = source.get("scenes")
    if not isinstance(scenes, list) or not 2 <= len(scenes) <= 8:
        raise ValueError("Need 2-8 complete scenes")
    if not source.get("synthetic_voice") is True:
        raise ValueError("Synthetic narration disclosure is required")
    for idx, scene in enumerate(scenes):
        headline = scene.get("headline")
        voice = scene.get("narration")
        if not isinstance(headline, list) or not 1 <= len(headline) <= 3:
            raise ValueError(f"Invalid headline in scene {idx}")
        if any(not isinstance(line, str) or not 1 <= len(line.strip()) <= 38 for line in headline):
            raise ValueError(f"Overlong headline in scene {idx}")
        if not isinstance(voice, str) or not 30 <= len(voice) <= 350:
            raise ValueError(f"Invalid narration in scene {idx}")
        if scene.get("visual") not in SCENE_TYPES:
            raise ValueError(f"Invalid visual type in scene {idx}")
        if re.search(r"\[(specific|example|placeholder)|this section covers|welcome back", voice, re.I):
            raise ValueError(f"Placeholder narration in scene {idx}")
    return source

def find_font():
    from pathlib import Path
    for name in [
        "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansDevanagariUI-Bold.ttf"
    ]:
        if Path(name).is_file():
            return name
    choices = list(Path("/usr/share/fonts").rglob("*Devanagari*Bold*.ttf"))
    if choices:
        return str(choices[0])
    raise RuntimeError("Missing Hindi font: install fonts-noto-core")


def draw_bilingual(draw, xy, content, size, color, measure_only=False):
    """Shape Hindi in Noto Devanagari and Latin text in a proper Latin font."""
    from PIL import ImageFont
    hindi = ImageFont.truetype(find_font(), size)
    latin_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    if not Path(latin_path).is_file():
        raise RuntimeError("Missing Latin font: fonts-dejavu-core")
    latin = ImageFont.truetype(latin_path, size)
    x, y = xy
    for span in re.findall(r"[\u0900-\u097F\u200C\u200D]+|[^\u0900-\u097F\u200C\u200D]+", content):
        is_hindi = any("\u0900" <= ch <= "\u097F" for ch in span)
        font = hindi if is_hindi else latin
        if not measure_only:
            draw.text((x, y), span, font=font, fill=color, language="hi" if is_hindi else "en")
        x += draw.textlength(span, font=font, language="hi" if is_hindi else "en")
    return x - xy[0]

def draw_poster(scene, index, count, out):
    from PIL import Image, ImageDraw, ImageFont, features
    if not features.check("raqm"):
        raise RuntimeError("Pillow lacks Hindi shaping support (libraqm)")
    w, h = 720, 1280
    canvas = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(canvas)
    for y in range(h):
        k = y / h
        d.line([(0, y), (w, y)], fill=(round(9 + 7 * k), round(19 + 19 * k), round(34 + 17 * k)))
    white, teal, muted = (240, 249, 249), (64, 222, 187), (154, 184, 198)
    d.rounded_rectangle((42, 47, 678, 125), radius=25, fill=(18, 43, 55))
    draw_bilingual(d, (67, 68), "DIGVIJAY ECONLAB", 26, teal)
    draw_bilingual(d, (58, 182), f"ECONOMICS  /  {index + 1:02d}", 26, muted)
    y = 248
    for line in scene["headline"]:
        length = draw_bilingual(d, (0, 0), line, 62, white, measure_only=True)
        if length > w - 104:
            raise ValueError(f"Headline too wide: {line}")
        draw_bilingual(d, (53, y), line, 62, white)
        y += 88
    d.rounded_rectangle((52, y + 14, 668, y + 102), radius=30, fill=(17, 71, 75))
    draw_bilingual(d, (76, y + 31), scene.get("emphasis", ""), 39, teal)

    cy = 815
    kind = scene["visual"]
    d.rounded_rectangle((53, 600, 667, 1033), radius=38, fill=(20, 43, 60), outline=(43, 90, 95), width=3)
    if kind == "question":
        d.ellipse((218, 679, 502, 963), outline=teal, width=12)
        draw_bilingual(d, (300, 686), "?", 165, white)
    elif kind == "bank":
        d.polygon([(190, 742), (360, 648), (530, 742)], fill=teal)
        d.rectangle((190, 747, 530, 776), fill=white)
        for x in range(216, 510, 96):
            d.rectangle((x, 782, x + 52, 925), fill=(88, 180, 183))
        d.rectangle((186, 936, 536, 963), fill=white)
    elif kind == "chart":
        d.line([(144, 930), (144, 700)], fill=muted, width=5)
        d.line([(144, 930), (586, 930)], fill=muted, width=5)
        pts = [(164, 902), (235, 850), (302, 875), (385, 758), (477, 799), (570, 705)]
        d.line(pts, fill=teal, width=12, joint="curve")
        for x, yy in pts:
            d.ellipse((x - 12, yy - 12, x + 12, yy + 12), fill=white)
    elif kind == "emi":
        for j, (label, size) in enumerate([("EMI", 310), ("TENURE", 220)]):
            yy = 723 + j * 134
            draw_bilingual(d, (98, yy - 30), label, 26, muted)
            d.rounded_rectangle((100, yy + 14, 597, yy + 55), radius=15, fill=(43, 80, 92))
            d.rounded_rectangle((100, yy + 14, 100 + size, yy + 55), radius=15, fill=teal)
    else:
        d.rounded_rectangle((198, 666, 522, 973), radius=26, fill=white)
        d.rectangle((198, 702, 522, 776), fill=teal)
        for yy in (820, 882, 942):
            for xx in (240, 328, 416):
                d.ellipse((xx - 11, yy - 11, xx + 11, yy + 11), fill=(27, 74, 88))
    d.line([(52, 1115), (668, 1115)], fill=(43, 93, 97), width=3)
    draw_bilingual(d, (55, 1141), "AI VOICE  •  PREVIEW ONLY", 26, muted)
    d.rounded_rectangle((53, 1212, 667, 1224), radius=6, fill=(37, 77, 85))
    d.rounded_rectangle((53, 1212, 53 + round(614 * (index + 1) / count), 1224), radius=6, fill=teal)
    canvas.save(out)

def stamp(seconds):
    ms = round(seconds * 1000)
    hours, ms = divmod(ms, 3600000)
    mins, ms = divmod(ms, 60000)
    secs, ms = divmod(ms, 1000)
    return f"{hours:02d}:{mins:02d}:{secs:02d},{ms:03d}"

def run(input_path, output_path):
    source = validate(input_path)
    output_path.mkdir(parents=True, exist_ok=True)
    from pocket_tts import TTSModel
    import scipy.io.wavfile
    import torch
    torch.set_num_threads(2)
    model = TTSModel.load_model(config=MODEL_CONFIG, temp=0.3)
    mode = os.environ.get("VOICE_MODE", "public_demo")
    if mode == "public_demo":
        voice = model.get_state_for_audio_prompt(PUBLIC_VOICE)
        voice_label = "Public Hindi Pocket TTS research demo (not private Jugnu)"
    elif mode == "private_hindi_prompt":
        required = ["HF_TOKEN", "PRIVATE_VOICE_HF_REPO", "PRIVATE_VOICE_HF_FILE",
                    "PRIVATE_VOICE_HF_REV", "PRIVATE_VOICE_SHA256"]
        missing = [key for key in required if not os.environ.get(key)]
        if missing or os.environ.get("VOICE_CONSENT_CONFIRMED") != "true":
            raise RuntimeError("Private voice is blocked: missing protected credentials, pinned hash, or speaker consent")
        from huggingface_hub import hf_hub_download
        local_file = Path(hf_hub_download(
            repo_id=os.environ["PRIVATE_VOICE_HF_REPO"],
            filename=os.environ["PRIVATE_VOICE_HF_FILE"],
            revision=os.environ["PRIVATE_VOICE_HF_REV"],
            token=os.environ["HF_TOKEN"]
        ))
        actual = hashlib.sha256(local_file.read_bytes()).hexdigest()
        if actual != os.environ["PRIVATE_VOICE_SHA256"].lower():
            raise RuntimeError("Private consented voice reference SHA256 mismatch")
        if local_file.suffix.lower() not in (".wav", ".flac"):
            raise RuntimeError("Private reference must be original WAV/FLAC, not opaque Jugnu state")
        voice = model.get_state_for_audio_prompt(str(local_file))
        voice_label = "User-consented private voice reference on Hindi Pocket TTS research model"
    else:
        raise RuntimeError("Unknown voice mode")
    class TTSEndOfSpeechAudit(logging.Handler):
        def __init__(self):
            super().__init__()
            self.count = 0
        def emit(self, record):
            if "Maximum generation length reached without EOS" in record.getMessage():
                self.count += 1
    eos_audit = TTSEndOfSpeechAudit()
    logging.getLogger("pocket_tts.models.tts_model").addHandler(eos_audit)
    concat = []
    subtitles = []
    elapsed = 0.0
    recovered_eos_warnings = 0
    total_tts_chunks = 0
    for idx, scene in enumerate(source["scenes"]):
        wav = output_path / f"{idx:02d}.wav"
        pic = output_path / f"{idx:02d}.png"
        part = output_path / f"{idx:02d}.mp4"
        import numpy as np
        chunk_arrays=[]
        for j,prompt in enumerate(chunk_hindi(scene["narration"])):
            total_tts_chunks += 1
            ok=False
            for attempt in range(3):
                torch.manual_seed(1879 + idx*100 + j*10 + attempt)
                before=eos_audit.count
                with torch.no_grad():
                    audio = model.generate_audio(voice, prompt)
                arr=audio.detach().cpu().numpy().astype("float32")
                duration_s=arr.size/model.sample_rate
                had_eos_error = eos_audit.count>before
                if had_eos_error:
                    recovered_eos_warnings += 1
                if not had_eos_error and 0.3<duration_s<12.0 and np.isfinite(arr).all() and float(np.max(np.abs(arr)))>0.02:
                    ok=True
                    chunk_arrays.append(arr)
                    break
            if not ok:
                raise RuntimeError(f"STOP: Unresolved EOS/quality failure in scene {idx+1}, Hindi chunk {j+1}; no video release")
            if j<len(chunk_hindi(scene["narration"]))-1:
                chunk_arrays.append(np.zeros(int(0.13*model.sample_rate),dtype=np.float32))
        samples=np.concatenate(chunk_arrays)
        if samples.size < model.sample_rate or not math.isfinite(float(samples.max())):
            raise RuntimeError(f"Missing/invalid TTS output for scene {idx}")
        scipy.io.wavfile.write(wav, model.sample_rate, samples)
        duration = float(probe(wav)["format"]["duration"])
        if not 1.0 <= duration <= 50.0:
            raise RuntimeError(f"Unexpected scene narration duration: {duration}")
        draw_poster(scene, idx, len(source["scenes"]), pic)
        invoke(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-loglevel", "error",
                "-loop", "1", "-framerate", "25", "-i", str(pic), "-i", str(wav),
                "-t", str(duration), "-vf", "format=yuv420p", "-c:v", "libx264",
                "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart", str(part)])
        concat.append("file '" + part.name + "'")
        subtitles.append(f"{idx + 1}\n{stamp(elapsed)} --> {stamp(elapsed + duration)}\n{scene['narration']}\n")
        elapsed += duration
    (output_path / "segments.txt").write_text("\n".join(concat) + "\n", encoding="utf-8")
    (output_path / "captions.srt").write_text("\n".join(subtitles), encoding="utf-8")
    video = output_path / "preview.mp4"
    invoke(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(output_path / "segments.txt"),
            "-c", "copy", "-movflags", "+faststart", str(video)])
    result = probe(video)
    streams = result["streams"]
    if not any(s.get("codec_type") == "video" and s.get("width") == 720 and s.get("height") == 1280 for s in streams):
        raise RuntimeError("Missing vertical video stream")
    if not any(s.get("codec_type") == "audio" for s in streams):
        raise RuntimeError("Missing audio stream")
    invoke(["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-xerror",
            "-i", str(video), "-f", "null", "-"])
    manifest = {
        "title": source["title"], "duration_seconds": float(result["format"]["duration"]),
        "tts": voice_label,
        "config": MODEL_CONFIG, "synthetic_voice": True,
        "status": "preview_needs_human_review",
        "tts_eos_warning_count": 0, "tts_eos_retry_count": recovered_eos_warnings,
        "tts_chunks": total_tts_chunks, "upload_ready": False,
        "publish_attempted": False, "source_note": source.get("source_note", "")
    }
    (output_path / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", type=Path, default=Path("cloud-render/examples/repo-rate-hindi.json"))
    ap.add_argument("--output", type=Path, default=Path("cloud-render/output"))
    ap.add_argument("--validate-only", action="store_true")
    args = ap.parse_args()
    if args.validate_only:
        print("PASS:", len(validate(args.script)["scenes"]), "scenes validated")
    else:
        run(args.script, args.output)
