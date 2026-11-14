# DigvijayEconLab — GitHub cloud production (review-first)

**Current contract:** This cloud workflow may produce a technical preview package, but cannot truthfully grant publication approval. It does not interact with the Termux SQLite database, restore its rejected projects, or bypass provenance/scene checks. The GitHub build is a separate production lineage.

## Output and controls

1. **Generate**: Actions → *Hindi TTS and FFmpeg cloud preview* → Run workflow. Select \`public_demo\` or \`private_hindi_prompt\`. This runs \`cloud-render/render.py\`, then creates the topic-specific motion explainer \`cloud-render/professional.py\`.
2. **Automatically inspect**: \`cloud-render/quality.py\` validates script specificity, source/claim inventory presence, original-art rights declaration, TTS EOS, narration RMS/clipping, vertical H.264/AAC, ffmpeg full decode, short SRT captions, runtime, thumbnail, SHA256, and explicitly unapproved metadata.
3. **Download review artifact**: Open the completed run → Artifacts → \`hindi-tts-ffmpeg-review-*\`. Includes \`professional.mp4\`, \`professional.srt\`, \`thumbnail.jpg\`, \`quality-report.json\`, \`production-report.json\`, \`youtube-metadata.json\`, \`manifest.json\` and scene WAVs. Current artifact retention is seven days.
4. **Human review**: Listen to all audio for naturalness and pronunciation, watch full video for visual quality and actual caption timing, cross-check *every* factual assertion against current RBI sources, verify rights and voice consent. Never approve based on H.264 decode alone. Fix script/audio if needed, rerender, and review the new checksum.
5. **Private upload after approval only**: Actions → *Upload personally reviewed video as PRIVATE* → Run workflow (only on main branch). Provide **source run ID, exact MP4 SHA256, the exact approval phrase specified on that screen, and a specific reviewer note**. Configure GitHub environment \`youtube-private-upload\` with required reviewers before using. The uploader reads the approved artifact, verifies its checksum + technical reports, checks actual YouTube channel ID, and forces privacy \`private\` for the upload. No auto-publish/schedule is available.

### Credential prerequisites for private YouTube upload
In **Settings → Environments → youtube-private-upload**, configure required reviewers and environment **secrets**:
- \`YT_CLIENT_ID\`, \`YT_CLIENT_SECRET\`, \`YT_REFRESH_TOKEN\` for Google OAuth. The Google authorization must cover **youtube.upload** and **youtube.readonly** scopes.
- \`YT_EXPECTED_CHANNEL_ID\` — exact YouTube channel ID you have approved.
- \`YT_AUDIENCE\` — one of \`not_made_for_kids\` or \`made_for_kids\` (set from actual audience, do not guess).

Never paste these secrets into a chat, a script file, or a commit. Until all secrets and required reviewers are configured, uploads remain blocked. Merely creating this workflow performs **no upload**.

### Private consented Hindi voice
GitHub Actions on the protected \`main\` branch supports \`private_hindi_prompt\` mode. Store the original, **consented** 16-bit PCM WAV/FLAC prompt in a *private* Hugging Face model repository with restricted access. Configure GitHub repository **Actions secrets**:

- \`HF_TOKEN\` with private repo **read** access only
- \`PRIVATE_VOICE_HF_REPO\` — private HF repo ID
- \`PRIVATE_VOICE_HF_FILE\` — exact path to the WAV/FLAC
- \`PRIVATE_VOICE_HF_REV\` — immutable revision (commit ID)
- \`PRIVATE_VOICE_SHA256\` — expected hash of reference audio
- \`VOICE_CONSENT_CONFIRMED\` — value \`true\` only after actual speaker permission

A failed consent check, hash mismatch, absent secret, or unsupported file type **blocks** generation. Private audio is never included in review artifacts. The repository is currently **public**: generated unreleased artwork/scripts/artifacts should be treated as potentially visible to others. For confidential production, move this workflow into a **private repo with protected branches/environment** before using private voice assets or unreleased content. Never place voice WAVs, Jugnu profile states, weights or OAuth tokens in the public repo.

**Important:** The protected mode uses a private speaker audio prompt with the public Hindi Pocket TTS model. It is **not** a port of the phone's existing custom Jugnu host/cohost worker, weights or profile states. That exact migration requires the original Android-side code and appropriately permissioned original voice assets, not available to this GitHub runner.

### Quality limitations to fix before publishing
- The first demo uses self-produced animated vector illustrations, not filmed b-roll or photorealistic AI shots. Do not call it a realistic human-footage video.
- Captions are *estimated from narration segments and pacing*; no automatic word-level forced alignment or human-verified synchronization is claimed. Listen and correct them before approval.
- Pocket TTS Hindi is an early **research** model; model authors caution about code-switching, pronunciation and EOS. All voice output needs a full listening review.
- Voice reference, factual claim and illustration provenance must be verified by a human. Storing links does not establish that each claim is true.
- Your local Dashboard's approval gates and status **are not updated** by cloud production. Never manually edit rejected status or claim inventory as a shortcut.
- No music or third-party visuals are used by default; music, imagery or stock footage later require explicit licensing and attribution inventory.

### Security and operating costs
GitHub-hosted Linux runners use hosted execution resources and standard GitHub Actions limits; do not assume unlimited free minutes. Current tests run with CPU-only dependencies; no paid LLM/image/TTS APIs. Repositories with public Actions logs/artifacts should not carry unpublished private client data.

### Factual source links for first RBI episode
- RBI FAQ on floating-rate EMI loan reset (updated Oct 1 2025): https://old.rbi.org.in/commonman/english/scripts/FAQs.aspx?Id=3687
- RBI master directions on lending-rate external benchmark resets: https://rbi.org.in/scripts/BS_ViewMasDirections.aspx?id=13072

### Test strategy
On a separate branch run \`python -m unittest discover -s cloud-render/tests -p "test_*.py"\` and run the Actions production pilot before merging. Once on main, manual workflow dispatch is available. Check the GitHub Actions logs and downloaded artifact; fail loudly on missing media or reviewer attestations. Never auto-enable YouTube upload on push.
