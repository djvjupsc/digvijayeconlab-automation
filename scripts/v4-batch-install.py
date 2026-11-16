#!/usr/bin/env python3
"""Pinned Android Termux V4 update + offline tests + opt-in review batch.

This installer is run only after its own exact Git blob SHA is checked by the
calling shell. No git pull/reset, no broad staging, no DB/publish/scheduler.
Network is used only to fetch pinned public/private GitHub repository file
contents through the user's already connected gh CLI.
"""
from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path.home() / "digvijayeconlab-automation"
BACKUP_ROOT = ROOT / ".v4-safe-backups"
REPOSITORY = "djvjupsc/digvijayeconlab-automation"

# (current-owner-device SHA, desired-main SHA), in Git's blob format.
# None = new file, requires absent target (or exact already-installed desired hash).
FILES = {
    "utils/v4-hyperframes-lint.js": (
        None, "592ca422b31da8629ec3d47832eca063445da61b"
    ),
    "test/v4-hyperframes-lint.test.js": (
        None, "a898a6f6934eed5b686281cb8b0e178b732e2d1a"
    ),
    "scripts/v4-generic-scene-smoke.js": (
        "4950dd1f5f51b292701b8c558518c8e409021bce",
        "6dd74328e63ac705488db92f284b81f346579788"
    ),
    "utils/v4-offline-course-renderer.js": (
        "e7e8b7c1aa843b7701d5a60cd31c572b30e79069",
        "7802968bd1f99134226e7f6c85900ff2c194a628"
    ),
    "utils/v4-host-v10-voice-queue.js": (
        "64d31c3fc58c0f0b75382718d20435b0bdf21f5b",
        "6c35396bb9c9159ffcc170a3a5b2b03b60f868b1"
    ),
    "test/v4-host-v10-voice-queue.test.js": (
        "41d6746c641f93b34f3e5ab3eb694f8532a7e881",
        "0cbc2fc28b60a873375a577858f6ee41ab2ec010"
    ),
    "examples/v4-repo-rate-emi-2026.lesson.json": (
        None, "ce9509b8a58fa8550593687a780929b3c1af5d5f"
    ),
    "scripts/v4-one-shot-review.js": (
        None, "26ab9d9aceaa1bda11756f69f832da4b971801fd"
    ),
    "test/v4-repo-rate-lesson.test.js": (
        None, "2a2f08bc1319cfda6968c59fd314b33e893ecb7b"
    ),
    "test/v4-one-shot-review.test.js": (
        None, "78b9df4daa5037226e1e3372e07b6c51193328c1"
    ),
}
CHECK_SCRIPTS = [
    "utils/v4-hyperframes-lint.js",
    "utils/v4-offline-course-renderer.js",
    "utils/v4-host-v10-voice-queue.js",
    "utils/v4-generic-scene-html.js",
    "scripts/v4-generic-scene-smoke.js",
    "scripts/v4-one-shot-review.js",
]
TEST_FILES = [
    "test/v4-offline-course-pack.test.js",
    "test/v4-generic-scene-html.test.js",
    "test/v4-host-v10-voice-queue.test.js",
    "test/v4-offline-course-renderer.test.js",
    "test/v4-generic-scene-smoke.test.js",
    "test/v4-hyperframes-lint.test.js",
    "test/v4-repo-rate-lesson.test.js",
    "test/v4-one-shot-review.test.js",
]


def blob_sha(data: bytes) -> str:
    prefix = b"blob " + str(len(data)).encode("ascii") + b"\x00"
    return hashlib.sha1(prefix + data).hexdigest()


def fail(message: str) -> None:
    raise RuntimeError("V4_BATCH_INSTALL: " + message)


def safe_dir(directory: Path) -> None:
    if not directory.is_dir() or directory.is_symlink():
        fail("unsafe directory: " + str(directory))


def local_state(target: Path, old: str | None, new: str) -> str:
    if target.is_symlink():
        fail("symlink target: " + str(target))
    if not target.exists():
        if old is None:
            return "new"
        fail("existing file missing: " + str(target))
    if not target.is_file():
        fail("target is not a file: " + str(target))
    current = blob_sha(target.read_bytes())
    if current == new:
        return "installed"
    if old is not None and current == old:
        return "update"
    fail("local untracked modifications: " + str(target))
    raise AssertionError("unreachable")


