#!/usr/bin/env python3
"""Fail-open Cursor/OhMyPi lifecycle hook with a private retry queue.

The hook sends metadata only. Raw prompts, transcripts, credentials, and local
paths never enter the queue or Mirmicode's API payload.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener

APP_DIR = Path.home() / ".local/share/mirmicode"
MAX_INPUT = 64_000
SECRET = re.compile(r"\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{16})\b")
SENSITIVE = re.compile(r"\b(?:password|secret|api[-_ ]?key|token|credential|private key|ssn|credit card)\b", re.I)
WORD = re.compile(r"[A-Za-z][A-Za-z0-9+#.-]{3,}")


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def text(value, limit=120):
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None


def keywords(value):
    """Bounded topic words; never a raw prompt excerpt."""
    if not isinstance(value, str):
        return None
    safe = re.sub(r"```.*?```|`[^`]*`", " ", value, flags=re.S)
    safe = SECRET.sub(" ", safe)
    safe = re.sub(r"https?://\S+|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", " ", safe)
    safe = re.sub(r"(?:/[A-Za-z0-9_.@+-]+){2,}|\b[A-Za-z0-9_-]{24,}\b", " ", safe)
    result = []
    seen = set()
    for segment in re.split(r"(?<=[.!?])\s+|\n+", safe):
        if SENSITIVE.search(segment):
            continue
        for word in WORD.findall(segment):
            word = word.lower().strip(".-+#")
            if word not in seen and word not in {"this", "that", "with", "from", "what", "when", "where", "have", "would", "could", "please", "about"}:
                seen.add(word)
                result.append(word)
            if len(result) >= 10:
                return "Prompt keywords: " + ", ".join(result)
    return "Prompt keywords: " + ", ".join(result) if result else None


def repository(cwd):
    path = Path(cwd).expanduser()
    try:
        root = subprocess.run(["git", "-C", str(path), "rev-parse", "--show-toplevel"],
                              capture_output=True, text=True, check=True, timeout=3).stdout.strip()
        remote = subprocess.run(["git", "-C", root, "remote", "get-url", "origin"],
                                capture_output=True, text=True, check=True, timeout=3).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    remote = remote.removesuffix(".git")
    if remote.startswith("git@") and ":" in remote:
        host, name = remote[4:].split(":", 1)
    else:
        parts = urlsplit(remote)
        host, name = (parts.hostname or "").lower(), parts.path.lstrip("/")
    name = name.strip("/")
    if not host or not name:
        return None
    if host in ("github.com", "origin.cursor.com"):
        key = host + "/" + name
        github_url = "https://" + key if host == "github.com" else None
    else:
        key = "origin:" + hashlib.sha256((host + "/" + name).encode()).hexdigest()[:24]
        github_url = None
    return {"repo_key": key, "label": name.split("/")[-1], "github_url": github_url}


def observation(harness, event, data, timestamp=None):
    if not isinstance(data, dict):
        return None
    timestamp = timestamp or now_utc()
    if harness == "cursor":
        roots = data.get("workspace_roots")
        cwd = (roots[0] if isinstance(roots, list) and roots and isinstance(roots[0], str)
               else data.get("cwd") or os.environ.get("CURSOR_PROJECT_DIR"))
        base_id = text(data.get("conversation_id") or data.get("session_id"), 200)
        child_id = text(data.get("subagent_id"), 200)
        is_child = event in ("subagentStart", "subagentStop")
        native_id = child_id if is_child else base_id
        if event in ("sessionStart", "beforeSubmitPrompt", "subagentStart"):
            status = "working"
        elif event in ("stop", "subagentStop"):
            result = data.get("status")
            status = "needs-attention" if result == "error" else "unknown" if result == "aborted" else "completed"
        elif event == "sessionEnd":
            reason = data.get("reason")
            status = "completed" if reason == "completed" else "needs-attention" if reason == "error" else "unknown"
        else:
            return None
        parent = text(data.get("parent_conversation_id"), 200) if is_child else None
        model = text(data.get("subagent_model") if is_child else data.get("model_id") or data.get("model"))
        prompt = data.get("task") if is_child else data.get("prompt")
        title = text(data.get("subagent_type"), 80) + " subagent" if is_child and text(data.get("subagent_type"), 80) else "Cursor thread"
    elif harness == "ohmypi":
        cwd = data.get("cwd")
        native_id = text(data.get("session_id"), 500)
        if event == "agent_start":
            status = "working"
        elif event == "agent_end":
            status = "completed"
        else:
            return None
        parent = text(data.get("parent_session_id"), 500)
        model = text(data.get("model"))
        prompt = data.get("prompt")
        title = "OhMyPi thread"
    else:
        return None
    if not native_id or not isinstance(cwd, str):
        return None
    repo = repository(cwd)
    if repo is None:
        return None
    identity = harness + ":" + hashlib.sha256(native_id.encode()).hexdigest()[:32]
    parent_id = harness + ":" + hashlib.sha256(parent.encode()).hexdigest()[:32] if parent else None
    session = {"id": identity, "repo_key": repo["repo_key"], "harness": "Cursor" if harness == "cursor" else "OhMyPi",
               "model": model, "thread_name": title, "status": status, "parent_id": parent_id,
               "native_url": None, "updated_at": timestamp, "prompt_tldr": keywords(prompt),
               "started_at": timestamp if status == "working" else None,
               "finished_at": timestamp if status != "working" else None,
               "duration_ms": data.get("duration_ms") if type(data.get("duration_ms")) is int and data["duration_ms"] >= 0 else None,
               "token_usage": None, "outcome": None}
    return {"source": harness + "-hooks", "repositories": [repo], "sessions": [session]}


def private_queue():
    queue = APP_DIR / "harness-queue"
    queue.mkdir(mode=0o700, parents=True, exist_ok=True)
    if queue.stat().st_mode & 0o077:
        raise ValueError("harness queue must be private")
    return queue


def enqueue(queue, payload):
    filename = now_utc().replace(":", "-") + "-" + uuid.uuid4().hex + ".json"
    path = queue / filename
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))


def destination():
    config_path = APP_DIR / "reporter.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    endpoint = os.environ.get("MIRMICODE_ENDPOINT") or config["endpoint"]
    if not endpoint.startswith("https://"):
        raise ValueError("reporter endpoint must use HTTPS")
    token_path = Path(os.environ.get("MIRMICODE_INGEST_TOKEN_FILE") or config["token_file"]).expanduser()
    if token_path.stat().st_mode & 0o077:
        raise ValueError("ingest token file must be private")
    return endpoint.rstrip("/") + "/api/v1/events", token_path.read_text(encoding="utf-8").strip()


def flush(queue):
    endpoint, token = destination()
    opener = build_opener(ProxyHandler({}))
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    for path in sorted(queue.glob("*.json")):
        if datetime.fromtimestamp(path.stat().st_mtime, timezone.utc) < cutoff:
            path.unlink()
            continue
        payload = path.read_bytes()
        request = Request(endpoint, payload, {"Content-Type": "application/json", "Authorization": "Bearer " + token}, method="POST")
        with opener.open(request, timeout=3) as response:
            if response.status != 200:
                raise RuntimeError("ingest returned non-success")
        path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--harness", choices=("cursor", "ohmypi"))
    parser.add_argument("--event")
    parser.add_argument("--flush", action="store_true")
    args = parser.parse_args()
    try:
        queue = private_queue()
        if not args.flush:
            if not args.harness or not args.event:
                raise ValueError("harness and event are required")
            data = json.loads(sys.stdin.read(MAX_INPUT + 1))
            payload = observation(args.harness, args.event, data)
            if payload:
                enqueue(queue, payload)
        flush(queue)
    except Exception as exc:
        # Telemetry must never block a coding agent or echo credentials.
        print(f"Mirmicode reporter deferred: {type(exc).__name__}", file=sys.stderr)
    if args.harness == "cursor":
        if args.event == "beforeSubmitPrompt":
            print('{"continue":true}')
        elif args.event == "subagentStart":
            print('{"permission":"allow"}')
        else:
            print("{}")


if __name__ == "__main__":
    main()
