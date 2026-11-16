# DigvijayEconLab — Local V4 Production Studio (proposed integration)

## Scope and safety

This feature branch adds a **read-only V4 artifact gallery** and a local production preview screen to the existing Node.js dashboard. It does not overwrite approved videos or reference voice files. It does not add YouTube uploads, paid API calls, remote execution, or change publishing/claim-inventory approval gates.

* Studio URL after the code is **deployed to the Android Termux checkout and the existing server restarts**: `http://127.0.0.1:3456/v4-studio.html`.
* Existing main dashboard: `http://127.0.0.1:3456/`. The sidebar has a V4 Production Studio link.
* The studio shows existing production jobs, status, video previews, thumbnails, scene assets, Short drafts and the local V4 render gallery.
* Scene/video files from the isolated V4 workspace are only streamed read-only and only to loopback requests; arbitrary path arguments, symlinks, other Downloads files, voice references, credentials and scripts are not exposed by the new gallery.
* The existing 06:00 local-time scheduler stays unchanged. It produces content only while the Node server is running, the current strategy and dependencies are ready, and the current code path succeeds.
* The preview's draft-generation button calls the preexisting `POST /generate` endpoint and requires the existing API key; it does **not** call YouTube publish-now or bypass review. It follows existing provider settings. To guarantee free-only, audit and select offline/free providers before using it.

## Demand & Supply V4 source checkpoint

The tested isolated Android build used these **local-only** files; these are NOT uploaded to a public repository:

| Component | Local relative location / identifier |
| --- | --- |
| Landscape base scene | `~/digvijayeconlab-tools/dve-style-v4-adapter/drafts/step196/index.html` |
| HTML SHA-256 | `2929374e4d4f19d2715c09492484718c7a07bc03b8f2a2aed60fb2a5098ce807` |
| Base stylesheet SHA-256 | `0dada425bac4d0df2bb61122eccb27bf4d92d01f75a41e55983266b19f36a2c4` |
| GSAP local asset SHA-256 | `92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb` |
| Protected approved Repo Rate video SHA-256 | `cf3354cb10adec2de34c0805855a9895a31c7071afd56bc27e7842453ce3c4f7` |
| Protected Host V10 reference SHA-256 | `853e490009a5f5964ea402a8bbf8cfb3b58796596b13b296b5cd19235dd3c9a4` |
| Tested final landscape output | 1920×1080, 24 fps, 10 s, H.264/AAC |
| Q* label-to-card browser-measured gap | 56.4 px |
| Published-media quality state | HUMAN REVIEW REQUIRED |

**Voice reference and generated video binaries remain local/private.** The current gallery can display known Android export names when the user has downloaded them into the phone's Downloads folder.

## What is already automatic versus not

**Already present in main application**: the daily Node scheduler, generation jobs, checkpointing, video/thumbnail/captions/scene APIs, approval and provenance requirements. This branch adds a single consolidated preview UX and an isolated V4 render gallery.

**Not yet connected**: fully automatic generation of new **concept-specific** V4 HTML/GSAP scenes from scripts, high-quality Host V10 TTS for each new lesson, style/word-budget verification, voice naturalness approval, media rights, and device-side GitHub sync. Those cannot be inferred or truthfully marked as working by a gallery. A 16:9 source video is not itself a 9:16 Short. No robotic TTS or static slideshow may silently substitute for a production voice/animation.

## One-time deployment dependency (cannot be bypassed by GitHub commits)

GitHub stores versioned source files; it does not operate the phone's `localhost`, execute the phone's Chromium, load private voice weights, or automatically update the running Termux process. The existing `djvjupsc/termux-automation-control` repository explicitly limits bridge tasks to audit/regression/report and disallows remote production execution and arbitrary code. This branch does **not** weaken that boundary. Before these changes can appear on `127.0.0.1:3456`, an authorized update of the phone's checkout and restart of its already-running Node process is required. That can be provided by a separately reviewed, owner-authorized device deployment mechanism; **none is currently enabled by this PR**.

## Next safe integration phase

1. Reconcile this branch with the phone's extensive local, uncommitted V4 changes (never overwrite the local `index.js`, `dashboard/app.js`, production database, approvals or backup files).
2. Build a manifest-driven offline renderer with template-specific diagram semantics rather than generic static slides; validate with offline test fixtures.
3. Wire the approved local Jugnu Host V10 worker via a strict protocol with natural-voice quality gates, never falling back silently to eSpeak or paid APIs.
4. Add job-level JSON manifests and per-scene preview thumbnails, then bind them to the existing pipeline's production IDs, not unmanaged shell tasks.
5. Add an owner-controlled deployment lifecycle and process supervisor to start/restart the localhost application without daily commands. Ensure phone sleep/battery settings and quota limitations are explicit.
6. Keep public publishing disabled until documented claim-inventory, rights, audio, visual and editorial approval complete.

## Offline validation

On a checkout that already has Node.js installed, the isolated gallery safety tests are in `test/v4-local-gallery.test.js`. Do not run full generation, paid provider probes or uploading as part of this change. The key invariants are no remote media access, no path traversal, no voice-reference exposure and no new publishing routes.
