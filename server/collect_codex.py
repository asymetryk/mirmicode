#!/usr/bin/env python3
"""Publish Codex session metadata to Mirmicode without transcript content.

This is an optional, read-only source adapter. Run it on a host that owns Codex
sessions. Repository associations may come from a local JSON registry, but the
collector also works with Git remotes alone.
"""

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from time import time
from urllib.request import ProxyHandler, Request, build_opener, urlopen


TOKEN_USAGE_FIELDS = (
    "input_tokens", "output_tokens", "cached_input_tokens",
    "reasoning_output_tokens", "total_tokens",
)
PROMPT_STOP_WORDS = frozenset((
    "about", "after", "again", "also", "and", "any", "are", "because", "been",
    "before", "being", "between", "both", "but", "can", "could", "did", "does",
    "each", "for", "from", "get", "give", "have", "help", "here", "how", "into",
    "just", "make", "more", "most", "need", "only", "other", "our", "out", "please",
    "some", "than", "that", "the", "their", "them", "then", "there", "these", "they",
    "this", "through", "update", "want", "were", "what", "when", "where", "which",
    "while", "with", "would", "your", "you",
))
SENSITIVE_PROMPT_MARKER = re.compile(
    r"\b(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|secret(?:[-_ ]?key)?|"
    r"password|passwd|authorization|bearer|credential|private key|ssh key|"
    r"ssn|social security|credit card|cvv|pin)\b", re.IGNORECASE,
)
SECRET_TOKEN = re.compile(
    r"\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|"
    r"sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{12,})\b"
)
PROMPT_WORD = re.compile(r"[A-Za-z][A-Za-z0-9+#.-]{2,}")
CODEX_SESSION_FILENAME = re.compile(
    r"rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-"
    r"(?P<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl",
    re.IGNORECASE,
)
CODEX_SESSION_ID = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)


def native_codex_url(session_id, path):
    """Link only a local Codex session whose metadata and filename agree."""
    if not isinstance(session_id, str) or not CODEX_SESSION_ID.fullmatch(session_id):
        return None
    filename = CODEX_SESSION_FILENAME.fullmatch(Path(path).name)
    if filename is None or filename.group("id").lower() != session_id.lower():
        return None
    return "codex://threads/" + session_id.lower()


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


def prompt_keywords(text):
    """Return a bounded keyword sketch, never a stored prompt excerpt."""
    if not isinstance(text, str) or not text:
        return None
    # Prompt bodies can contain pasted source and credentials. Exclude code and
    # common secret-bearing forms before extracting a small set of topic words.
    safe = re.sub(r"```.*?```|`[^`]*`", " ", text, flags=re.DOTALL)
    safe = SECRET_TOKEN.sub(" ", safe)
    safe = re.sub(r"https?://\S+|www\.\S+", " ", safe, flags=re.IGNORECASE)
    safe = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", " ", safe)
    safe = re.sub(r"(?:/[A-Za-z0-9_.@+-]+){2,}|[A-Za-z]:\\(?:[^\s\\]+\\)*[^\s\\]*", " ", safe)
    safe = re.sub(r"\b[A-Za-z0-9_-]{24,}\b", " ", safe)
    keywords = []
    seen = set()
    # Drop entire lines/sentences around sensitive markers instead of trying
    # to guess where a credential or personal value ends.
    for segment in re.split(r"(?<=[.!?])\s+|\n+", safe):
        if SENSITIVE_PROMPT_MARKER.search(segment):
            continue
        for word in PROMPT_WORD.findall(segment):
            normalized = word.lower().strip(".-+#")
            if len(normalized) < 4 or normalized in PROMPT_STOP_WORDS or normalized in seen:
                continue
            seen.add(normalized)
            keywords.append(normalized)
            if len(keywords) == 10:
                break
        if len(keywords) == 10:
            break
    if not keywords:
        return None
    return "Prompt keywords: " + ", ".join(keywords)


def token_usage_from_info(info):
    if not isinstance(info, dict):
        return None
    # Only cumulative usage has the session-wide meaning of this API field.
    usage = info.get("total_token_usage")
    if not isinstance(usage, dict):
        return None
    result = {}
    for field in TOKEN_USAGE_FIELDS:
        value = usage.get(field)
        result[field] = value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None
    return result if any(value is not None for value in result.values()) else None


def timestamp_value(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return value if parsed.tzinfo else None


def elapsed_ms(started_at, finished_at):
    if not started_at or not finished_at:
        return None
    try:
        start = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        finish = datetime.fromisoformat(finished_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    milliseconds = int((finish - start).total_seconds() * 1000)
    return milliseconds if milliseconds >= 0 else None


def session_from_file(path, remote_cache, registry, now):
    try:
        with path.open(encoding="utf-8") as handle:
            events = (json.loads(line) for line in handle if line.strip())
            meta = None
            latest = None
            state = "unknown"
            model = None
            started_at = None
            finished_at = None
            duration_ms = None
            token_usage = None
            prompt_tldr = None
            for event in events:
                if not isinstance(event, dict):
                    continue
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
                    if kind == "token_count" and isinstance(payload, dict):
                        candidate = token_usage_from_info(payload.get("info"))
                        if candidate is not None:
                            token_usage = candidate
                    if kind == "task_started" and isinstance(payload, dict):
                        candidate = timestamp_value(payload.get("started_at")) or timestamp_value(timestamp)
                        if candidate:
                            started_at = candidate
                            finished_at = None
                            duration_ms = None
                    elif kind == "task_complete" and isinstance(payload, dict):
                        candidate = timestamp_value(payload.get("completed_at")) or timestamp_value(timestamp)
                        if candidate:
                            finished_at = candidate
                        source_start = timestamp_value(payload.get("started_at"))
                        if source_start:
                            started_at = source_start
                        source_duration = payload.get("duration_ms")
                        if isinstance(source_duration, int) and not isinstance(source_duration, bool) and source_duration >= 0:
                            duration_ms = source_duration
                        else:
                            duration_ms = elapsed_ms(started_at, finished_at)
                elif (event.get("type") == "response_item"
                      and isinstance(event.get("payload"), dict)):
                    payload = event["payload"]
                    if payload.get("type") == "message" and payload.get("role") == "user":
                        content = payload.get("content")
                        if isinstance(content, list):
                            text = " ".join(
                                block.get("text", "") for block in content
                                if isinstance(block, dict) and block.get("type") == "input_text"
                                and isinstance(block.get("text"), str)
                            )
                            summary = prompt_keywords(text)
                            if summary:
                                prompt_tldr = summary
    except (OSError, UnicodeError, ValueError):
        return None
    if not isinstance(meta, dict):
        return None
    cwd = meta.get("cwd")
    session_id = meta.get("id")
    if not isinstance(cwd, str) or not isinstance(session_id, str):
        return None
    if started_at is None:
        started_at = timestamp_value(meta.get("timestamp"))
    if duration_ms is None:
        duration_ms = elapsed_ms(started_at, finished_at)
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
               "parent_id": parent, "native_url": native_codex_url(session_id, path),
               "updated_at": updated_at, "prompt_tldr": prompt_tldr,
               "started_at": started_at, "finished_at": finished_at,
               "duration_ms": duration_ms, "token_usage": token_usage,
               # task_complete has no explicit self-assessed outcome field.
               "outcome": None}
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
