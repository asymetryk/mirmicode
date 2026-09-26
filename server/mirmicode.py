#!/usr/bin/env python3
"""Small standalone Mirmicode API and static server.

The public snapshot contains repository and session metadata only. Ingestion
requires a token read from a mounted file; no transcript content is stored.
"""

import argparse
import hmac
import ipaddress
import json
import os
import re
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MAX_INGEST_BYTES = 2_000_000
EDITOR_SESSION_SECONDS = 8 * 60 * 60
EDITOR_COOKIE = "mirmicode_editor"
STATIC_SOURCES = {"registry-seed"}
SCHEMA = """
CREATE TABLE IF NOT EXISTS repositories (
  repo_key TEXT PRIMARY KEY,
  label TEXT,
  github_url TEXT,
  openproject_url TEXT,
  openproject_name TEXT,
  buzz_url TEXT,
  stage TEXT,
  one_liner TEXT,
  source TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  buzz_channel_id TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  repo_key TEXT NOT NULL REFERENCES repositories(repo_key),
  harness TEXT NOT NULL,
  model TEXT,
  thread_name TEXT,
  status TEXT NOT NULL,
  parent_id TEXT,
  native_url TEXT,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  prompt_tldr TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  token_usage_json TEXT,
  outcome_json TEXT
);
CREATE TABLE IF NOT EXISTS source_runs (
  source TEXT PRIMARY KEY,
  observed_at TEXT NOT NULL,
  repository_count INTEGER NOT NULL,
  session_count INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'snapshot'
);
CREATE TABLE IF NOT EXISTS metadata_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL
);
INSERT OR IGNORE INTO metadata_state(singleton, revision) VALUES (1, 0);
CREATE TABLE IF NOT EXISTS map_settings (
  scope TEXT NOT NULL CHECK (scope IN ('repository', 'unit')),
  target_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(scope, target_key)
);
CREATE TABLE IF NOT EXISTS metadata_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  target_key TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
"""


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def connect(db_path):
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA)
    repository_columns = {row["name"] for row in db.execute("PRAGMA table_info(repositories)")}
    if "buzz_channel_id" not in repository_columns:
        db.execute("ALTER TABLE repositories ADD COLUMN buzz_channel_id TEXT")
    # Existing UAT databases predate the lifecycle detail fields. Keep the
    # migration additive so opening one preserves observations and metadata.
    session_columns = {row["name"] for row in db.execute("PRAGMA table_info(sessions)")}
    for name, declaration in (
        ("prompt_tldr", "TEXT"),
        ("started_at", "TEXT"),
        ("finished_at", "TEXT"),
        ("duration_ms", "INTEGER"),
        ("token_usage_json", "TEXT"),
        ("outcome_json", "TEXT"),
    ):
        if name not in session_columns:
            db.execute(f"ALTER TABLE sessions ADD COLUMN {name} {declaration}")
    source_columns = {row["name"] for row in db.execute("PRAGMA table_info(source_runs)")}
    if "mode" not in source_columns:
        db.execute("ALTER TABLE source_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'snapshot'")
    return db


def required_string(value, name, max_length=512):
    if not isinstance(value, str) or not value.strip() or len(value) > max_length:
        raise ValueError(f"{name} must be a nonempty string of at most {max_length} characters")
    return value.strip()


def optional_string(value, name, max_length=2048):
    if value is None:
        return None
    return required_string(value, name, max_length)


def validate_url(value, name):
    value = optional_string(value, name)
    if value is None:
        return None
    parts = urlsplit(value)
    if parts.scheme not in ("https", "codex") or not parts.netloc:
        raise ValueError(f"{name} must be an https or codex URL")
    return value


def validate_channel_id(value, name):
    value = optional_string(value, name, 36)
    if value is None:
        return None
    if not re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", value):
        raise ValueError(f"{name} must be a UUID")
    return value.lower()


