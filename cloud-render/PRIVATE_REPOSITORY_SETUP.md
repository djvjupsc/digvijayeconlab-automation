# Private production deployment — no Termux commands

The public `djvjupsc/digvijayeconlab-automation` repository contains **source code only**. Do not upload personal custom voice references, speaker recordings, Google refresh tokens, video assets, or unpublished private scripts to it.

## One-time GitHub UI action (cannot be performed by the installed GitHub connector)

1. Open GitHub's **Import a repository** page: https://github.com/new/import
2. Source repository URL: `https://github.com/djvjupsc/digvijayeconlab-automation.git`
3. Owner: `djvjupsc`
4. New repository name: `digvijayeconlab-private-production`
5. **Visibility: Private**. Double-check the private badge **before** any voice or YouTube credential setup.
6. Select **Begin import**. An import includes the source Git history but does not transfer repository Actions secrets or connected device files.
7. In GitHub settings for the new repository, enable GitHub Actions, then re-authorize the GitHub app connection for this new private repo if ChatGPT cannot see it.

**Important:** Leave `djvjupsc/termux-automation-control` alone. It is a separate restricted control bridge and must never be used for production or upload tasks.

## One-time credentials in the private repository (GitHub UI only)

Go to **Settings → Secrets and variables → Actions → New repository secret**. Do **not** paste the values in ChatGPT, issues, Git commits or workflow files.

For a private voice reference on the *public Hindi Pocket TTS model*:
- `HF_TOKEN` (read-only token)
- `PRIVATE_VOICE_HF_REPO` (the owner's private Hugging Face model repository)
- `PRIVATE_VOICE_HF_FILE` (path of consented .wav or .flac)
- `PRIVATE_VOICE_HF_REV` (immutable commit SHA)
- `PRIVATE_VOICE_SHA256` (expected file checksum)
- `VOICE_CONSENT_CONFIRMED` (`true` **only** if the speaker authorized voice synthesis)

**This is NOT yet the original Jugnu worker.** The phone's custom Pocket TTS Jugnu worker, checkpoint/model weights, and Host/Cohost profiles must separately be migrated from the phone using a secure consented transfer. The original Android-side files are not accessible from this GitHub app, and do not exist in this public source repository. It is **not** safe to simply upload the 380 MB model weights and personal speaker clips into public Git.

For manual **Private YouTube upload**, supply these private-repository Actions secrets:
- `YT_APPROVED_GITHUB_ACTOR` — exact GitHub login allowed to trigger uploads (example: `djvjupsc`; verify the actual login)
- `YT_CLIENT_ID`
- `YT_CLIENT_SECRET`
- `YT_REFRESH_TOKEN` — OAuth refresh token granted for YouTube upload and read-only channel validation
- `YT_EXPECTED_CHANNEL_ID` — actual verified YouTube channel ID
- `YT_AUDIENCE` — `made_for_kids` or `not_made_for_kids`, based on your actual channel/content

Use your own Google OAuth authorization flow, not a friend's token or shared login. Approval does not grant permission to fabricate human reviews. The private uploader requires a successful main-branch producer run, exact SHA256 of video, verified technical report, actual consented private narrator (not demo voice), human review phrase + detailed note, and a channel-ID match.

### GitHub Free compatibility

The upload workflow intentionally uses **repository Actions secrets**, not an `environment:` name, because GitHub Free private repositories may not support environment secrets/required reviewers. The upload workflow is `workflow_dispatch` only, and checks `YT_APPROVED_GITHUB_ACTOR`. There is no automatic publishing on a push or schedule.

### Operational limits

- Only `private_hindi_prompt` can use a consented private voice reference; it still uses the public Hindi Pocket TTS model. The authentic phone-based Jugnu model worker is a separate migration task.
- A technical pass is not professional editorial sign-off. Check complete narration, visuals, captions, rights and factual claims; correct and rerender when needed.
- YouTube OAuth and voice transfers require the account holder's explicit authorization. This system cannot create credentials itself.
- **No upload runs or paid APIs have been activated by these instructions.**
