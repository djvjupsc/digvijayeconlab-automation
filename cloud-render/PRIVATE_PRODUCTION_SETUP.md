# DigvijayEconLab — PRIVATE production workspace (GUI-only setup)

This guide intentionally contains **no API keys, speaker recordings, model weights, or YouTube tokens**. The public repo is a code prototype. Use a separate **private** repo for unreleased videos and consented voice assets.

## 1. Create the production workspace in GitHub (one-time account-owner action)

Use **https://github.com/new/import** (GitHub → + → Import repository).

| Field | Value |
|---|---|
| Clone URL / old repository | `https://github.com/djvjupsc/digvijayeconlab-automation.git` |
| Owner | `djvjupsc` |
| Repository name | `digvijayeconlab-private-production` |
| Visibility | **Private (mandatory)** |

Select **Begin import**, confirm that the repo visibly says **Private**, and grant the connected GitHub app access to the **new repository** if it is not already visible. This is not a fork of the restricted `termux-automation-control` repository; that repository must remain limited to its existing audit/regression/report policy.

**Import limitation**: GitHub Importer brings code and commit history; it does not transfer encrypted secrets, Actions artifacts, voice recordings, YouTube OAuth, approval records, or Android Termux files. Do not accidentally choose *Public*.

## 2. Enforce review and privacy before creating any video

In new private repository → Settings → Environments:

- Create `youtube-private-upload`.
- Add required human reviewers with appropriate permissions.
- Do not add secrets until a review of repo settings, collaborators, and branch protections.

Protect `main` and keep the production uploader `workflow_dispatch`-only. Never edit the GitHub workflow to auto-publish on `push` or `schedule`.

## 3. Actual **Jugnu**: original Android files are required

The cloud preview currently synthesizes speech using **Saryps Labs Hindi Pocket TTS**, optionally with a private WAV prompt. That is **not the Android custom Jugnu engine**, even if the prompt resembles the Host voice.

Migrating *real Jugnu* requires:
- A reviewed copy of the on-device `scripts/jugnu_tts_worker.py`, any wrapper needed on Linux, and the exact model/config/tokenizer revision.
- Consented `host-custom` and `cohost-custom` reference recordings or their documented compatible profiles, with correct checksums.
- Speaker permission and license review, including whether model weights may be used on GitHub-hosted runners.
- A Linux test comparing expected spoken text and audio output from the **actual worker**, not just a generic Pocket TTS voice prompt.
- Storage in private, access-controlled assets (never this public repository or publicly accessible workflow artifacts).

Do not upload a speaker's voice or expose private Hugging Face tokens in a chat. The current private-reference workflow accepts a WAV/FLAC voice prompt but does **not** load the custom Android Jugnu state; it must not be described as the final Jugnu migration.

## 4. YouTube authorization in GitHub UI, not in chat

Once the private repo is confirmed, configure the GitHub environment `youtube-private-upload` and **encrypted environment secrets**:

`YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`, `YT_EXPECTED_CHANNEL_ID`, `YT_AUDIENCE`.

OAuth credentials must originate from the channel owner's trusted Google consent flow. Select `YT_AUDIENCE` appropriately as `made_for_kids` or `not_made_for_kids` (never guess). Keep the upload environment reviewer-protected. Do not send passwords or refresh tokens to anyone in chat.

The existing release workflow requires a successful trusted production run on `main`, correct video SHA256, a human-supplied audio/visual/fact/rights review statement, a specific review note, and the expected YouTube channel. Upload privacy is hardcoded to `private`; publication to the public is **not** part of this setup.

## 5. Production acceptance criteria

- No generic English filler, fabricated statistic, silent scenes, missing audio, absent source or unsupported factual claims.
- Actual Jugnu Host/Cohost references and consent, language pronunciation check, scene-level narration audit.
- Creative review of **the actual MP4** at full duration, fact check against the correct official RBI URLs, and subtitle timing review (word-count estimates alone are not accurate forced alignment).
- Independent H.264/AAC decode test, hash-locked video + corresponding thumbnail/SRT/metadata, rights declaration.
- Only after reviewer approval and live OAuth/channel verification: **PRIVATE** upload. Report YouTube video ID and privacy result. No claim of uploading without a confirmed receipt.

## Current status

- Public demo GitHub render and technical checks: working.
- New private repository: **NOT YET CREATED**.
- Original Jugnu custom worker and voices: **NOT AVAILABLE TO THE GITHUB RUNNER**.
- Secure Google OAuth for channel: **NOT CONNECTED**.
- Creative human approval: **NOT COMPLETED**.
- YouTube video upload: **NOT ATTEMPTED**.

The GitHub connector in this chat supports reading and writing files **inside existing repositories** but cannot create a repository, change its visibility, configure Actions environment secrets or perform the Google OAuth consent. These are one-time account-owner UI steps and must not be simulated.
