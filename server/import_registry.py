#!/usr/bin/env python3
"""Preview or seed verified repository associations into standalone Mirmicode."""

import argparse
import hashlib
import ipaddress
import json
import re
import sys
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener


def normalize_origin(value):
    """Return a stable verified origin identity, or None for unsupported forms."""
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    # Local checkout paths have no browser destination and should never be
    # exposed in the public snapshot or dry-run payload. Hash the exact
    # absolute registry origin to get a stable opaque key.
    if raw.startswith("local:/") and not any(ord(char) < 32 for char in raw):
        local_path = raw[len("local:"):]
        path_parts = PurePosixPath(local_path).parts
        if ".." in path_parts:
            return None
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        return "local:sha256:" + digest
    if raw.lower().startswith("git@github.com:"):
        path = raw.split(":", 1)[1]
        host = "github.com"
    elif raw.lower().startswith("github.com/"):
        host = "github.com"
        path = raw[len("github.com/"):]
    elif raw.lower().startswith("origin.cursor.com/"):
        host = "origin.cursor.com"
        path = raw[len("origin.cursor.com/"):]
    else:
        try:
            parts = urlsplit(raw)
            port = parts.port
        except ValueError:
            return None
        host = (parts.hostname or "").lower()
        if parts.scheme not in ("https", "http", "ssh") or host not in ("github.com", "origin.cursor.com"):
            return None
        if parts.username and (parts.scheme != "ssh" or parts.username != "git"):
            return None
        if parts.password or port not in (None, 22, 443):
            return None
        path = parts.path.lstrip("/")
    path = path.strip("/")
    if path.lower().endswith(".git"):
        path = path[:-4]
    pieces = path.split("/")
    if len(pieces) != 2 or any(not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", part) for part in pieces):
        return None
    owner, repo = (part.lower() for part in pieces)
    if owner in (".", "..") or repo in (".", ".."):
        return None
    return f"{host}/{owner}/{repo}"


def build_seed(registry):
    if not isinstance(registry, dict) or not isinstance(registry.get("verified_origins"), list):
        raise ValueError("registry must contain a verified_origins array")

    raw_entries = registry["verified_origins"]
    repositories = {}
    conflicted = set()
    duplicate_entries = 0
    conflicting_entries = 0
    invalid_origin_entries = 0
    missing_association_entries = 0

    for entry in raw_entries:
        if not isinstance(entry, dict):
            invalid_origin_entries += 1
            continue
        origin = normalize_origin(entry.get("origin"))
        if not origin:
            invalid_origin_entries += 1
            continue
        op = entry.get("openproject")
        identifier = op.get("identifier") if isinstance(op, dict) else None
        op_url = op.get("url") if isinstance(op, dict) else None
        if not isinstance(identifier, str) or not identifier.strip() or not isinstance(op_url, str) or not op_url.strip():
            missing_association_entries += 1
            continue
        try:
            op_parts = urlsplit(op_url)
        except ValueError:
            missing_association_entries += 1
            continue
        if (op_parts.scheme != "https" or not op_parts.netloc or op_parts.username or op_parts.password
                or any(ord(char) < 32 for char in op_url)):
            missing_association_entries += 1
            continue
        association = (identifier, op_url)
        if origin in conflicted:
            conflicting_entries += 1
            continue
        if origin in repositories:
            existing = repositories[origin]
            if (existing["openproject_name"], existing["openproject_url"]) != association:
                repositories.pop(origin, None)
                conflicted.add(origin)
                conflicting_entries += 2
            else:
                duplicate_entries += 1
            continue
        repositories[origin] = {
            "repo_key": origin,
            # Keep collector observation fields null; local identities get a
            # safe basename label without publishing their source path.
            "label": local_display_label(entry.get("origin"), origin),
            # Only GitHub identities have a verified browser URL in this registry.
            "github_url": "https://" + origin if origin.startswith("github.com/") else None,
            "openproject_url": op_url,
            "openproject_name": identifier,
            # The registry only has a Hive channel ID, not a verified browser URL.
            "buzz_url": None,
            # New camps normalize null to unknown; existing observed stages survive COALESCE.
            "stage": None,
            "one_liner": None,
        }

    local_repositories = registry.get("local_repositories")
    identity_pending = registry.get("identity_pending")
    reconciliation_pending = registry.get("reconciliation_pending")
    originless_local_count = len(local_repositories) if isinstance(local_repositories, list) else 0
    identity_pending_count = len(identity_pending) if isinstance(identity_pending, list) else 0
    reconciliation_pending_count = len(reconciliation_pending) if isinstance(reconciliation_pending, list) else 0
    sorted_origins = sorted(repositories)
    payload = {
        "source": "registry-seed",
        "repositories": [repositories[origin] for origin in sorted_origins],
        "sessions": [],
    }
    summary = {
        "source": payload["source"],
        "verified_origin_entries": len(raw_entries),
        "camp_count": len(payload["repositories"]),
        "session_count": 0,
        "duplicate_entries_deduplicated": duplicate_entries,
        "conflicting_entries_omitted": conflicting_entries,
        "conflicting_origins_omitted": len(conflicted),
        "omissions": {
            "invalid_origin_entries": invalid_origin_entries,
            "missing_openproject_association_entries": missing_association_entries,
            "originless_local_repositories": originless_local_count,
            "identity_pending_entries": identity_pending_count,
            "reconciliation_pending_entries": reconciliation_pending_count,
        },
    }
    return {"summary": summary, "deduped_origins": sorted_origins,
            "conflicting_origins": sorted(conflicted), "payload": payload}


def local_display_label(raw_origin, repo_key):
    if not repo_key.startswith("local:sha256:") or not isinstance(raw_origin, str):
        return None
    name = PurePosixPath(raw_origin[len("local:"):]).name
    if name.lower().endswith(".git"):
        name = name[:-4]
    # Keep a useful basename while excluding path/control data from the label.
    name = "".join(char for char in name if ord(char) >= 32 and ord(char) != 127)
    return name[:120] or "Local repository"


def validate_endpoint(endpoint):
    if not isinstance(endpoint, str):
        raise ValueError("endpoint must be an HTTPS origin or a loopback HTTP origin")
    try:
        parts = urlsplit(endpoint)
        host = parts.hostname
        # Force validation of malformed ports and bracketed IPv6 authorities.
        _ = parts.port
    except ValueError:
        raise ValueError("endpoint must be an HTTPS origin or a loopback HTTP origin") from None
    if (not parts.netloc or not host or parts.username or parts.password or parts.path not in ("", "/")
            or parts.query or parts.fragment
            or any(ord(char) < 32 for char in endpoint)):
        raise ValueError("endpoint must be an HTTPS origin or a loopback HTTP origin")
    if parts.scheme == "https":
        return endpoint.rstrip("/")
    if parts.scheme == "http":
        host = host.lower()
        try:
            loopback = ipaddress.ip_address(host).is_loopback
        except ValueError:
            loopback = host == "localhost"
        if loopback:
            return endpoint.rstrip("/")
    raise ValueError("HTTP is allowed only for a loopback endpoint")


def post_seed(endpoint, token_file, payload):
    endpoint = validate_endpoint(endpoint)
    token = Path(token_file).read_text(encoding="utf-8").strip()
    if not token:
        raise ValueError("token file is empty")
    request = Request(
        endpoint + "/api/v1/ingest",
        json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        {"Content-Type": "application/json", "Authorization": "Bearer " + token},
        method="POST",
    )
    # Avoid routing private UAT traffic through workstation proxy settings.
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(request, timeout=20) as response:
            if response.status != 200:
                raise RuntimeError(f"seed ingest failed: HTTP {response.status}")
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        # Do not include request headers or credentials in failure output.
        raise RuntimeError(f"seed ingest failed: {type(exc).__name__}") from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", default="/Users/howard/.agent_charter/REPO_REGISTRY.json")
    parser.add_argument("--endpoint", help="HTTPS UAT origin, required with --apply")
    parser.add_argument("--token-file", help="private ingestion token file, required with --apply")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="print a reviewable preview (default)")
    mode.add_argument("--apply", action="store_true", help="POST the seed through authenticated ingest")
    args = parser.parse_args(argv)

    try:
        registry = json.loads(Path(args.registry).read_text(encoding="utf-8"))
        result = build_seed(registry)
        if args.apply:
            if not args.endpoint or not args.token_file:
                parser.error("--apply requires --endpoint and --token-file")
            response = post_seed(args.endpoint, args.token_file, result["payload"])
            output = {"mode": "applied", "summary": result["summary"], "ingest": response}
        else:
            output = {"mode": "dry-run", **result}
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"registry seed failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
