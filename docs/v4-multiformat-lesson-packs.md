# DigvijayEconLab — offline V4 multi-format lesson packs

This is a **review-only content/storyboard packaging step** in the larger presenter-free V4 workflow, **NOT** a tested general-topic renderer, automated Host V10 generator, uploader or scheduler. The fixed Demand/Supply 10-second pilot remains separate and unchanged.

## Why this is separate

The existing verified Android HyperFrames project (\`drafts/step196\`) is a pinned, *fixed-topic* animation. Simply replacing its heading with an arbitrary economics topic would display the wrong economics graphs. The script in this PR preserves each topic's own annotated curve, flow, comparison, equation, or timeline data and refuses unknown visuals, missing evidence references, bad lengths, or missing formats. It never invents claims.

## Build a source-grounded lesson

Prepare a **UTF-8 JSON file** with:

- \`schemaVersion: 1\`, \`topicId\` (lowercase slug), \`title\`, \`unit\`, \`language: "hi-IN"\`
- \`sources: [{id,title,url,notes}]\`: original HTTPS sources; the code records URLs but **does not visit or verify them**.
- \`claims: [{id,statement,sourceIds}]\`: all factual claims; no empty or broken claim inventory.
- \`variants.long|medium|short.scenes[]\`: each scene contains \`name\`, **complete Hindi narration**, \`claimIds\` and a typed \`visual\`.
- \`community: {text,claimIds}\`: independent community post.

For a concept scene, write:
\`\`\`json
{
  "name": "बाजार में मांग",
  "narration": "जब अन्य स्थितियाँ समान हों तो कीमत बढ़ने के साथ मांग की मात्रा सामान्यतः घटती है।",
  "claimIds": ["claim-demand"],
  "visual": {
    "type": "curve",
    "title": "Demand curve",
    "xLabel": "मात्रा (Q)",
    "yLabel": "कीमत (P)",
    "curves": [{"name":"D","points":[[0,95],[35,75],[65,45],[100,10]]}]
  }
}
\`\`\`
The shown narration is **illustrative only**, not a production episode or an attested claim. Point coordinates are chart-frame percentages, *not* externally verified economic observations. Each real scene needs its own accurate, independently reviewed theory and diagram.

Supported \`visual.type\` values:
- \`concept-map\`, \`flow\`, \`comparison\`: \`title\` and \`nodes\` (2–10 distinct labels).
- \`curve\`: \`title\`, \`xLabel\`, \`yLabel\`, one \`curves\` object, each with \`name\` and ordered numeric \`points\` between 0 and 100.
- \`curve-pair\`: same axes with exactly two curves, optional \`equilibrium: {x,y,label}\`.
- \`timeline\`: \`title\` and \`events: [{label,text}]\`.
- \`equation\`: \`title\` and \`formula\`.

**Word-count gates** (based on whitespace-separated Hindi words across scene narrations):

| Format | Count | Scene count |
|---|---:|---:|
| Long | 1,050–1,500 | 5–24 |
| Medium | 400–650 | 4–14 |
| Shorts | 75–140 | 3–7 |
| Community | 30–180 | text-only |

If the authored source does not contain those formats and word counts, the builder **stops**; it never pads with filler or silently calls a model.

## Running (no service restart, no paid APIs)

\`\`\`bash
node --test test/v4-offline-course-pack.test.js
node scripts/v4-offline-course-pack.js /path/to/your-reviewed-topic.json
\`\`\`

By default, it creates one write-once folder \`~/digvijayeconlab-automation/data/v4-course-drafts/<topicId>/\`, containing:

- \`manifest.json\`, \`claims.json\`
- \`long/script.md\`, \`long/storyboard.json\`
- \`medium/script.md\`, \`medium/storyboard.json\`
- \`short/script.md\`, \`short/storyboard.json\`
- \`community-post.md\`, \`community-meta.json\`

Every video storyboard includes a list of required **Host V10** audio clips; **no WAV is claimed to exist**. The builder **does not generate an MP4, thumbnail, voice, SRT, or preview**, and cannot publish. Re-running an existing topic **refuses overwrite**. It never deletes failed temporary directories; investigate before retrying.

## Missing acceptance criteria — remain blocked

1. Connect an **audited local Jugnu Host V10 synthesis interface** (the production phone worker is not versioned in the GitHub repository), confirm Hindi phonemes/naturalness and explicit no-eSpeak/no-paid fallback. Do not assume that the presence of \`scripts/jugnu_tts_worker.py\` proves an interface.
2. Create a topic-specific dynamic V4 renderer from typed storyboard diagrams. Test on Android Chromium/HyperFrames/FFmpeg, including med/long resource limits and MP4/audio/caption QA. Do **not** reuse a demand/supply clip for unrelated graphs or label drafts \`video.mp4\`.
3. Match claims to official materials; complete full claim inventory, provenance and rights review. Recording a source URL is not independent verification.
4. Install only after blob verification and device-side offline tests, without broad staging/reset, credential access, scheduler changes, or overwriting the fixed pilot.
5. Integrate the existing scheduler/production-gates only once the full pipeline is verified, then separately authorize publishing. Keep current automation paused meanwhile.

The operator's accepted 10-second Demand/Supply pilot is a separate fixed renderer and stays untouched.