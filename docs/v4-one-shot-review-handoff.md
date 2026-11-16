# V4 consolidated offline review handoff — Android Termux

This is a **single opt-in review batch** for the user's DigvijayEconLab local educational content workflow, **not** a scheduled/approved YouTube publishing release.

## What the batch completes, only if each local stage passes

1. Confirm pinned GitHub files are safely installed (the operator's terminal installation block handles hash, backups and offline tests).
2. Render and decode a separate 10-second silent dynamic educational **concept-flow** scene with Chromium/HyperFrames. This smoke remains distinct from the approved fixed Demand/Supply pilot.
3. Validate one fully authored Hindi *Repo Rate and EMI* lesson against RBI reading sources; build separate **Long (~1,408 words), Medium (~536 words), Shorts (~108 words), Community Post (~77 words)** drafts. Word counts are whitespace approximations; verify delivery length from actual audio.
4. Produce pinned local Host V10 narration WAV clips for requested video formats, with per-chunk timing, no eSpeak/paid model fallback and no approved voice reference mutation.
5. Render dynamic, topic-specific scenes and assemble technical-review H264/AAC MP4s, Hindi captions, thumbnails, scene PNGs and a detailed private report. Formats run in the requested order, *short before medium before long*. A failed stage stops further work; completed outputs are write-once and may be reused on retry without overwriting.
6. Preserve all pending review gates: narration naturalness, correct Hindi glyphs, animation movement, factual claim inventory, technical/educational quality, media rights and human approval. Neither a source URL nor an offline test is an independent fact-check. No video or community post is auto-scheduled or uploaded.

## One-shot runtime

From the root of the installed Termux project, after successful safe installation:

\`\`\`bash
DVE_V4_REVIEW_BATCH_ENABLED=true \
  node scripts/v4-one-shot-review.js --formats=short,medium,long
\`\`\`

Before running, ensure adequate charge, thermal headroom and free device space; Medium/Long rendering can consume significant CPU, RAM, storage and battery. The script checks minimum free disk at each format, but cannot independently guarantee Android thermal safety.

A single-format diagnostic run (opt-in) may instead use \`--formats=short\`. Never manually set \`DVE_V4_NEW_VIDEO_ENABLED\` or \`DVE_V4_NEW_VOICE_ENABLED\` for this batch; it calls isolated reviewed functions directly and does not touch production scheduler gates.

The input is \`examples/v4-repo-rate-emi-2026.lesson.json\` and the write-once draft root is \`data/v4-course-drafts/repo-rate-emi-v4-review-2026/\`. Progress reports are \`data/v4-review-reports/run-*/report.json\`. A render failure leaves a hidden \`.building-*\`, \`.voice-building-*\` or \`.video-building-*\` diagnostic directory untouched. Never run broad cleanup, reset, or overwrite commands. The separate successful \`host-v10/\` and \`v4-video/\` directories, once created, remain immutable.

The sample lesson's official source URLs are **references awaiting independent editorial confirmation**, not auto-approved claims or real-time rate statistics. In particular, the user should not assume any specific policy repo rate or that every EMI changes immediately. Recorded sources:
- RBI Monetary Policy Instruments, \`https://www.rbi.org.in/scripts/FS_Overview.aspx?fn=2752\`.
- RBI loan interest/EMI FAQ, \`https://www.rbi.org.in/Scripts/bs_viewcontent.aspx?Id=624\`.
- RBI Bulletin on lending-rate transmission (October 23, 2026), \`https://rbi.org.in/Scripts/BS_ViewBulletin.aspx?Id=24517\`.

These sources support conceptual explanations, not a claim that scripts have been fully verified. The video drafts retain \`publishingAuthorized:false\`, \`autoUpload:false\`, academic/voice review requirements.

## What is not solved by one test

Professional-quality voice and animation cannot be inferred from node tests or FFprobe alone. The earlier pilot was rejected as robotic; the new dynamic composer still needs on-device visual inspection, and generic sans-serif needs a Hindi glyph QA. Publishing, automatic trend research, official claim attestations, overnight scheduler, daily community API posting, and production alerting require separate verified workflows and cannot ethically or technically be declared complete just because one local draft renders.

The user asked for daily Long, Medium, Shorts and Community Posts at zero paid API cost. This batch creates **one draft set** without paid APIs, and keeps auto-publishing blocked while the underlying quality gate is unresolved.
