#!/usr/bin/env python3
"""Install the lightweight Codex metadata collector as a macOS LaunchAgent."""

import argparse
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

LABEL = "com.mirmicode.collect-codex"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--token-file", required=True)
    parser.add_argument("--sessions-root", default=str(Path.home() / ".codex/sessions"))
    parser.add_argument("--registry")
    parser.add_argument("--interval", type=int, default=60)
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("LaunchAgent installation requires macOS")
    if args.interval < 30:
        parser.error("interval must be at least 30 seconds")
    token_path = Path(args.token_file).expanduser().resolve()
    if not token_path.is_file() or token_path.stat().st_mode & 0o077:
        parser.error("token file must exist and be private to the current user")
    app_dir = Path.home() / ".local/share/mirmicode"
    app_dir.mkdir(parents=True, exist_ok=True)
    installed = app_dir / "collect_codex.py"
    shutil.copy2(Path(__file__).with_name("collect_codex.py"), installed)
    commands = [sys.executable, str(installed),
                "--sessions-root", str(Path(args.sessions_root).expanduser().resolve()),
                "--endpoint", args.endpoint, "--token-file", str(token_path)]
    if args.registry:
        commands.extend(["--registry", str(Path(args.registry).expanduser().resolve())])
    logs = Path.home() / "Library/Logs/Mirmicode"
    logs.mkdir(parents=True, exist_ok=True)
    agent_dir = Path.home() / "Library/LaunchAgents"
    agent_dir.mkdir(parents=True, exist_ok=True)
    plist = agent_dir / f"{LABEL}.plist"
    data = {"Label": LABEL, "ProgramArguments": commands,
            "RunAtLoad": True, "StartInterval": args.interval,
            "StandardOutPath": str(logs / "collector.log"),
            "StandardErrorPath": str(logs / "collector.err.log")}
    with plist.open("wb") as handle:
        plistlib.dump(data, handle)
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", domain, str(plist)], capture_output=True)
    subprocess.run(["launchctl", "bootstrap", domain, str(plist)], check=True)
    print(f"installed {LABEL} every {args.interval}s; plist={plist}")


if __name__ == "__main__":
    main()
