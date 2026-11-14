# GitHub CPU Hindi narration + FFmpeg preview pilot

This is a **standalone cloud-only preview workflow**, not a production publishing pipeline or a Termux remote-control mechanism.

## What it does
- The GitHub Actions workflow `.github/workflows/jugnu-cloud-preview.yml` runs on a standard Linux GitHub runner.
- It downloads the public **Saryps Labs Hindi Pocket TTS** research checkpoint and uses a **public default reference voice**, generating a WAV for each scene.
- It creates 720×1280 vertical MP4, scene-level SRT captions, an output manifest, and WAV files with FFmpeg and Pillow.
- All media is stored as a **7-day GitHub Actions artifact**, never committed to source control.
- It has **no YouTube credentials, no upload, no GitHub write token, and no paid APIs**.
- It does **not** change the restricted Termux GitHub inbox, which continues to allow only `audit`, `regression`, and `report`.

## What it does NOT do
- The GitHub runner does **not** have the phone's custom **Jugnu** code, weights or `host-custom`/`cohost-custom` voice profiles. This pilot uses the same Pocket TTS family but it is **not the user's custom Jugnu narration**.
- It does not automatically import private reference voices or user data into this **public** repository.
- It does not fact-check scripts, establish media rights, or grant editorial/provenance approvals.
- It is not upload-ready until a person has listened, verified visuals/captions, checked facts and rights, and explicitly approved the video.

## Testing and activation
- Test branch `cloud-jugnu-ffmpeg-pilot`: a change under `cloud-render/` or to the workflow triggers a pilot run.
- After review/merge, the workflow remains available under **Actions → Hindi TTS and FFmpeg cloud preview → Run workflow**; it does not publish automatically.
- Download `hindi-tts-ffmpeg-review-*` from the workflow run's **Artifacts** section.
- Default script: `cloud-render/examples/repo-rate-hindi.json` (demo only). The build refuses generic placeholders.
- Pinned Pocket TTS Python package: `4.0.1`; pinned Hindi config revision: `dbaa326069d20bfbdaeb625613736773741a24ea` (weights referenced inside model config are supplied by the model author).
- This proof-of-concept renders simple original graphics; it is **not** claimed to have professional natural motion or studio-quality voice.

## Next step for real Jugnu
Port the user's **actual** reviewed Jugnu worker code on a separate branch and provide its compatible model config + reference voices through a **private, permission-controlled** asset repository or encrypted artifact pipeline (never a public commit). Confirm license and speaker consent. Add cloud checks for placeholder scripts, clip synchronization, captions, claim inventory and editorial approvals before considering auto-publishing. Start by testing generated WAV and MP4 quality.

Source/attribution: https://github.com/kyutai-labs/pocket-tts and https://huggingface.co/saryps-labs/pocket-tts-hindi (public Hindi model weights reportedly CC BY 4.0; see model's NOTICE and license information).
