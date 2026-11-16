#!/usr/bin/env python3
"""One-time, conflict-aware Android Termux Studio installer.

This never executes downloaded code, changes the production database,
starts/stops processes, alters voice files or authorizes YouTube publishing.
All GitHub source blobs are pinned; only two bounded app entrypoint edits
are permitted, after private backups and offline tests.
"""
from __future__ import annotations
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

REPO = Path.home() / "digvijayeconlab-automation"
EXPECTED_REMOTE = {
    "https://github.com/djvjupsc/digvijayeconlab-automation",
    "https://github.com/djvjupsc/digvijayeconlab-automation.git",
    "git@github.com:djvjupsc/digvijayeconlab-automation",
    "git@github.com:djvjupsc/digvijayeconlab-automation.git",
}
BLOBS = {
    "dashboard/v4-studio.html": "9c1b13ba0df68b08264330b7118ff7caf6ff27b7",
    "utils/v4-local-gallery.js": "d581493827e8cdbbd26705d69240524605dd7db9",
    "utils/v4-local-readiness.js": "5afadd35953cf50a234274d1174be56e1ae8f46d",
    "utils/v4-demand-supply-pilot.js": "4aeab8a0ee51291b1ccc525499bdefad1e5cf70c",
    "test/v4-local-gallery.test.js": "bf3641c04b68b6879b7573037665100196a44e81",
    "test/v4-local-readiness.test.js": "18cdc596ce1d4523fb93e293abe765590462d89d",
    "test/v4-demand-supply-pilot.test.js": "dff4e74549fc774fb70a0d66b221aad516ea4111",
}
STUDIO_MOUNTS = (
    "    require('./utils/v4-local-gallery').mountLocalV4Gallery(this.app);",
    "    require('./utils/v4-local-readiness').mountLocalV4Readiness(this.app);",
    "    require('./utils/v4-demand-supply-pilot').mountV4Pilot(this.app, this.requireAPIKey());",
)
APP_ANCHOR = "    this.app.use(express.static(path.join(__dirname, 'dashboard')));"
SIDEBAR_ANCHOR = '        <button class="nav-item" data-view="calendar"'
SIDEBAR_LINK = '        <a class="nav-item" href="/v4-studio.html" style="display:block;text-decoration:none;color:inherit;padding:12px 16px">🎬 V4 Production Studio</a>'

def stop(message: str) -> None:
    raise RuntimeError("STOP: " + message)

def call(*args: str, cwd: Path = REPO, input_bytes: bytes | None = None, timeout: int = 90):
    result = subprocess.run(
        list(args), cwd=cwd, input=input_bytes,
        capture_output=True, timeout=timeout, check=False
    )
    if result.returncode:
        error = result.stderr.decode("utf-8", "replace")
        # Do not expose remote URL, account secrets or the complete local environment.
        stop("Command failed: " + args[0] + " " + args[1] + " (" + str(result.returncode) + ") " + error[-350:])
    return result.stdout

def regular(file: Path) -> bool:
    try:
        s = file.lstat()
        return file.is_file() and not file.is_symlink() and s.st_nlink == 1
    except OSError:
        return False

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def git_blob(data: bytes) -> str:
    # GitHub repository uses SHA-1 Git objects.
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\x00" + data).hexdigest()

def verify_local() -> tuple[Path, Path]:
    if not REPO.is_dir() or REPO.is_symlink():
        stop("Local project directory missing or linked")
    root = call("git", "rev-parse", "--show-toplevel").decode().strip()
    if Path(root).resolve() != REPO.resolve():
        stop("Git working tree does not match the expected project")
    remote = call("git", "remote", "get-url", "origin").decode().strip()
    if remote not in EXPECTED_REMOTE:
        stop("Unexpected Git remote; refusing installation")
    main = REPO / "index.js"
    sidebar = REPO / "dashboard/index.html"
    for file in (main, sidebar):
        if not regular(file):
            stop("Missing/linked entrypoint: " + file.name)
        if file.stat().st_size > 1500000:
            stop("Unexpectedly large app entrypoint")
    if not shutil.which("node"):
        stop("Node.js is unavailable")
    return main, sidebar

def patch_main(old: str) -> str:
    present = [line in old for line in STUDIO_MOUNTS]
    if all(present):
        return old
    if any(present) or "mountV4Pilot(" in old or "mountLocalV4Gallery(" in old:
        stop("Partial/unknown V4 API integration exists; manual reconciliation required")
    if old.count(APP_ANCHOR) != 1:
        stop("Unexpected setupAPI structure; preserving local index.js")
    addition = ("\n    // Pinned, loopback-only V4 preview and opt-in pilot; no publishing changes.\n"
                + "\n".join(STUDIO_MOUNTS))
    return old.replace(APP_ANCHOR, APP_ANCHOR + addition, 1)

def patch_sidebar(old: str) -> str:
    if SIDEBAR_LINK in old:
        return old
    if 'href="/v4-studio.html"' in old:
        stop("An unknown V4 Studio navigation link already exists")
    if old.count(SIDEBAR_ANCHOR) != 1:
        stop("Unexpected dashboard navigation structure; preserving local index.html")
    return old.replace(SIDEBAR_ANCHOR, SIDEBAR_LINK + "\n" + SIDEBAR_ANCHOR, 1)

def stage_sources(staging: Path) -> dict[str, bytes]:
    call("git", "fetch", "--no-tags", "--quiet", "origin", "main", timeout=120)
    files = {}
    for name, expected in BLOBS.items():
        # git show only retrieves a source blob. No remote code is executed.
        data = call("git", "show", "FETCH_HEAD:" + name)
        if git_blob(data) != expected:
            stop("GitHub source changed since audit: " + name)
        target = staging / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        files[name] = data
    return files

