# V4 multi-topic Host V10 + scene-based renderer — review-only, not deployed

## Scope

This is **isolated** from the production server, automatic scheduler, fixed Demand/Supply 10-second pilot and YouTube publishing routes.

It consumes the source-grounded lesson-pack JSON storyboards produced by \`scripts/v4-offline-course-pack.js\` and, when **explicitly opted in on an Android test device**, attempts to produce:

- One \`host-v10/\` folder per chosen Long/Medium/Short format: bounded Jugnu Pocket TTS scene WAVs, per-chunk alignment metadata and a review-only manifest.
- One \`v4-video/\` folder per chosen format: custom topic-specific GSAP + SVG graph scenes rendered offline with installed HyperFrames/Chromium, assembled H.264/AAC MP4, one preview per scene, thumbnail, chunk-aligned Hindi SRT and another review-only manifest.

**Nothing in this PR has yet been rendered on Android**, and these components do not claim media quality, official fact verification, rights approval, permission to publish or reliable daily scheduling.

## What it protects

- Only \`long\`, \`medium\` and \`short\` typed storyboards with correct Hindi script-length budgets, Host V10 queue and explicit \`publishingAuthorized:false\` are accepted.
- Existing, owner-reviewed local **Host V10 reference audio** must match the pinned SHA-256: \`853e490009a5f5964ea402a8bbf8cfb3b58796596b13b296b5cd19235dd3c9a4\`.
- Local Jugnu worker must match SHA-256 \`9f5ebd741189c4320cb9c4f6109142da1bea626024dfb3370b711996df0b0a7b\` (owner's reported 2026-11-16 audit).
- Pocket TTS worker receives only local stdin JSON \`text\`, fresh \`output_path\` and the pinned \`reference_audio\`; model and assets are checked by the worker's own offline guard. It produces 24kHz WAV. No eSpeak or paid API fallback.
- A fresh folder is required for every job. The scripts explicitly refuse overwriting previous \`host-v10/\` or \`v4-video/\` outputs. Error output stays isolated in private diagnostic staging folders.
- The custom HTML is generated from **typed topic visuals** (\`curve\`, \`curve-pair\`, \`concept-map\`, \`timeline\`, \`flow\`, \`comparison\`, \`equation\`). HTML text is escaped and diagram points are constrained. A requested equilibrium marker must actually lie on all supplied curves, otherwise generation halts.
- All video and voice output manifests continue to mark \`publishingAuthorized:false\`, \`autoUpload:false\` and review requirements. No route is added to server \`index.js\`.

## Installation/operation gate

Before executing any voice or render command on the owner's phone:

1. Install exact GitHub-committed new JS files with blob verification, without a broad \`git pull\`, reset or overwrite. Run the new and existing offline tests.
2. Inspect full current Jugnu runtime, HyperFrames project configuration, local voice library rights and resource budgets. Ensure the main scheduler remains paused.
3. Create **a new, independently sourced economics lesson-pack input** and run the builder. DO NOT run these commands on the fixed \`demand_supply_v1\` pilot. The sample test fixtures use \`example.org\` and are **not** real supported factual materials.
4. Verify device audio/naturalness and render **Shorts first** before Medium and Long. Never infer full production readiness from a successful sample.

### Host V10 scene voice (manual, opt-in)
\`\`\`bash
DVE_V4_NEW_VOICE_ENABLED=true node scripts/v4-render-host-v10.js <topic-id> short
\`\`\`
This is an explicit **model-inference action** and could take substantial local memory and time. Do not run without inspecting the new pack, user authorization and Android thermal/memory limits.

### Scene-based MP4 (manual, opt-in, after voice)
\`\`\`bash
DVE_V4_NEW_VIDEO_ENABLED=true node scripts/v4-render-course-video.js <topic-id> short
\`\`\`
Runs Chromium/HyperFrames/FFmpeg locally. Dynamic scene timeline compatibility and performance are **unverified on the actual phone**. Do not automatically enable either command in the scheduler until smoke tests and full review pass.

## Known limitations / acceptance criteria

- Current \`v4-generic-scene-html.js\` is a first-pass graph animation compositor, **not** the owner's final polished professional animation quality. It must be evaluated on actual Chrome playback and revised based on visuals. Graph labels must be checked for overlapping, axis units and substantive economics correctness. It does not independently verify claim accuracy.
- Long scene TTS chunks may sound unnatural at boundaries. Listen to the entire output; never silently substitute another voice. The phone may have RAM/thermal limits. Short first.
- Current scene output is intended for HyperFrames, but the source template hardcoded a fixed GSAP timeline. Device tests must verify \`window.__timelines.main\` and HyperFrames render/lint from the generated project. Failures require bounded code fixes, not skipping quality gates.
- Generated SRT timing is based on returned chunk durations and source WAV duration. Check by listening; audio codec/metadata validation is insufficient.
- The earlier pinned fixed Demand/Supply pilot remains the only sample with **completed Android media QA**. These new modules are still awaiting a real multi-topic integration test.
- No automatic topic research, verified script drafting, channel calendar, daily 6 AM scheduler, community post API publishing, shorts upload or background service activation is included.

The user accepts only natural Hindi narration, presenter-free motion graphics and zero-paid-provider fallbacks. Production/publishing must remain blocked until every stage passes locally.