#!/usr/bin/env python3
"""Preview or install local Cursor and OhMyPi Mirmicode reporters on macOS."""

import argparse
import json
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURSOR_TEMPLATE = ROOT / "integrations/cursor/hooks.json"
OMP_TEMPLATE = ROOT / "integrations/ohmypi/mirmicode.ts"
REPORTER_SOURCE = Path(__file__).with_name("report_harness.py")
LABEL = "com.mirmicode.flush-harness"


def merged_cursor(existing, template):
    if not isinstance(existing, dict):
        raise ValueError("Cursor hooks must contain a JSON object")
    result = json.loads(json.dumps(existing))
    result.setdefault("version", 1)
    hooks = result.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        raise ValueError("Cursor hooks field must be an object")
    for event, wanted in template["hooks"].items():
        current = hooks.setdefault(event, [])
        if not isinstance(current, list):
            raise ValueError(f"Cursor {event} hooks must be a list")
        matches = [item for item in current if isinstance(item, dict) and
                   "report_harness.py" in str(item.get("command", ""))]
        if len(matches) > 1 or (matches and matches[0] != wanted[0]):
            raise ValueError(f"Cursor {event} Mirmicode hook differs; refusing overwrite")
        if not matches:
            current.extend(wanted)
    return result


def plan(endpoint, token_file, home):
    if not endpoint.startswith("https://"):
        raise ValueError("endpoint must use HTTPS")
    token = token_file.expanduser().resolve()
    if not token.is_file() or token.stat().st_mode & 0o077:
        raise ValueError("token file must exist and be private")
    cursor_path = home / ".cursor/hooks.json"
    omp_path = home / ".omp/agent/extensions/mirmicode.ts"
    for path in (cursor_path, omp_path):
        if path.is_symlink():
            raise ValueError(f"refusing symlinked destination: {path}")
    existing = json.loads(cursor_path.read_text(encoding="utf-8")) if cursor_path.exists() else {"version": 1, "hooks": {}}
    template = json.loads(CURSOR_TEMPLATE.read_text(encoding="utf-8"))
    cursor = merged_cursor(existing, template)
    if omp_path.exists() and omp_path.read_bytes() != OMP_TEMPLATE.read_bytes():
        raise ValueError("existing OhMyPi Mirmicode extension differs; refusing overwrite")
    app_dir = home / ".local/share/mirmicode"
    reporter_path = app_dir / "report_harness.py"
    if reporter_path.is_symlink():
        raise ValueError("refusing symlinked reporter")
    if reporter_path.exists() and reporter_path.read_bytes() != REPORTER_SOURCE.read_bytes():
        raise ValueError("existing Mirmicode harness reporter differs; refusing overwrite")
    config_path = app_dir / "reporter.json"
    if config_path.is_symlink():
        raise ValueError("refusing symlinked reporter config")
    config = {"endpoint": endpoint.rstrip("/"), "token_file": str(token)}
    return cursor_path, cursor, omp_path, reporter_path, config_path, config


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--token-file", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("host reporter installation requires macOS")
    try:
        cursor_path, cursor, omp_path, reporter_path, config_path, config = plan(
            args.endpoint, Path(args.token_file), Path.home())
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    if not args.apply:
        print("would install Cursor user hooks, OhMyPi extension, private reporter, and 60-second retry agent")
        return
    cursor_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    omp_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    reporter_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    cursor_path.write_text(json.dumps(cursor, indent=2) + "\n", encoding="utf-8")
    omp_path.write_bytes(OMP_TEMPLATE.read_bytes())
    shutil.copy2(REPORTER_SOURCE, reporter_path)
    config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    os.chmod(config_path, 0o600)
    logs = Path.home() / "Library/Logs/Mirmicode"
    logs.mkdir(parents=True, exist_ok=True)
    plist_path = Path.home() / "Library/LaunchAgents" / (LABEL + ".plist")
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    with plist_path.open("wb") as handle:
        plistlib.dump({
            "Label": LABEL,
            "ProgramArguments": [sys.executable, str(reporter_path), "--flush"],
            "StartInterval": 60,
            "RunAtLoad": True,
            "StandardOutPath": str(logs / "harness-reporter.log"),
            "StandardErrorPath": str(logs / "harness-reporter.err.log"),
        }, handle)
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", domain, str(plist_path)], capture_output=True)
    subprocess.run(["launchctl", "bootstrap", domain, str(plist_path)], check=True)
    print(f"installed {LABEL}; Cursor and OhMyPi hooks will load in new sessions")


if __name__ == "__main__":
    main()
