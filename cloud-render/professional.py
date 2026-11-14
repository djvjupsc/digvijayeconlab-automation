#!/usr/bin/env python3
"""Original, content-specific finance motion edit. Uses no stock, paid API, or uploads."""
import argparse
import hashlib
import json
import math
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, features

W, H, FPS = 720, 1280, 25
BASE = Path(__file__).resolve().parent
EXPECTED_VISUALS = ("question", "bank", "chart", "emi", "calendar")
COLORS = [
    ((8, 23, 42), (20, 47, 72), (244, 105, 90)),
    ((8, 28, 40), (8, 63, 67), (75, 224, 176)),
    ((30, 20, 40), (73, 34, 69), (252, 175, 89)),
    ((12, 26, 54), (32, 52, 96), (99, 174, 250)),
    ((22, 28, 47), (53, 50, 87), (198, 165, 249)),
]

def run(*args):
    subprocess.run(args, check=True, stdin=subprocess.DEVNULL)

def probe(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,size:"
         "stream=codec_type,codec_name,width,height,sample_rate,channels",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True
    )
    return json.loads(result.stdout)

def font_path(kind="hi"):
    folder = Path("/usr/share/fonts/truetype")
    candidates = (
        ("noto/NotoSansDevanagari-Bold.ttf", "noto/NotoSansDevanagariUI-Bold.ttf")
        if kind == "hi" else ("dejavu/DejaVuSans-Bold.ttf",)
    )
    for candidate in candidates:
        p = folder / candidate
        if p.is_file():
            return str(p)
    glob = list(Path("/usr/share/fonts").rglob("*Devanagari*Bold*.ttf" if kind == "hi" else "DejaVuSans-Bold.ttf"))
    if not glob:
        raise RuntimeError(f"Missing font: {kind}")
    return str(glob[0])

def text_run(d, xy, txt, size, fill, max_width=None, center=False):
    """Bilingual text shaping with separate font stacks; no replacement squares."""
    hi, en = ImageFont.truetype(font_path(), size), ImageFont.truetype(font_path("en"), size)
    runs = re.findall(r"[\u0900-\u097F\u200C\u200D]+|[^\u0900-\u097F\u200C\u200D]+", txt)
    spans = []
    width = 0.0
    for span in runs:
        hindi = any("\u0900" <= c <= "\u097F" for c in span)
        f, lang = (hi, "hi") if hindi else (en, "en")
        sw = d.textlength(span, font=f, language=lang)
        spans.append((span, f, lang, sw))
        width += sw
    if max_width and width > max_width:
        raise ValueError(f"Text overflows safe area: {txt!r} ({width:.0f}>{max_width})")
    x, y = xy
    if center:
        x -= width / 2
    for span, f, lang, sw in spans:
        d.text((round(x), round(y)), span, font=f, fill=fill, language=lang, stroke_width=0)
        x += sw
    return width

