#!/usr/bin/env python3
"""Publish Codex session metadata to Mirmicode without transcript content.

This is an optional, read-only source adapter. Run it on a host that owns Codex
sessions. Repository associations may come from a local JSON registry, but the
collector also works with Git remotes alone.
"""

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from time import time
from urllib.request import ProxyHandler, Request, build_opener, urlopen


def canonical_remote(cwd):
    try:
        result = subprocess.run(
            ["git", "-C", cwd, "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=4, check=True,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None
    value = result.stdout.strip().removesuffix(".git")
    for prefix in ("git@github.com:", "ssh://git@github.com/", "https://github.com/"):
        if value.startswith(prefix):
            return "github.com/" + value[len(prefix):].strip("/")
    return None


def load_registry(path):
    if not path:
        return {}
    try:
        records = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    result = {}
    for entry in records.get("verified_origins", []):
        if isinstance(entry, dict) and isinstance(entry.get("origin"), str):
            result[entry["origin"]] = entry
    return result


def last_event(events):
    latest = None
    state = "unknown"
    for event in events:
        if not isinstance(event, dict) or event.get("type") != "event_msg":
            continue
        payload = event.get("payload")
        if not isinstance(payload, dict):
            continue
        kind = payload.get("type")
        if kind not in ("task_started", "task_complete"):
            continue
        timestamp = event.get("timestamp")
        if not isinstance(timestamp, str):
            continue
        if latest is None or timestamp > latest:
            latest = timestamp
            state = "working" if kind == "task_started" else "completed"
    return latest, state


def session_from_file(path, remote_cache, registry, now):
    try:
        with path.open(encoding="utf-8") as handle:
            events = (json.loads(line) for line in handle if line.strip())
            meta = None
            latest = None
            state = "unknown"
            model = None
            for event in events:
                if event.get("type") == "session_meta" and meta is None:
                    meta = event.get("payload")
                elif event.get("type") == "turn_context":
                    context = event.get("payload")
                    candidate = context.get("model") if isinstance(context, dict) else None
                    if isinstance(candidate, str) and candidate:
                        model = candidate
                elif event.get("type") == "event_msg":
                    payload = event.get("payload")
                    kind = payload.get("type") if isinstance(payload, dict) else None
                    timestamp = event.get("timestamp")
                    if kind in ("task_started", "task_complete") and isinstance(timestamp, str):
                        if latest is None or timestamp > latest:
                            latest = timestamp
                            state = "working" if kind == "task_started" else "completed"
    except (OSError, UnicodeError, ValueError):
        return None
    if not isinstance(meta, dict):
        return None
    cwd = meta.get("cwd")
    session_id = meta.get("id")
    if not isinstance(cwd, str) or not isinstance(session_id, str):
        return None
    if cwd not in remote_cache:
        remote_cache[cwd] = canonical_remote(cwd)
    repo_key = remote_cache[cwd]
    if not repo_key:
        return None
    source = meta.get("source")
    spawn = source.get("subagent", {}).get("thread_spawn", {}) if isinstance(source, dict) else {}
    parent = spawn.get("parent_thread_id") if isinstance(spawn, dict) else None
    label = spawn.get("agent_path") if isinstance(spawn, dict) else None
    updated_at = latest
    if updated_at is None:
        updated_at = meta.get("timestamp")
    if not isinstance(updated_at, str):
        return None
    try:
        touched = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        if state == "working":
            file_touched = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
            if file_touched > touched:
                touched = file_touched
                updated_at = touched.isoformat(timespec="seconds").replace("+00:00", "Z")
            if (now - touched).total_seconds() > 900:
                state = "unknown"
    except ValueError:
        return None
    record = registry.get(repo_key, {})
    op = record.get("openproject") or {}
    buzz = record.get("buzz") or {}
    repo = {"repo_key": repo_key, "label": repo_key.split("/")[-1],
            "github_url": "https://" + repo_key,
            "openproject_url": op.get("url"),
            "openproject_name": op.get("identifier"),
            "buzz_url": None,
            "stage": "active"}
    # A channel UUID alone is not a verified browser URL. Keep it out of
    # public navigation until the Hive route has been checked.
    _ = buzz
    session = {"id": session_id, "repo_key": repo_key,
               "harness": "Codex", "model": model,
               "thread_name": label or session_id[:8], "status": state,
               "parent_id": parent, "native_url": None,
               "updated_at": updated_at}
    return repo, session


def build_payload(sessions_root, registry_path=None, now=None, scan_hours=24):
    now = now or datetime.now(timezone.utc)
    registry = load_registry(registry_path)
    remote_cache = {}
    repos = {}
    sessions = {}
    for path in Path(sessions_root).rglob("*.jsonl"):
        try:
            if time() - path.stat().st_mtime > scan_hours * 3600:
                continue
        except OSError:
            continue
        result = session_from_file(path, remote_cache, registry, now)
        if result is None:
            continue
        repo, session = result
        repos[repo["repo_key"]] = repo
        sessions[session["id"]] = session
    return {"source": "codex-local", "repositories": list(repos.values()),
            "sessions": list(sessions.values())}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions-root", required=True)
    parser.add_argument("--registry")
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--token-file", required=True)
    parser.add_argument("--scan-hours", type=float, default=24)
    parser.add_argument("--use-system-proxy", action="store_true")
    args = parser.parse_args()
    endpoint = args.endpoint.rstrip("/") + "/api/v1/ingest"
    if not endpoint.startswith("https://"):
        parser.error("endpoint must use HTTPS")
    token = Path(args.token_file).read_text(encoding="utf-8").strip()
    payload = build_payload(args.sessions_root, args.registry, scan_hours=args.scan_hours)
    request = Request(endpoint, json.dumps(payload).encode("utf-8"),
                      {"Content-Type": "application/json", "Authorization": "Bearer " + token},
                      method="POST")
    # Direct by default so private endpoints do not leak to workstation proxies.
    opener = None if args.use_system_proxy else build_opener(ProxyHandler({}))
    with (opener.open(request, timeout=20) if opener else urlopen(request, timeout=20)) as response:
        if response.status != 200:
            raise RuntimeError(f"ingest failed: HTTP {response.status}")
    print(f"published {len(payload['repositories'])} repos and {len(payload['sessions'])} sessions")


if __name__ == "__main__":
    main()
