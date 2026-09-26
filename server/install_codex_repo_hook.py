#!/usr/bin/env python3
"""Enroll a Git repository in Mirmicode's Codex lifecycle reporter.

The default is a dry run. The repo-local hook only wakes the separately
installed host reporter; it never contains an endpoint or credential.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


HOOKS_SOURCE = Path(__file__).resolve().parents[1] / ".codex" / "hooks.json"
SCRIPT_SOURCE = Path(__file__).resolve().parents[1] / ".codex" / "hooks" / "mirmicode_report.py"
MIRMICODE_SCRIPT_MARKER = "mirmicode_report.py"


class EnrollmentError(ValueError):
    """Enrollment cannot proceed without risking unrelated repo settings."""


def _git_root(repo: Path) -> Path:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "--show-toplevel"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise EnrollmentError(f"--repo must be inside a Git worktree: {repo}") from exc
    root = Path(result.stdout.strip()).resolve()
    if not root.is_dir():
        raise EnrollmentError(f"Git worktree root is unavailable: {root}")
    return root


def _template() -> tuple[dict[str, Any], bytes]:
    try:
        config = json.loads(HOOKS_SOURCE.read_text(encoding="utf-8"))
        script = SCRIPT_SOURCE.read_bytes()
    except (OSError, json.JSONDecodeError) as exc:
        raise EnrollmentError(f"Mirmicode hook template is unavailable or invalid: {exc}") from exc
    if not isinstance(config, dict) or not isinstance(config.get("hooks"), dict):
        raise EnrollmentError("Mirmicode hook template must have a hooks object")
    if not script:
        raise EnrollmentError("Mirmicode hook script is empty")
    return config, script


def _contains_mirmicode_script(value: Any) -> bool:
    if isinstance(value, dict):
        return any(_contains_mirmicode_script(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_mirmicode_script(item) for item in value)
    return isinstance(value, str) and MIRMICODE_SCRIPT_MARKER in value


def _merged_config(existing: dict[str, Any] | None, template: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    if existing is None:
        return template, True
    merged = json.loads(json.dumps(existing))
    current_hooks = merged.get("hooks")
    if current_hooks is None:
        current_hooks = {}
        merged["hooks"] = current_hooks
    if not isinstance(current_hooks, dict):
        raise EnrollmentError("Existing .codex/hooks.json has a non-object hooks field")

    wanted_hooks = template["hooks"]
    changed = False
    for event, wanted_groups in wanted_hooks.items():
        if not isinstance(wanted_groups, list):
            raise EnrollmentError(f"Mirmicode template event {event} must be a list")
        existing_groups = current_hooks.setdefault(event, [])
        if not isinstance(existing_groups, list):
            raise EnrollmentError(f"Existing Codex event {event} must contain a list")
        for wanted_group in wanted_groups:
            matches = [group for group in existing_groups if _contains_mirmicode_script(group)]
            if any(group != wanted_group for group in matches):
                raise EnrollmentError(
                    f"Existing {event} Mirmicode hook differs from the installer template; refusing to overwrite"
                )
            if len(matches) > 1:
                raise EnrollmentError(f"Existing {event} has duplicate Mirmicode hook groups")
            if not matches:
                existing_groups.append(wanted_group)
                changed = True
    return merged, changed


def _read_config(path: Path) -> dict[str, Any] | None:
    if path.is_symlink():
        raise EnrollmentError(f"Refusing symlinked Codex hook config: {path}")
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EnrollmentError(f"Existing Codex hook config is unreadable or invalid JSON: {path}") from exc
    if not isinstance(data, dict):
        raise EnrollmentError("Existing .codex/hooks.json must contain a JSON object")
    return data


def _atomic_write(path: Path, content: bytes, mode: int) -> None:
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def enroll(repo: Path, apply: bool = False) -> list[str]:
    """Plan or apply idempotent enrollment; return human-readable actions."""
    root = _git_root(repo.expanduser())
    template, script_bytes = _template()
    codex_dir = root / ".codex"
    hooks_dir = codex_dir / "hooks"
    config_path = codex_dir / "hooks.json"
    script_path = hooks_dir / "mirmicode_report.py"

    for directory in (codex_dir, hooks_dir):
        if directory.is_symlink():
            raise EnrollmentError(f"Refusing symlinked Codex directory: {directory}")

    existing_script: bytes | None = None
    if script_path.is_symlink():
        raise EnrollmentError(f"Refusing symlinked Mirmicode hook script: {script_path}")
    if script_path.exists():
        if not script_path.is_file():
            raise EnrollmentError(f"Mirmicode hook destination is not a regular file: {script_path}")
        existing_script = script_path.read_bytes()
        if existing_script != script_bytes:
            raise EnrollmentError(f"Existing Mirmicode hook script differs; refusing to overwrite: {script_path}")

    existing_config = _read_config(config_path)
    merged, config_changed = _merged_config(existing_config, template)
    config_bytes = (json.dumps(merged, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if existing_config is not None and not config_changed:
        # Preserve original formatting and avoid a needless rewrite.
        config_bytes = config_path.read_bytes()

    actions: list[str] = []
    if existing_script is None:
        actions.append(f"copy {SCRIPT_SOURCE} -> {script_path}")
    else:
        actions.append(f"keep existing identical hook script {script_path}")
    if existing_config is None:
        actions.append(f"create {config_path} with four Mirmicode lifecycle hook groups")
    elif config_changed:
        actions.append(f"merge four Mirmicode lifecycle hook groups into {config_path}")
    else:
        actions.append(f"keep existing Mirmicode lifecycle hooks in {config_path}")

    if apply:
        codex_dir.mkdir(mode=0o700, exist_ok=True)
        hooks_dir.mkdir(mode=0o700, exist_ok=True)
        if existing_script is None:
            _atomic_write(script_path, script_bytes, 0o755)
        if existing_config is None or config_changed:
            mode = (config_path.stat().st_mode & 0o777) if config_path.exists() else 0o600
            _atomic_write(config_path, config_bytes, mode)

    actions.append("Codex /hooks review is required before the project-local hooks run.")
    actions.append("The Mirmicode host reporter must be installed separately; this repo hook copies no endpoint or credential.")
    return actions


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path, help="path inside the Git worktree to enroll")
    parser.add_argument("--apply", action="store_true", help="write the enrollment; default is a dry run")
    args = parser.parse_args(argv)
    try:
        for action in enroll(args.repo, apply=args.apply):
            print(action)
        print("mode: applied" if args.apply else "mode: dry run; pass --apply to write")
        return 0
    except EnrollmentError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
