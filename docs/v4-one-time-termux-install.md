# One-time, safe Termux installation of V4 Studio

This procedure is intentionally **not an unrestricted remote command bridge**. It does not weaken the private `termux-automation-control` allowlist. Installation requires the Android device owner to run an explicit, pinned command **once** in Termux. After that, the V4 Studio is part of the existing local Node dashboard whenever the app is running; this alone does not make the entire phone or production pipeline permanently online.

## Source

- Installer: `scripts/v4-safe-deploy.py`
- Installer Git blob SHA-1: `f54f99e722d7c73133db8b8deb8a3d9670cb9f96`
- GitHub repository: `djvjupsc/digvijayeconlab-automation`

## One-time operator action (only after reviewing and authorizing local changes)

The owner must have `gh` authenticated to their GitHub repo and `git`, `python3`, and `node` on Termux. Run the following as a **single command**, from any directory:

```bash
(
set -euo pipefail
umask 077
installer="$(mktemp)"
trap 'rm -f "$installer"' EXIT
gh api repos/djvjupsc/digvijayeconlab-automation/contents/scripts/v4-safe-deploy.py --jq .content | base64 -d > "$installer"
test "$(git hash-object "$installer")" = "f54f99e722d7c73133db8b8deb8a3d9670cb9f96"
python3 "$installer" --install
)
```

The install operation:
1. Checks the **exact** local repo path and GitHub origin; preserves unrelated files, uncommitted Git changes, production database, voice references and approved videos.
2. Fetches GitHub main without checkout/reset and imports only seven pinned V4 source/test blobs. Every source Git blob SHA is checked against a hard-coded approved manifest.
3. Tests the imported offline Node modules and patched entrypoints in a private temporary directory **before** touching the app.
4. Rejects a divergent V4 file, symlink, hardlink, unexpected `setupAPI` structure or unknown sidebar. It refuses to overwrite conflicts.
5. Makes private `.v4-safe-backups/` copies of original `index.js` and `dashboard/index.html`; adds only three mount calls and one navigation link if absent. Installation is rollback-aware.
6. Runs offline Node tests after installation; does **not** start the main server, restart Termux, create videos, call paid APIs, publish YouTube content or enable remote execution.
7. Leaves `DVE_V4_PILOT_ENABLED` **false by default**. Device-side opt-in may be considered only after the owner validates setup, media/voice quality and current main scheduler/publishing settings.

**If the script prints STOP, do not force a Git reset or overwrite files.** The correct next step is to review the failed compatibility check and reconcile the exact local difference. The local repository is intentionally divergent from GitHub; failure can be the correct safe outcome.

## Expected URL after authorized deployment and normal server start/restart

`http://127.0.0.1:3456/v4-studio.html`

The Studio will show the existing production pipeline's MP4, thumbnail, scene and Short previews, plus read-only V4 archive and dependency health. The fixed Demand & Supply pilot is a manual, review-only, opt-in rendering proof, not an arbitrary-topic daily generator.

## Automatic startup: separate owner device permission required

GitHub cannot operate `127.0.0.1` on the Android phone. A process supervisor or Termux:Boot integration requires device-side installation, Android battery and background permissions, and an assessment of the existing app's scheduler. Installing a boot hook that launches the current application **before** reviewing its possible provider and publish-queue actions could cause accidental provider charges or scheduled uploads; this installer intentionally does not do that.

Do not advertise zero-command always-on operation until an authorized and tested on-device service supervisor is active. In particular, the existing bridge remains **audit/regression/report only** and must not be used to deliver arbitrary commands or code.

## Acceptance conditions remaining

- On-device syntax/tests and actual browser smoke test `/v4-studio.html`
- Real local run for pinned Demand & Supply pilot (video/voice/thumbnail/scenes/captions)
- New-topic animation and TTS quality-gated offline generation
- Free-only, idempotent daily long/medium/Short/community workflows
- Stable on-device supervisor, opt-in permission and safe stop
- Explicit claim-inventory, rights, voice quality and PUBLIC upload approval

Until then, GitHub code changes alone are **not** proof of completed autonomous video production.
