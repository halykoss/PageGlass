#!/usr/bin/env python3
"""PageGlass installer for the Vivaldi browser.

Adds one <script> tag to Vivaldi's window.html and copies pageglass.js next to it.
The untouched window.html is backed up first, so `uninstall` restores it byte for byte.

    python3 pageglass.py status
    python3 pageglass.py install   [--vivaldi PATH] [--dry-run]
    python3 pageglass.py uninstall [--vivaldi PATH] [--dry-run]

Standard library only. Quit Vivaldi before installing or uninstalling.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT_SRC = HERE / "src" / "pageglass.js"
SCRIPT_NAME = "pageglass.js"
MARKER = '<script src="pageglass.js" defer></script>'
SYSTEM = platform.system()  # 'Darwin', 'Linux', 'Windows'


# ── Locating Vivaldi ────────────────────────────────────────────────────────

def _version_key(path: Path) -> tuple:
    """Sort key: the Vivaldi version folder in the path, e.g. 8.3.4191.47."""
    for part in reversed(path.parts):
        if re.fullmatch(r"\d+(\.\d+)+", part):
            return tuple(int(x) for x in part.split("."))
    return ()


def candidate_dirs() -> list[Path]:
    """Every Vivaldi resource folder (the one holding window.html) we know how to find."""
    found: list[Path] = []
    if SYSTEM == "Darwin":
        for app in (Path("/Applications"), Path.home() / "Applications"):
            for name in ("Vivaldi.app", "Vivaldi Snapshot.app"):
                versions = app / name / "Contents/Frameworks/Vivaldi Framework.framework/Versions"
                found += [p.parent for p in versions.glob("*/Resources/vivaldi/window.html")
                          if p.parts[-4] != "Current"]
    elif SYSTEM == "Linux":
        for root in ("/opt/vivaldi", "/opt/vivaldi-snapshot", "/usr/share/vivaldi",
                     "/var/lib/flatpak/app/com.vivaldi.Vivaldi/current/active/files/extra/vivaldi"):
            p = Path(root) / "resources/vivaldi/window.html"
            if p.exists():
                found.append(p.parent)
    elif SYSTEM == "Windows":
        roots = [os.environ.get(v) for v in ("LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)")]
        for root in filter(None, roots):
            for name in ("Vivaldi", "Vivaldi Snapshot"):
                found += [p.parent for p in (Path(root) / name / "Application").glob(
                    "*/resources/vivaldi/window.html")]
    return sorted(set(found), key=_version_key, reverse=True)


def resolve_target(explicit: str | None) -> Path:
    if explicit:
        p = Path(explicit).expanduser().resolve()
        if p.name == "window.html":
            p = p.parent
        if not (p / "window.html").exists():
            # Accept an app bundle / install root too.
            sub = "Resources" if SYSTEM == "Darwin" else "resources"
            hits = sorted(p.glob(f"**/{sub}/vivaldi/window.html"), key=_version_key, reverse=True)
            hits = [h for h in hits if "Current" not in h.parts]
            if not hits:
                sys.exit(f"No Vivaldi window.html found under {p}")
            p = hits[0].parent
        return p
    dirs = candidate_dirs()
    if not dirs:
        sys.exit("Vivaldi was not found. Pass its location with --vivaldi PATH "
                 "(the app, the install folder, or the folder containing window.html).")
    if len(dirs) > 1:
        print(f"Several Vivaldi versions found; using the newest: {dirs[0]}")
    return dirs[0]


# ── Backups ─────────────────────────────────────────────────────────────────

def data_dir() -> Path:
    if SYSTEM == "Darwin":
        base = Path.home() / "Library/Application Support"
    elif SYSTEM == "Windows":
        base = Path(os.environ.get("APPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
    return base / "PageGlass"


def backup_dir(target: Path) -> Path:
    version = ".".join(map(str, _version_key(target))) or hashlib.sha256(
        str(target).encode()).hexdigest()[:12]
    return data_dir() / "backups" / version


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ── Helpers ─────────────────────────────────────────────────────────────────

def vivaldi_running() -> bool:
    try:
        if SYSTEM == "Windows":
            out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq vivaldi.exe"],
                                 capture_output=True, text=True).stdout
            return "vivaldi.exe" in out.lower()
        return subprocess.run(["pgrep", "-x", "Vivaldi" if SYSTEM == "Darwin" else "vivaldi-bin"],
                              capture_output=True).returncode == 0
    except OSError:
        return False


def script_version(path: Path) -> str | None:
    if not path.exists():
        return None
    m = re.search(r"PageGlass (\d+\.\d+\.\d+)", path.read_text(encoding="utf-8", errors="replace")[:400])
    return m.group(1) if m else "unknown"


def permission_help(err: OSError, target: Path) -> None:
    print(f"\nPermission denied while writing to:\n  {target}\n", file=sys.stderr)
    if SYSTEM == "Darwin":
        print("macOS protects apps in /Applications. Allow your terminal app under\n"
              "  System Settings → Privacy & Security → App Management\n"
              "then run the command again.", file=sys.stderr)
    elif SYSTEM == "Linux":
        print("Vivaldi is installed system-wide. Run the command with sudo.", file=sys.stderr)
    else:
        print("Run the command from a terminal opened as Administrator.", file=sys.stderr)
    sys.exit(f"({err})")


class Plan:
    """Records actions; performs them unless --dry-run."""

    def __init__(self, dry: bool):
        self.dry = dry

    def do(self, label: str, fn, *args):
        print(("[dry-run] " if self.dry else "") + label)
        if not self.dry:
            fn(*args)


def _write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


# ── Commands ────────────────────────────────────────────────────────────────

def cmd_status(target: Path) -> int:
    window = target / "window.html"
    patched = MARKER in window.read_text(encoding="utf-8")
    installed = script_version(target / SCRIPT_NAME)
    bundled = script_version(SCRIPT_SRC)
    backup = backup_dir(target) / "window.html"
    print(f"Vivaldi resources : {target}")
    print(f"Patched           : {'yes' if patched else 'no'}")
    print(f"Installed script  : {installed or '—'}")
    print(f"Bundled script    : {bundled or '—'}")
    print(f"Backup            : {backup if backup.exists() else '—'}")
    if patched and installed and bundled and installed != bundled:
        print("\nAn update is available: run `install` again.")
    if not patched and backup.parent.parent.exists():
        others = [p.name for p in backup.parent.parent.iterdir() if p.name != backup.parent.name]
        if others:
            print(f"\nBackups exist for older Vivaldi versions ({', '.join(others)}): "
                  "Vivaldi probably updated and replaced the patch. Run `install` again.")
    return 0


def cmd_install(target: Path, dry: bool) -> int:
    if not SCRIPT_SRC.exists():
        sys.exit(f"Missing {SCRIPT_SRC}. Run this from the PageGlass folder.")
    window = target / "window.html"
    original = window.read_text(encoding="utf-8")
    plan = Plan(dry)
    if vivaldi_running():
        print("Note: Vivaldi is running. Restart it after installing to load PageGlass.")
    try:
        if MARKER not in original:
            if "</body>" not in original:
                sys.exit("Unexpected window.html (no </body>). Nothing changed.")
            existing = target / SCRIPT_NAME
            if existing.exists() and "__pageGlass" not in existing.read_text(encoding="utf-8", errors="replace"):
                sys.exit(f"{existing} exists and is not PageGlass. Nothing changed.")
            bdir = backup_dir(target)
            saved = bdir / "window.html"
            if saved.exists() and saved.read_bytes() != window.read_bytes():
                sys.exit(f"A different backup already exists at {saved}. Review it first. Nothing changed.")
            if not saved.exists():
                plan.do(f"Back up window.html → {saved}", lambda: (bdir.mkdir(parents=True, exist_ok=True),
                                                                    shutil.copy2(window, saved)))
                plan.do("Write backup manifest", _write, bdir / "manifest.json",
                        json.dumps({"path": str(window), "sha256": sha256(window)}, indent=2))
            plan.do(f"Copy {SCRIPT_NAME} → {target}", shutil.copy2, SCRIPT_SRC, target / SCRIPT_NAME)
            plan.do("Add <script> tag to window.html", _write, window,
                    original.replace("</body>", MARKER + "\n</body>", 1))
        else:
            plan.do(f"Update {SCRIPT_NAME} ({script_version(target / SCRIPT_NAME)} → "
                    f"{script_version(SCRIPT_SRC)})", shutil.copy2, SCRIPT_SRC, target / SCRIPT_NAME)
    except PermissionError as e:
        permission_help(e, target)
    print("\nDone. Restart Vivaldi." if not dry else "\nDry run: nothing was changed.")
    return 0


def cmd_uninstall(target: Path, dry: bool) -> int:
    window = target / "window.html"
    current = window.read_text(encoding="utf-8")
    plan = Plan(dry)
    if MARKER not in current:
        print("PageGlass is not installed in this Vivaldi version. Nothing to do.")
        return 0
    saved = backup_dir(target) / "window.html"
    try:
        if saved.exists() and saved.read_text(encoding="utf-8").replace("</body>", MARKER + "\n</body>", 1) == current:
            plan.do(f"Restore original window.html from {saved}", shutil.copy2, saved, window)
        else:
            # No exact backup (or window.html changed since): remove only our line.
            print("No matching backup; removing only the PageGlass <script> line.")
            plan.do("Remove <script> tag from window.html", _write, window,
                    current.replace(MARKER + "\n", "").replace(MARKER, ""))
        script = target / SCRIPT_NAME
        if script.exists():
            plan.do(f"Delete {script}", script.unlink)
    except PermissionError as e:
        permission_help(e, target)
    print("\nDone. Restart Vivaldi." if not dry else "\nDry run: nothing was changed.")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="pageglass.py", description="Install PageGlass into Vivaldi.")
    ap.add_argument("command", choices=["install", "uninstall", "status"], nargs="?", default="status")
    ap.add_argument("--vivaldi", metavar="PATH",
                    help="Vivaldi app, install folder, or the folder that contains window.html")
    ap.add_argument("--dry-run", action="store_true", help="show what would change, change nothing")
    args = ap.parse_args(argv)
    target = resolve_target(args.vivaldi)
    if args.command == "status":
        return cmd_status(target)
    if args.command == "install":
        return cmd_install(target, args.dry_run)
    return cmd_uninstall(target, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
