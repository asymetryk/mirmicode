#!/usr/bin/env python3
"""Wake Mirmicode's existing host reporter without reading hook payloads.

Prompt and assistant text arrives on stdin for some Codex lifecycle events. It
is deliberately ignored here. The host LaunchAgent owns credentials and polls
session files; this hook only asks launchd to run it sooner. Its normal
60-second interval remains the reconciliation path if hooks are unavailable.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys


LAUNCH_AGENT_LABEL = "com.mirmicode.collect-codex"


def wake_reporter() -> None:
    if sys.platform != "darwin":
        return

    launchctl = "/bin/launchctl"
    if not os.path.isfile(launchctl):
        return

    target = f"gui/{os.getuid()}/{LAUNCH_AGENT_LABEL}"
    try:
        # Without -k, an in-flight collector is left alone. Failures are
        # intentionally silent: the periodic LaunchAgent run reconciles state.
        subprocess.run(
            [launchctl, "kickstart", target],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=2,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


def main() -> int:
    # Never read stdin: it may contain the raw prompt or assistant response.
    wake_reporter()
    # Stop and SubagentStop require JSON output on successful exit. This
    # neutral response does not request continuation or alter the turn.
    sys.stdout.write(json.dumps({"continue": True}) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