def validate_edit_url(value, name):
    if value is None:
        return None
    value = required_string(value, name, 2048)
    parts = urlsplit(value)
    try:
        hostname = parts.hostname or ""
        port = parts.port
    except ValueError as exc:
        raise ValueError(f"{name} must contain a valid host and port") from exc
    dns_name = re.fullmatch(
        r"(?i)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*\.?",
        hostname,
    )
    try:
        ipaddress.ip_address(hostname)
        valid_host = True
    except ValueError:
        valid_host = bool(dns_name)
    if (parts.scheme != "https" or not parts.netloc or not hostname or not valid_host
            or parts.username or parts.password or "\\" in parts.netloc
            or any(ord(char) < 32 for char in value) or (port is not None and not 1 <= port <= 65535)):
        raise ValueError(f"{name} must be an https URL without credentials")
    return value


BUILDING_KINDS = {"pad", "depot", "turret", "refinery", "barracks", "lab"}
UNIT_ROLES = {"scout", "worker", "drone", "tankette", "walker", "medic",
              "mirmi-small", "mirmi-armed", "skiff", "builder"}


def validate_appearance(value, name, scope):
    if not isinstance(value, dict) or not value:
        raise ValueError(f"{name} must be a nonempty object")
    result = {}
    for key, item in value.items():
        if key == "color":
            if item is not None and (not isinstance(item, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", item)):
                raise ValueError("color must be a six-digit hex color or null")
            result[key] = item.lower() if isinstance(item, str) else None
        elif scope == "repository" and key == "building_set":
            if not isinstance(item, list) or any(not isinstance(kind, str) or kind not in BUILDING_KINDS for kind in item):
                raise ValueError("building_set must be an array of supported building kinds")
            if len(item) != len(set(item)):
                raise ValueError("building_set must not repeat building kinds")
            result[key] = item
        elif scope == "unit" and key == "unit_role":
            if item is not None and (not isinstance(item, str) or item not in UNIT_ROLES):
                raise ValueError("unit_role must be a supported role or null")
            result[key] = item
        else:
            raise ValueError(f"unsupported appearance field: {key}")
    return result


def validate_links(value):
    if not isinstance(value, dict) or not value:
        raise ValueError("links must be a nonempty object")
    names = {"github_url", "openproject_url", "buzz_url"}
    result = {}
    for key, item in value.items():
        if key not in names:
            raise ValueError(f"unsupported link field: {key}")
        result[key] = validate_edit_url(item, key)
    return result


def read_settings(db, scope, target_key):
    row = db.execute("SELECT payload_json FROM map_settings WHERE scope=? AND target_key=?",
                     (scope, target_key)).fetchone()
    return json.loads(row["payload_json"]) if row else {}


def update_metadata(db, payload, actor_id):
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    expected = payload.get("expected_revision")
    if isinstance(expected, bool) or not isinstance(expected, int) or expected < 0:
        raise ValueError("expected_revision must be a nonnegative integer")
    repo_key = required_string(payload.get("repo_key"), "repo_key")
    repository_patch = {}
    repository_resets = {}
    if "appearance" in payload:
        repository_patch["appearance"] = validate_appearance(payload["appearance"], "appearance", "repository")
    if "links" in payload:
        repository_patch["links"] = validate_links(payload["links"])
    unit_id = payload.get("unit_id")
    unit_patch = None
    unit_resets = {}
    if "unit_appearance" in payload:
        unit_id = required_string(unit_id, "unit_id")
        unit_patch = {"appearance": validate_appearance(payload["unit_appearance"], "unit_appearance", "unit")}
    reset = payload.get("reset", {})
    if not isinstance(reset, dict):
        raise ValueError("reset must be an object")
    for group, allowed in (("appearance", {"color", "building_set"}),
                           ("links", {"github_url", "openproject_url", "buzz_url"})):
        fields = reset.get(group, [])
        if not isinstance(fields, list) or any(not isinstance(field, str) or field not in allowed for field in fields):
            raise ValueError(f"reset.{group} must contain supported fields")
        if len(fields) != len(set(fields)):
            raise ValueError(f"reset.{group} must not repeat fields")
        if fields:
            if group in repository_patch and set(fields) & set(repository_patch[group]):
                raise ValueError(f"reset.{group} cannot also set the same field")
            repository_resets[group] = fields
    unit_fields = reset.get("unit_appearance", [])
    if not isinstance(unit_fields, list) or any(
        not isinstance(field, str) or field not in {"color", "unit_role"} for field in unit_fields
    ):
        raise ValueError("reset.unit_appearance must contain supported fields")
    if len(unit_fields) != len(set(unit_fields)):
        raise ValueError("reset.unit_appearance must not repeat fields")
    if unit_fields:
        unit_id = required_string(unit_id, "unit_id")
        if unit_patch and set(unit_fields) & set(unit_patch["appearance"]):
            raise ValueError("reset.unit_appearance cannot also set the same field")
        unit_resets["appearance"] = unit_fields
    elif unit_id is not None and unit_patch is None:
        raise ValueError("unit_id requires unit_appearance or reset.unit_appearance")
    if set(reset) - {"appearance", "links", "unit_appearance"}:
        raise ValueError("unsupported reset group")
    if not repository_patch and unit_patch is None and not repository_resets and not unit_resets:
        raise ValueError("at least one metadata field is required")

    now = utc_now()
    with db:
        db.execute("BEGIN IMMEDIATE")
        current = db.execute("SELECT revision FROM metadata_state WHERE singleton=1").fetchone()["revision"]
        if expected != current:
            raise RevisionConflict(current)
        if not db.execute("SELECT 1 FROM repositories WHERE repo_key=?", (repo_key,)).fetchone():
            raise ValueError("unknown repo_key")
        next_revision = current + 1
        updates = []
        if repository_patch or repository_resets:
            updates.append(("repository", repo_key, repository_patch, repository_resets))
        if unit_patch is not None or unit_resets:
            if not db.execute("SELECT 1 FROM sessions WHERE id=? AND repo_key=?", (unit_id, repo_key)).fetchone():
                raise ValueError("unit_id must identify a session in repo_key")
            updates.append(("unit", unit_id, unit_patch or {}, unit_resets))
        for scope, target, patch, resets in updates:
            before = read_settings(db, scope, target)
            after = dict(before)
            for group, values in patch.items():
                merged = dict(after.get(group, {}))
                merged.update(values)
                after[group] = merged
            for group, fields in resets.items():
                merged = dict(after.get(group, {}))
                for field in fields:
                    merged.pop(field, None)
                if merged:
                    after[group] = merged
                else:
                    after.pop(group, None)
            db.execute("""INSERT INTO map_settings VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(scope, target_key) DO UPDATE SET payload_json=excluded.payload_json,
                revision=excluded.revision, updated_at=excluded.updated_at""",
                (scope, target, json.dumps(after, separators=(",", ":")), next_revision, now))
            db.execute("""INSERT INTO metadata_audit
                (revision, actor_id, scope, target_key, before_json, after_json, changed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (next_revision, actor_id, scope, target,
                 json.dumps(before, separators=(",", ":")) if before else None,
                 json.dumps(after, separators=(",", ":")), now))
        db.execute("UPDATE metadata_state SET revision=? WHERE singleton=1", (next_revision,))
    return {"revision": next_revision}


class RevisionConflict(ValueError):
    def __init__(self, revision):
        super().__init__("metadata revision conflict")
        self.revision = revision


def editor_session_cookie(token, expires):
    message = f"mirmicode-editor-session:{expires}".encode("ascii")
    signature = hmac.new(token.encode("utf-8"), message, "sha256").hexdigest()
    return f"{expires}.{signature}"


def valid_editor_session(cookie_value, token, now=None):
    if not isinstance(cookie_value, str) or "." not in cookie_value:
        return False
    expires_text, signature = cookie_value.split(".", 1)
    if not expires_text.isdigit() or not re.fullmatch(r"[0-9a-f]{64}", signature):
        return False
    expires = int(expires_text)
    if expires <= int(time.time() if now is None else now):
        return False
    return hmac.compare_digest(editor_session_cookie(token, expires), cookie_value)


def validate_timestamp(value, name, nullable=False):
    if nullable and value is None:
        return None
    value = required_string(value, name, 64)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{name} must be an ISO timestamp") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{name} must include a timezone")
    return value


TOKEN_USAGE_FIELDS = (
    "input_tokens", "output_tokens", "cached_input_tokens",
    "reasoning_output_tokens", "total_tokens",
)
OUTCOME_STATES = {"achieved", "partial", "needs-help", "failed", "unassessed"}


def validate_token_usage(value):
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) - set(TOKEN_USAGE_FIELDS):
        raise ValueError("token_usage must be an object containing supported token fields")
    result = {}
    for name in TOKEN_USAGE_FIELDS:
        count = value.get(name)
        if count is not None and (isinstance(count, bool) or not isinstance(count, int) or count < 0):
            raise ValueError(f"token_usage.{name} must be a nonnegative integer or null")
        result[name] = count
    return result


def validate_outcome(value):
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) - {"state", "summary", "evidence"}:
        raise ValueError("outcome must contain only state, summary, and evidence")
    state = required_string(value.get("state"), "outcome.state", 80)
    if state not in OUTCOME_STATES:
        raise ValueError("outcome.state must be achieved, partial, needs-help, failed, or unassessed")
    summary = optional_string(value.get("summary"), "outcome.summary", 2000)
    evidence = value.get("evidence")
    if evidence is not None:
        if not isinstance(evidence, list) or len(evidence) > 20:
            raise ValueError("outcome.evidence must be an array of at most 20 strings or null")
        if any(not isinstance(item, str) or not item.strip() or len(item) > 1000 for item in evidence):
            raise ValueError("outcome.evidence items must be nonempty strings of at most 1000 characters")
    if state != "unassessed" and not evidence:
        raise ValueError("assessed outcomes require at least one evidence item")
    return {"state": state, "summary": summary, "evidence": evidence}


def ingest(db, payload, replace=True):
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    source = required_string(payload.get("source"), "source", 120)
    repositories = payload.get("repositories")
    sessions = payload.get("sessions")
    if not isinstance(repositories, list) or not isinstance(sessions, list):
        raise ValueError("repositories and sessions must be arrays")
    if len(repositories) > 5000 or len(sessions) > 20000:
        raise ValueError("batch too large")
    now = utc_now()
    with db:
        for entry in repositories:
            if not isinstance(entry, dict):
                raise ValueError("repository must be an object")
            key = required_string(entry.get("repo_key"), "repo_key")
            db.execute("""INSERT INTO repositories (
                repo_key, label, github_url, openproject_url, openproject_name,
                buzz_url, stage, one_liner, source, observed_at, buzz_channel_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(repo_key) DO UPDATE SET
                label=COALESCE(excluded.label, repositories.label),
                github_url=COALESCE(excluded.github_url, repositories.github_url),
                openproject_url=COALESCE(excluded.openproject_url, repositories.openproject_url),
                openproject_name=COALESCE(excluded.openproject_name, repositories.openproject_name),
                buzz_url=COALESCE(excluded.buzz_url, repositories.buzz_url),
                buzz_channel_id=COALESCE(excluded.buzz_channel_id, repositories.buzz_channel_id),
                stage=COALESCE(excluded.stage, repositories.stage),
                one_liner=COALESCE(excluded.one_liner, repositories.one_liner),
                source=excluded.source, observed_at=excluded.observed_at""", (
                key, optional_string(entry.get("label"), "label"),
                validate_url(entry.get("github_url"), "github_url"),
                validate_url(entry.get("openproject_url"), "openproject_url"),
                optional_string(entry.get("openproject_name"), "openproject_name"),
                validate_url(entry.get("buzz_url"), "buzz_url"),
                optional_string(entry.get("stage"), "stage", 40),
                optional_string(entry.get("one_liner"), "one_liner"), source, now,
                validate_channel_id(entry.get("buzz_channel_id"), "buzz_channel_id")
                if source == "registry-seed" else None,
            ))
        for entry in sessions:
            if not isinstance(entry, dict):
                raise ValueError("session must be an object")
            session_id = required_string(entry.get("id"), "id")
            previous = db.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone() if not replace else None
            if previous is not None:
                if previous["source"] != source:
                    raise ValueError("session id belongs to another source")
                incoming_at = validate_timestamp(entry.get("updated_at"), "updated_at")
                incoming_time = datetime.fromisoformat(incoming_at.replace("Z", "+00:00"))
                previous_time = datetime.fromisoformat(previous["updated_at"].replace("Z", "+00:00"))
                if incoming_time < previous_time or (
                    incoming_time == previous_time and previous["status"] != "working"
                    and entry.get("status") == "working"
                ):
                    continue  # A delayed hook cannot regress a completed turn.
                entry = dict(entry)
                for name, column in (
                    ("model", "model"), ("thread_name", "thread_name"),
                    ("parent_id", "parent_id"), ("native_url", "native_url"),
                ):
                    if entry.get(name) is None:
                        entry[name] = previous[column]
                if entry.get("status") != "working":
                    if entry.get("prompt_tldr") is None:
                        entry["prompt_tldr"] = previous["prompt_tldr"]
                    if entry.get("token_usage") is None and previous["token_usage_json"]:
                        entry["token_usage"] = json.loads(previous["token_usage_json"])
                    if entry.get("started_at") is None:
                        entry["started_at"] = previous["started_at"]
            repo_key = required_string(entry.get("repo_key"), "repo_key")
            status = required_string(entry.get("status"), "status", 40)
            if status not in ("working", "completed", "needs-attention", "unknown"):
                raise ValueError("invalid session status")
            prompt_tldr = optional_string(entry.get("prompt_tldr"), "prompt_tldr", 1200)
            started_at = validate_timestamp(entry.get("started_at"), "started_at", nullable=True)
            finished_at = validate_timestamp(entry.get("finished_at"), "finished_at", nullable=True)
            duration_ms = entry.get("duration_ms")
            if not replace and status != "working" and duration_ms is None and started_at and finished_at:
                elapsed = datetime.fromisoformat(finished_at.replace("Z", "+00:00")) - datetime.fromisoformat(
                    started_at.replace("Z", "+00:00")
                )
                duration_ms = max(0, int(elapsed.total_seconds() * 1000))
            if duration_ms is not None and (
                isinstance(duration_ms, bool) or not isinstance(duration_ms, int) or duration_ms < 0
            ):
                raise ValueError("duration_ms must be a nonnegative integer or null")
            token_usage = validate_token_usage(entry.get("token_usage"))
            outcome = validate_outcome(entry.get("outcome"))
            db.execute("""INSERT INTO sessions (
                id, repo_key, harness, model, thread_name, status, parent_id, native_url,
                updated_at, source, observed_at, prompt_tldr, started_at, finished_at,
                duration_ms, token_usage_json, outcome_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                repo_key=excluded.repo_key, harness=excluded.harness,
                model=excluded.model, thread_name=excluded.thread_name,
                status=excluded.status, parent_id=excluded.parent_id,
                native_url=excluded.native_url, updated_at=excluded.updated_at,
                source=excluded.source, observed_at=excluded.observed_at,
                prompt_tldr=excluded.prompt_tldr, started_at=excluded.started_at,
                finished_at=excluded.finished_at, duration_ms=excluded.duration_ms,
                token_usage_json=excluded.token_usage_json, outcome_json=excluded.outcome_json""", (
                session_id, repo_key, required_string(entry.get("harness"), "harness", 80),
                optional_string(entry.get("model"), "model", 120),
                optional_string(entry.get("thread_name"), "thread_name"), status,
                optional_string(entry.get("parent_id"), "parent_id"),
                validate_url(entry.get("native_url"), "native_url"),
                validate_timestamp(entry.get("updated_at"), "updated_at"), source, now,
                prompt_tldr, started_at, finished_at, duration_ms,
                json.dumps(token_usage, separators=(",", ":")) if token_usage is not None else None,
                json.dumps(outcome, separators=(",", ":")) if outcome is not None else None,
            ))
        if replace:
            # Snapshot sources publish a complete recent window.
            ids = [required_string(entry.get("id"), "id") for entry in sessions]
            if ids:
                db.execute("DELETE FROM sessions WHERE source=? AND id NOT IN (" + ",".join("?" for _ in ids) + ")",
                           [source, *ids])
            else:
                db.execute("DELETE FROM sessions WHERE source=?", (source,))
        else:
            # Hook sources publish one observation at a time; keep sibling
            # threads and recent completions, but bound the retained window.
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat(timespec="seconds").replace("+00:00", "Z")
            db.execute("DELETE FROM sessions WHERE source=? AND updated_at<?", (source, cutoff))
        counts = db.execute("SELECT COUNT(DISTINCT repo_key), COUNT(*) FROM sessions WHERE source=?", (source,)).fetchone()
        db.execute("""INSERT INTO source_runs(source, observed_at, repository_count, session_count, mode)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(source) DO UPDATE SET observed_at=excluded.observed_at,
            repository_count=excluded.repository_count, session_count=excluded.session_count,
            mode=excluded.mode""",
            (source, now, counts[0], counts[1], "snapshot" if replace else "event"))
    return {"source": source, "repositories": len(repositories), "sessions": len(sessions)}


def snapshot(db, stale_after_seconds=180, include_prompt_tldr=False):
    metadata_revision = db.execute("SELECT revision FROM metadata_state WHERE singleton=1").fetchone()["revision"]
    runs = db.execute("SELECT * FROM source_runs").fetchall()
    if not runs:
        return {"source": "mirmicode", "fetched_at": utc_now(), "stale": True,
                "notice": "No source has reported yet.", "metadata_revision": metadata_revision,
                "camps": [], "units": []}
    now = datetime.now(timezone.utc)
    stale_sources = set()
    for run in runs:
        if run["source"] in STATIC_SOURCES or run["mode"] == "event":
            continue
        observed = datetime.fromisoformat(run["observed_at"].replace("Z", "+00:00"))
        if (now - observed).total_seconds() > stale_after_seconds:
            stale_sources.add(run["source"])
    camps = []
    for row in db.execute("SELECT * FROM repositories ORDER BY repo_key"):
        settings = read_settings(db, "repository", row["repo_key"])
        links = settings.get("links", {})
        appearance = settings.get("appearance", {})
        observed_links = {
            "github_url": row["github_url"],
            "openproject_url": row["openproject_url"],
            "buzz_url": row["buzz_url"],
        }
        link_provenance = {
            name: "manual" if name in links else ("observation" if value else "none")
            for name, value in observed_links.items()
        }
        camps.append({"repo_key": row["repo_key"], "repo_label": row["label"],
                      "github_url": links.get("github_url", row["github_url"]), "stage": row["stage"],
                      "one_liner": row["one_liner"],
                      "buzz_channel_id": row["buzz_channel_id"],
                      "open_project": {"name": row["openproject_name"],
                                       "url": links.get("openproject_url", row["openproject_url"])}
                      if links.get("openproject_url", row["openproject_url"]) else None,
                      "buzz_url": links.get("buzz_url", row["buzz_url"]),
                      "appearance": {"color": appearance.get("color"),
                                     "building_set": appearance.get("building_set")},
                      "links": {"github_url": links.get("github_url", row["github_url"]),
                                "openproject_url": links.get("openproject_url", row["openproject_url"]),
                                "buzz_url": links.get("buzz_url", row["buzz_url"])},
                      "link_provenance": link_provenance})
    units = []
    for row in db.execute("SELECT * FROM sessions ORDER BY updated_at DESC"):
        touched = datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00"))
        status = "unknown" if row["source"] in stale_sources or (
            row["status"] == "working" and (now - touched).total_seconds() > 900
        ) else row["status"]
        unit_appearance = read_settings(db, "unit", row["id"]).get("appearance", {})
        token_usage = json.loads(row["token_usage_json"]) if row["token_usage_json"] else None
        outcome = json.loads(row["outcome_json"]) if row["outcome_json"] else None
        units.append({"id": row["id"], "repo_key": row["repo_key"],
                      "harness": row["harness"], "model": row["model"],
                      "thread_name": row["thread_name"], "status": status,
                      "parent_id": row["parent_id"], "native_url": row["native_url"],
                      "updated_at": row["updated_at"],
                      "prompt_tldr": row["prompt_tldr"] if include_prompt_tldr else None,
                      "started_at": row["started_at"], "finished_at": row["finished_at"],
                      "duration_ms": row["duration_ms"], "token_usage": token_usage,
                      "outcome": outcome,
                      "appearance": {"color": unit_appearance.get("color"),
                                     "unit_role": unit_appearance.get("unit_role")},
                      "destination": {"kind": "repo", "value": row["repo_key"]}})
    latest_session_by_repo = {}
    for unit in units:
        candidate_time = datetime.fromisoformat(unit["updated_at"].replace("Z", "+00:00"))
        current = latest_session_by_repo.get(unit["repo_key"])
        if current is None or candidate_time > current[0]:
            latest_session_by_repo[unit["repo_key"]] = (candidate_time, unit)
    for camp in camps:
        latest = latest_session_by_repo.get(camp["repo_key"])
        unit = latest[1] if latest else None
        camp["latest_thread"] = ({"id": unit["id"], "title": unit["thread_name"],
                                  "url": unit["native_url"], "updated_at": unit["updated_at"]}
                                 if unit and unit["native_url"] else None)
    return {"source": "mirmicode", "fetched_at": utc_now(),
            "stale": bool(stale_sources),
            "notice": f"Waiting for {len(stale_sources)} source(s) to report." if stale_sources else None,
            "metadata_revision": metadata_revision, "camps": camps, "units": units}


def make_handler(db_path, static_dir, token_file, editor_token_file):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(static_dir), **kwargs)

        def _json(self, code, payload):
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/healthz":
                with connect(db_path) as db:
                    db.execute("SELECT 1")
                self._json(200, {"ok": True})
            elif path == "/api/v1/snapshot":
                expected = self._editor_token()
                include_prompt_tldr = expected is not None and self._cookie_session_valid(expected)
                with connect(db_path) as db:
                    self._json(200, snapshot(db, include_prompt_tldr=include_prompt_tldr))
            elif path == "/api/v1/session":
                expected = self._editor_token()
                if expected is None:
                    self._json(503, {"error": "editing_unavailable"})
                elif self._cookie_session_valid(expected):
                    self._json(200, {"authenticated": True})
                else:
                    self._json(401, {"authenticated": False})
            elif path.startswith("/api/"):
                self._json(404, {"error": "not_found"})
            else:
                super().do_GET()

        def do_POST(self):
            path = urlsplit(self.path).path
            if path == "/api/v1/session":
                self._create_editor_session()
                return
            if path not in ("/api/v1/ingest", "/api/v1/events"):
                self._json(404, {"error": "not_found"})
                return
            try:
                expected = Path(token_file).read_text(encoding="utf-8").strip()
            except OSError:
                self._json(503, {"error": "ingestion_unavailable"})
                return
            authorization = self.headers.get("Authorization", "")
            supplied = authorization[7:] if authorization.startswith("Bearer ") else ""
            if not expected or not supplied or not hmac.compare_digest(supplied, expected):
                self._json(401, {"error": "unauthorized"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if size < 1 or size > MAX_INGEST_BYTES:
                    raise ValueError("invalid payload size")
                payload = json.loads(self.rfile.read(size))
                with connect(db_path) as db:
                    result = ingest(db, payload, replace=path != "/api/v1/events")
            except (ValueError, json.JSONDecodeError, sqlite3.IntegrityError) as exc:
                self._json(400, {"error": str(exc)})
                return
            self._json(200, result)

        def do_DELETE(self):
            if urlsplit(self.path).path != "/api/v1/session":
                self._json(404, {"error": "not_found"})
                return
            if not self._request_origin_is_same_site():
                self._json(403, {"error": "same_origin_required"})
                return
            self.send_response(204)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Set-Cookie", f"{EDITOR_COOKIE}=; Max-Age=0; Path=/api/v1; HttpOnly; Secure; SameSite=Strict")
            self.end_headers()

        def _editor_token(self):
            try:
                expected = Path(editor_token_file).read_text(encoding="utf-8").strip()
            except OSError:
                return None
            return expected or None

        def _request_origin_is_same_site(self):
            origin = self.headers.get("Origin")
            host = self.headers.get("Host", "")
            if not origin or not host:
                return False
            parts = urlsplit(origin)
            return parts.scheme == "https" and parts.netloc.lower() == host.lower()

        def _cookie_session_valid(self, expected):
            cookie_header = self.headers.get("Cookie", "")
            cookie_value = next((part.strip().split("=", 1)[1] for part in cookie_header.split(";")
                                 if part.strip().startswith(EDITOR_COOKIE + "=")), "")
            return valid_editor_session(cookie_value, expected)

        def _create_editor_session(self):
            if not self._request_origin_is_same_site():
                self._json(403, {"error": "same_origin_required"})
                return
            expected = self._editor_token()
            if expected is None:
                self._json(503, {"error": "editing_unavailable"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if size < 1 or size > 2_000:
                    raise ValueError("invalid payload size")
                payload = json.loads(self.rfile.read(size))
                supplied = payload.get("token") if isinstance(payload, dict) else None
            except (ValueError, json.JSONDecodeError):
                self._json(400, {"error": "invalid_payload"})
                return
            if not isinstance(supplied, str) or not supplied or not hmac.compare_digest(supplied, expected):
                self._json(401, {"error": "unauthorized"})
                return
            expires = int(time.time()) + EDITOR_SESSION_SECONDS
            cookie = editor_session_cookie(expected, expires)
            self.send_response(204)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Set-Cookie", f"{EDITOR_COOKIE}={cookie}; Max-Age={EDITOR_SESSION_SECONDS}; Path=/api/v1; HttpOnly; Secure; SameSite=Strict")
            self.end_headers()

        def do_PUT(self):
            if urlsplit(self.path).path != "/api/v1/metadata":
                self._json(404, {"error": "not_found"})
                return
            expected = self._editor_token()
            if expected is None:
                self._json(503, {"error": "editing_unavailable"})
                return
            authorization = self.headers.get("Authorization", "")
            supplied = authorization[7:] if authorization.startswith("Bearer ") else ""
            bearer_valid = bool(supplied and hmac.compare_digest(supplied, expected))
            cookie_valid = self._cookie_session_valid(expected)
            if not bearer_valid and not cookie_valid:
                self._json(401, {"error": "unauthorized"})
                return
            if cookie_valid and not bearer_valid and not self._request_origin_is_same_site():
                self._json(403, {"error": "same_origin_required"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if size < 1 or size > 16_000:
                    raise ValueError("invalid payload size")
                payload = json.loads(self.rfile.read(size))
                actor_id = "editor:" + hmac.new(expected.encode(), b"mirmicode-editor", "sha256").hexdigest()[:12]
                with connect(db_path) as db:
                    result = update_metadata(db, payload, actor_id)
            except RevisionConflict as exc:
                self._json(409, {"error": "revision_conflict", "revision": exc.revision})
                return
            except (ValueError, json.JSONDecodeError, sqlite3.IntegrityError) as exc:
                self._json(400, {"error": str(exc)})
                return
            self._json(200, result)

        def log_message(self, format, *args):
            # Avoid request logs, especially headers or query strings.
            pass

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--db", default=os.environ.get("MIRMICODE_DB", "/data/mirmicode.sqlite3"))
    parser.add_argument("--static", default=os.environ.get("MIRMICODE_STATIC", "/app/dist"))
    parser.add_argument("--token-file", default=os.environ.get("MIRMICODE_TOKEN_FILE", "/run/secrets/ingest-token"))
    parser.add_argument("--editor-token-file", default=os.environ.get("MIRMICODE_EDITOR_TOKEN_FILE", "/run/secrets/editor-token"))
    args = parser.parse_args()
    with connect(args.db):
        pass
    ThreadingHTTPServer((args.host, args.port), make_handler(args.db, args.static, args.token_file, args.editor_token_file)).serve_forever()


if __name__ == "__main__":
    main()