def rr(draw, area, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(area, radius=radius, fill=fill, outline=outline, width=width)

def circle(draw, xy, r, fill, outline=None, width=1):
    x, y = xy
    draw.ellipse((x-r,y-r,x+r,y+r), fill=fill, outline=outline, width=width)

def base_canvas(scene_number):
    dark, bottom, accent = COLORS[scene_number % len(COLORS)]
    im = Image.new("RGB", (W,H), dark)
    d = ImageDraw.Draw(im)
    for y in range(H):
        f = y/H
        mixed=tuple(round(dark[i]*(1-f)+bottom[i]*f) for i in range(3))
        d.line([(0,y),(W,y)], fill=mixed)
    for j in range(16):
        xx = (j * 169 + scene_number * 137) % W
        yy = (j * 223 + scene_number * 73) % H
        circle(d,(xx,yy),2,(75,99,113))
    d.ellipse((W-150,-210,W+450,390),outline=tuple(min(255,v+28) for v in bottom),width=5)
    d.arc((-290,700,300,1400),start=240,end=350,fill=tuple(min(255,v+33) for v in bottom),width=6)
    rr(d,(42,55,318,100),19,(243,246,242))
    text_run(d,(62,64),"DIGVIJAY ECONLAB",19,(24,38,49))
    text_run(d,(44,128),f"ECONOMICS / {scene_number+1:02d}",22,(188,203,216))
    d.line([(44,1056),(W-44,1056)], fill=accent,width=4)
    text_run(d,(44,1082),"REPO RATE  /  EMI",20,(195,214,224))
    text_run(d,(44,1168),"AI NARRATION • REVIEW COPY",18,(154,184,193))
    return im,d,accent

def headline(d, lines, accent):
    y=218
    for i,line in enumerate(lines):
        size=62 if len(line)<17 else 51
        text_run(d,(43,y),line,size,(251,250,247),max_width=635)
        y += 92
    d.line([(43,y+13),(43+min(540,115*len(lines)),y+13)],fill=accent,width=9)
    return y+45

def draw_question(d, accent, y):
    # Household receipt and a rate-change alert; not a generic question-card.
    rr(d,(80,510,502,970),30,(246,247,245))
    rr(d,(106,542,475,602),13,(221,228,230))
    text_run(d,(121,556),"HOME LOAN",26,(26,46,66))
    for t, yy in [("LOAN EMI",650),("PAYMENT DATE",735),("LOAN TERMS",820)]:
        text_run(d,(115,yy),t,23,(65,87,103))
        d.line([(330,yy+22),(442,yy+22)],fill=(176,187,195),width=5)
    rr(d,(306,677,619,799),29,accent)
    text_run(d,(345,700),"EMI?",56,(16,26,38))
    circle(d,(560,554),54,(243,90,92))
    text_run(d,(531,522),"!",76,(255,255,255))
    d.arc((525,833,663,960),30,300,fill=accent,width=10)
    d.polygon([(657,830),(665,879),(628,856)],fill=accent)

def draw_bank(d, accent, y):
    # Interest-rate plumbing: Reserve Bank -> commercial bank -> household.
    d.polygon([(113,635),(335,515),(557,635)],fill=(236,245,239))
    rr(d,(124,639,545,664),10,(210,229,229))
    for x in (158,257,356,455):
        rr(d,(x,674,x+58,824),12,(88,202,180))
    d.rectangle((109,827,560,857),fill=(235,246,242))
    text_run(d,(295,878),"RBI",63,accent,center=True)
    d.line([(96,955),(620,955)],fill=accent,width=8)
    for x in (250,490):
        d.polygon([(x,941),(x+29,955),(x,969)],fill=accent)
    text_run(d,(75,977),"BANKS",27,(236,247,248))
    text_run(d,(473,977),"LOANS",27,(236,247,248))

def draw_chart(d, accent, y):
    # Rising pressure in retail prices, without fabricated real data points.
    d.line([(100,889),(620,889)],fill=(212,215,216),width=4)
    d.line([(104,891),(104,518)],fill=(212,215,216),width=4)
    coords=[(122,822),(201,803),(275,758),(350,783),(430,683),(507,631),(606,566)]
    d.line(coords,fill=accent,width=18,joint="curve")
    for xx,yy in coords:
        circle(d,(xx,yy),11,(246,243,237))
    rr(d,(135,945,585,1016),20,(251,241,222))
    text_run(d,(186,957),"PRICE PRESSURE",28,(54,45,54))
    text_run(d,(111,491),"illustrative • not actual CPI data",19,(190,201,206))

def draw_emi(d,accent,y):
    # Side-by-side options instead of fake numbers.
    rr(d,(55,523,665,723),25,(237,244,251))
    text_run(d,(90,544),"EMI",52,(25,48,75))
    text_run(d,(90,622),"PAYMENT",28,(77,99,118))
    rr(d,(434,578,624,643),23,accent)
    text_run(d,(481,587),"+ / −",30,(18,34,48))
    rr(d,(55,758,665,966),25,(237,244,251))
    text_run(d,(90,779),"LOAN TENURE",43,(25,48,75))
    text_run(d,(90,857),"DURATION",27,(77,99,118))
    rr(d,(436,816,623,881),24,accent)
    text_run(d,(484,825),"+ / −",30,(18,34,48))

def draw_calendar(d,accent,y):
    rr(d,(120,500,602,986),32,(247,247,245))
    rr(d,(120,500,602,589),25,accent)
    text_run(d,(206,512),"RESET DATE",37,(28,36,53))
    for i in range(5):
        for j in range(4):
            xx=181+j*102; yy=655+i*61
            circle(d,(xx,yy),15, (212,220,229))
    d.rounded_rectangle((357,768,447,832),radius=14,fill=accent)
    text_run(d,(150,913),"CHECK TERMS",28,(44,65,84))
    d.line([(150,955),(526,955)],fill=(173,191,202),width=3)

def frame(scene, index, count, path):
    if not features.check("raqm"):
        raise RuntimeError("libraqm required for shaped Hindi")
    im,d,accent=base_canvas(index)
    headline(d,scene["headline"],accent)
    visual=scene["visual"]
    if visual=="question": draw_question(d,accent,530)
    elif visual=="bank": draw_bank(d,accent,530)
    elif visual=="chart": draw_chart(d,accent,530)
    elif visual=="emi": draw_emi(d,accent,530)
    elif visual=="calendar": draw_calendar(d,accent,530)
    else: raise ValueError(f"Unknown visual {visual}")
    progress = round(630*(index+1)/count)
    rr(d,(44,1232,674,1242),5,(71,94,105))
    rr(d,(44,1232,44+progress,1242),5,accent)
    im.save(path)

def stamp(sec):
    ms = round(sec*1000)
    hh,ms=divmod(ms,3600000)
    mm,ms=divmod(ms,60000)
    ss,ms=divmod(ms,1000)
    return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"

def short_captions(scenes,durations,path):
    cues=[]
    elapsed=0.0
    for scene,duration in zip(scenes,durations):
        parts=scene["narration"].split()
        if len(parts)<3:
            raise ValueError("Narration too short for captions")
        k=math.ceil(len(parts)/6)
        for j in range(k):
            a=math.floor(j*len(parts)/k); b=math.floor((j+1)*len(parts)/k)
            text=" ".join(parts[a:b])
            start=elapsed+duration*a/len(parts)
            end=elapsed+duration*b/len(parts)
            if not text or end<=start: raise ValueError("Empty cue")
            cues.append((start,end,text))
        elapsed+=duration
    path.write_text("\n\n".join(
        f"{i}\n{stamp(a)} --> {stamp(b)}\n{text}" for i,(a,b,text) in enumerate(cues,1)
    )+"\n",encoding="utf-8")
    return cues

def make_thumbnail(first, output):
    base=Image.open(first).convert("RGB").resize((1080,1920),Image.Resampling.LANCZOS)
    d=ImageDraw.Draw(base)
    rr(d,(76,1345,1004,1650),55,(9,26,38))
    text_run(d,(117,1409),"EMI अगले दिन?",80,(255,250,241),max_width=880)
    base.save(output,quality=93,optimize=True)

def make_metadata(source,path):
    description=(
        "रेपो दर बदलने से हर होम लोन की EMI उसी दिन नहीं बदलती। "
        "Floating-rate loans में reset date और बैंक की शर्तें महत्वपूर्ण हैं।\n\n"
        "RBI official references:\n"
        "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12942\n"
        "https://old.rbi.org.in/commonman/english/scripts/FAQs.aspx?Id=3687\n\n"
        "Educational content; not personal financial advice. Synthetic narration used.\n#Shorts #RepoRate #EMI #HindiEconomics"
    )
    meta={
        "title":source["title"],"description":description,
        "tags":["Repo Rate","RBI","EMI","Home Loan","Economics in Hindi","DigvijayEconLab"],
        "categoryId":"27","defaultLanguage":"hi","privacyStatus":"private",
        "containsSyntheticMedia":True,
        "human_review_required":True,"ready_for_upload":False,
    }
    path.write_text(json.dumps(meta,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return meta

def build(script,out):
    source=json.loads(script.read_text(encoding="utf-8"))
    scenes=source["scenes"]
    if len(scenes)!=5 or tuple(s["visual"] for s in scenes)!=EXPECTED_VISUALS:
        raise ValueError("This five-part editorial storyboard must match approved scene types")
    out.mkdir(parents=True,exist_ok=True)
    prior=json.loads((out/"manifest.json").read_text(encoding="utf-8"))
    if prior.get("tts_eos_warning_count",0):
        raise RuntimeError("Voice generation reached max length without EOS; reject until repaired")
    durations=[]
    parts=[]
    for i,scene in enumerate(scenes):
        wav=out/f"{i:02d}.wav"
        seconds=float(probe(wav)["format"]["duration"])
        if not 2<seconds<30: raise RuntimeError(f"Narration duration out of range {i}: {seconds}")
        durations.append(seconds)
        poster=out/f"pro-{i:02d}.png"
        clip=out/f"pro-{i:02d}.mp4"
        frame(scene,i,len(scenes),poster)
        # Ken Burns zoom plus gently timed fade. The graphical scene is not a static slide.
        vf=(f"scale=792:1408,zoompan=z='min(zoom+0.00030,1.12)':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:"
            f"fps={FPS}:s={W}x{H},format=yuv420p,"
            f"fade=t=in:st=0:d=0.18,fade=t=out:st={max(0,seconds-0.18):.3f}:d=0.18")
        run("ffmpeg","-y","-hide_banner","-nostdin","-loglevel","error",
            "-loop","1","-framerate",str(FPS),"-i",str(poster),"-i",str(wav),
            "-t",str(seconds),"-vf",vf,"-c:v","libx264","-preset","veryfast",
            "-crf","20","-r",str(FPS),"-pix_fmt","yuv420p",
            "-c:a","aac","-b:a","160k","-ar","48000","-movflags","+faststart",str(clip))
        parts.append(clip)
    timeline=out/"pro-concat.txt"
    timeline.write_text("\n".join(f"file '{p.name}'" for p in parts)+"\n",encoding="utf-8")
    stage=out/"pro-master.mp4"
    run("ffmpeg","-y","-hide_banner","-nostdin","-loglevel","error",
        "-f","concat","-safe","0","-i",str(timeline),
        "-c:v","libx264","-preset","veryfast","-crf","20",
        "-c:a","aac","-b:a","160k","-movflags","+faststart",str(stage))
    cues=short_captions(scenes,durations,out/"professional.srt")
    # Preserve an editable subtitle sidecar; burn a copy into the final viewing file.
    ass_style=(
        "FontName=Noto Sans Devanagari,FontSize=19,"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00121B27,"
        "BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=245"
    )
    destination=out/"professional.mp4"
    subpath=(out/"professional.srt").resolve().as_posix()
    run("ffmpeg","-y","-hide_banner","-nostdin","-loglevel","error",
        "-i",str(stage),"-vf",f"subtitles={subpath}:force_style='{ass_style}'",
        "-c:v","libx264","-preset","veryfast","-crf","20",
        "-c:a","copy","-movflags","+faststart",str(destination))
    make_thumbnail(out/"pro-00.png",out/"thumbnail.jpg")
    make_metadata(source,out/"youtube-metadata.json")
    report={
        "video":"professional.mp4","sha256":hashlib.sha256(destination.read_bytes()).hexdigest(),
        "duration_seconds":float(probe(destination)["format"]["duration"]),
        "scenes":len(scenes),"caption_cues":len(cues),
        "storyboard":"Original contextual motion graphics; not real filmed footage",
        "narration":prior.get("tts","Unknown"),"voice_eos_warnings":prior.get("tts_eos_warning_count",0),
        "audio_listener_reviewed":False,"visual_listener_reviewed":False,
        "factual_inventory_approved":False,"editorial_review_approved":False,
        "rights_review_approved":False,"upload_ready":False,
        "next_step":"Review full audio/visuals, verify facts and licensing, and approve before any upload."
    }
    (out/"production-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return report

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--script",type=Path,default=BASE/"examples/repo-rate-hindi.json")
    ap.add_argument("--output",type=Path,default=BASE/"output")
    args=ap.parse_args()
    print(json.dumps(build(args.script,args.output),indent=2,ensure_ascii=False))