def offline_tests(staging: Path, main: str, sidebar: str) -> None:
    for name in BLOBS:
        if name.endswith(".js"):
            call("node", "--check", str(staging / name), cwd=staging)
    # Test the patched entrypoint as a pure syntax check; never start the app.
    (staging / "index.js").write_text(main, encoding="utf-8")
    (staging / "dashboard/index.html").write_text(sidebar, encoding="utf-8")
    call("node", "--check", str(staging / "index.js"), cwd=staging)
    scripts = [name for name in BLOBS if name.startswith("test/")]
    call("node", "--test", *[str(staging / name) for name in scripts], cwd=staging, timeout=120)
    print("PASS: offline syntax and V4 safety tests (no rendering / TTS / upload)")

def safe_write(file: Path, data: bytes) -> None:
    file.parent.mkdir(parents=True, exist_ok=True)
    if file.is_symlink():
        stop("Symbolic-link destination: " + str(file))
    if file.exists():
        stop("Destination became occupied: " + str(file))
    with file.open("xb") as stream:
        os.chmod(file, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())

def atomic_replace(file: Path, data: bytes) -> None:
    if not regular(file):
        stop("Entrypoint changed or became linked")
    temp = file.with_name(file.name + ".v4-pending-" + str(os.getpid()))
    safe_write(temp, data)
    os.replace(temp, file)

def install() -> None:
    main_file, sidebar_file = verify_local()
    originals = {main_file:main_file.read_bytes(), sidebar_file:sidebar_file.read_bytes()}
    old_main = originals[main_file].decode("utf-8")
    old_sidebar = originals[sidebar_file].decode("utf-8")
    new_main = patch_main(old_main).encode("utf-8")
    new_sidebar = patch_sidebar(old_sidebar).encode("utf-8")
    current = {main_file:new_main,sidebar_file:new_sidebar}

    # Check target collisions before fetching or writing files.
    for name, expected in BLOBS.items():
        destination = REPO / name
        if destination.exists() or destination.is_symlink():
            if not regular(destination) or git_blob(destination.read_bytes()) != expected:
                stop("Existing local file differs; no overwrite: " + name)

    with tempfile.TemporaryDirectory(prefix="dve-v4-deploy-check-") as temp:
        staging = Path(temp)
        data = stage_sources(staging)
        offline_tests(staging, new_main.decode(),new_sidebar.decode())

    # Re-read local entrypoints after staging; don't overwrite concurrent work.
    for file, initial in originals.items():
        if not regular(file) or file.read_bytes() != initial:
            stop("Local entrypoint changed during verification: " + file.name)

    backup_root = REPO / ".v4-safe-backups"
    if backup_root.is_symlink():
        stop("Unsafe backup directory")
    backup_root.mkdir(mode=0o700, exist_ok=True)
    if backup_root.stat().st_mode & 0o077:
        stop("Backup directory permissions not private")

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = backup_root / (stamp + "-" + str(os.getpid()))
    backup.mkdir(mode=0o700)
    originals_at_backup = {
        "index.js": originals[main_file],
        "dashboard-index.html": originals[sidebar_file]
    }
    for filename, contents in originals_at_backup.items():
        safe_write(backup / filename, contents)
    safe_write(backup / "original-sha256.json",
        (json.dumps({k:digest(v) for k,v in originals_at_backup.items()},indent=2)+"\n").encode())

    created=[]
    patched=[]
    try:
        for name, contents in data.items():
            destination = REPO / name
            if destination.exists():
                if not regular(destination) or destination.read_bytes() != contents:
                    stop("Local file changed before install: " + name)
                continue
            safe_write(destination, contents)
            created.append(destination)

        for file, desired in current.items():
            if originals[file] != desired:
                atomic_replace(file, desired)
                patched.append(file)

        for file, desired in current.items():
            if file.read_bytes() != desired:
                stop("Entrypoint verification failed")
        for name, expected in BLOBS.items():
            if git_blob((REPO / name).read_bytes()) != expected:
                stop("V4 module verification failed: " + name)
        call("node", "--check", "index.js")
        call("node", "--test", *[n for n in BLOBS if n.startswith("test/")], timeout=120)
    except Exception:
        # Rollback only our own exact changes; never discard concurrent edits.
        for file in reversed(patched):
            if regular(file) and file.read_bytes() == current[file]:
                atomic_replace(file, originals[file])
        for file in reversed(created):
            name = str(file.relative_to(REPO))
            if regular(file) and git_blob(file.read_bytes()) == BLOBS[name]:
                file.unlink()
        raise

    print("INSTALL PASS: isolated V4 Studio modules and bounded API/sidebar hooks")
    print("BACKUP:", backup)
    print("APP SERVER: not started or restarted; current processes untouched")
    print("V4 PILOT: disabled until explicitly opted in after real device QA")
    print("MAIN SCHEDULER / PUBLISHING: unchanged")
    print("VOICE, APPROVED VIDEOS, DATABASE, CREDENTIALS: untouched")

def main() -> None:
    parser=argparse.ArgumentParser(description="V4 safe one-time Termux installer")
    parser.add_argument("--preflight", action="store_true", help="Read-only local setup check")
    parser.add_argument("--install", action="store_true", help="Fetch pinned blobs, test, back up and patch")
    args=parser.parse_args()
    if args.install == args.preflight:
        parser.error("Specify exactly --preflight or --install")
    if args.preflight:
        app, dash = verify_local()
        patch_main(app.read_text(encoding="utf-8"))
        patch_sidebar(dash.read_text(encoding="utf-8"))
        print("PREFLIGHT PASS: compatible local anchors; no changes made")
        return
    install()

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("V4 DEPLOY NOT COMPLETE:", error, file=sys.stderr)
        sys.exit(1)