def fetch_source(relative: str, new_sha: str) -> bytes:
    if relative.startswith("/") or ".." in Path(relative).parts:
        fail("unsafe relative filename")
    try:
        result = subprocess.run(
            [
                "gh", "api",
                "repos/" + REPOSITORY + "/contents/" + relative,
                "--jq", ".content",
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=True,
        )
        raw = base64.b64decode("".join(result.stdout.split()), validate=True)
    except (subprocess.CalledProcessError, OSError, ValueError) as exc:
        fail("GitHub fetch failed for " + relative + ": " + type(exc).__name__)
    if blob_sha(raw) != new_sha:
        fail("GitHub source hash mismatch: " + relative)
    return raw


def atomic_write(target: Path, data: bytes) -> None:
    fd, temp_name = tempfile.mkstemp(prefix=".v4-install-", dir=target.parent)
    temp = Path(temp_name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)


def run_tests() -> None:
    print("===== V4 OFFLINE CHECKS =====", flush=True)
    for name in CHECK_SCRIPTS:
        subprocess.run(["node", "--check", name], cwd=ROOT, check=True, timeout=45)
    subprocess.run(
        ["node", "--test", *TEST_FILES],
        cwd=ROOT, check=True, timeout=180,
    )
    print("SYNTAX + OFFLINE TESTS: PASS", flush=True)


def install() -> Path | None:
    safe_dir(ROOT)
    safe_dir(BACKUP_ROOT)
    # Verify *every* GitHub blob BEFORE creating any directory or file.
    verified = {
        relative: fetch_source(relative, new)
        for relative, (_, new) in FILES.items()
    }
    print("ALL TEN PINNED GITHUB BLOBS: VERIFIED", flush=True)

    for relative, (old, new) in FILES.items():
        parent = ROOT / Path(relative).parent
        if not parent.exists() and relative.startswith("examples/"):
            continue  # create it after all prechecks complete
        safe_dir(parent)
        local_state(ROOT / relative, old, new)

    created_directory: Path | None = None
    backup: Path | None = None
    changed: list[tuple[str, str]] = []

    try:
        example_parent = ROOT / "examples"
        if not example_parent.exists():
            example_parent.mkdir(mode=0o700)
            created_directory = example_parent
        safe_dir(example_parent)

        active = []
        for relative, (old, new) in FILES.items():
            target = ROOT / relative
            state = local_state(target, old, new)
            if state != "installed":
                active.append((relative, state))

        if active:
            backup = Path(tempfile.mkdtemp(prefix="v4-batch-", dir=BACKUP_ROOT))
            # Back up all touched existing files in an isolated directory.
            for relative, state in active:
                if state == "update":
                    shutil.copy2(ROOT / relative, backup / Path(relative).name)

            for relative, state in active:
                _, new = FILES[relative]
                target = ROOT / relative
                if local_state(target, FILES[relative][0], new) != state:
                    fail("concurrent modification: " + relative)
                data = verified[relative]
                if state == "new":
                    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
                    if hasattr(os, "O_NOFOLLOW"):
                        flags |= os.O_NOFOLLOW
                    fd = os.open(str(target), flags, 0o600)
                    changed.append((relative, state))
                    with os.fdopen(fd, "wb") as stream:
                        stream.write(data)
                        stream.flush()
                        os.fsync(stream.fileno())
                else:
                    changed.append((relative, state))
                    atomic_write(target, data)
                if blob_sha(target.read_bytes()) != new:
                    fail("installed hash mismatch: " + relative)
                print("INSTALLED:", relative, flush=True)
        else:
            print("FILES ALREADY VERIFIED: PASS", flush=True)

        run_tests()
        print("INSTALL + REGRESSION: PASS", flush=True)
        if backup:
            print("ROLLBACK BACKUP:", str(backup), flush=True)
        return backup
    except Exception:
        if backup:
            for relative, state in reversed(changed):
                target = ROOT / relative
                if state == "update":
                    saved = backup / Path(relative).name
                    if saved.is_file() and not saved.is_symlink():
                        atomic_write(target, saved.read_bytes())
                        print("RESTORED:", relative, flush=True)
                elif target.is_file() and not target.is_symlink():
                    if blob_sha(target.read_bytes()) == FILES[relative][1]:
                        target.unlink()
                        print("REVERTED NEW FILE:", relative, flush=True)
        if created_directory:
            try:
                created_directory.rmdir()
            except OSError:
                pass
        raise


def main() -> int:
    if sys.argv[1:] not in [[], ["--install-only"]]:
        fail("Usage: python3 v4-batch-install.py [--install-only]")
    print("===== V4 ONE-SHOT SAFE AND PINNED HANDOFF =====", flush=True)
    install()
    if sys.argv[1:] == ["--install-only"]:
        print("INSTALL-ONLY: no TTS or video attempted")
        return 0

    print("===== OFFLINE SCENE + FOUR-FORMAT REVIEW PRODUCTION =====", flush=True)
    print("All outputs remain private and require academic/voice/video review.", flush=True)
    env = os.environ.copy()
    env["DVE_V4_REVIEW_BATCH_ENABLED"] = "true"
    env["DVE_V4_SCENE_SMOKE_ENABLED"] = "true"
    # This is deliberately foreground/synchronous. We must not imply that
    # a future/background job will finish after the assistant's response.
    result = subprocess.run(
        [
            "node", "scripts/v4-one-shot-review.js",
            "--formats=short,medium,long"
        ],
        cwd=ROOT,
        env=env,
        check=False,
    )
    if result.returncode != 0:
        print("REVIEW BATCH BLOCKED; see data/v4-review-reports/run-*/report.json.",
              flush=True)
        return result.returncode or 1
    print("ALL THREE REVIEW DRAFTS TECHNICALLY COMPLETE; PUBLICATION BLOCKED.",
          flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("STOP:", str(exc), file=sys.stderr, flush=True)
        sys.exit(1)
