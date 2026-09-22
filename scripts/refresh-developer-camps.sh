#!/usr/bin/env bash
# Regenerate src/data/all-repos.json from Howard's ~/Developer checkouts.
#
# Run this on the Mac that holds the tree. A cloud agent cannot see
# ~/Developer. Do not bake camps from `gh repo list`: a private credential
# failed (GET /user returned 403, and an unscoped `gh repo list` only saw
# asymetryk/mirmicode). The public 10-repo list is retired.
#
# Usage, from the mirmicode repo root:
#   ./scripts/refresh-developer-camps.sh
#   DEVELOPER_ROOT=/Users/howard/Developer ./scripts/refresh-developer-camps.sh
#   ./scripts/refresh-developer-camps.sh --scan src/data/developer-camps.scan.json
#
# What a live run does:
#   1. Lists top-level directories under DEVELOPER_ROOT (default: ~/Developer).
#      Names starting with '.' are ignored. `_`* folders are scanned and then
#      skipped by the camp rules.
#   2. Reads `git remote get-url origin` when the folder has a .git directory.
#   3. Keeps owner/name from that URL. A folder with no remote still counts;
#      its camp id is the folder name, so a local-only project shows as an
#      empty camp.
#   4. Applies the skip and collapse rules in src/developerCamps.ts:
#      `_`*, *-worktrees, *stale*, *partial*, agentinfra-* (except bare
#      agentinfra), agentos-* (except bare agentos), *-upstream, dtr-app-*
#      (except bare dtr-app), mirmicode-* clones, shi-presentation-builder-*
#      extras, PR clones (*-pr), work packets (*wp<digits>), versioned release
#      snapshots, spaced-vs-kebab and `.git` duplicates, one proposal-generator
#      primary, bare dtr-site (redesigns drop), and agentworkforce plus the
#      separate agentworkforce-runtime product.
#   5. Overwrites src/data/all-repos.json. Review the diff and commit it.
#      The browser never calls GitHub; loadFixture and loadWorkingSet merge
#      this file after normalize. A Working Set repo keeps its units. A catalog
#      name with no units is an empty camp.
#
# The 2026-09-22 preliminary scan also left out Asymetryk-Infrastructure-Cortex
# and asymetryk-site before these rules ran. A fresh directory walk includes
# any folder the rules do not skip.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

scan_file=""
developer_root="${DEVELOPER_ROOT:-${HOME}/Developer}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scan)
      scan_file="${2:-}"
      if [[ -z "$scan_file" ]]; then
        echo "refresh-developer-camps: --scan needs a file path" >&2
        exit 1
      fi
      shift 2
      ;;
    *)
      echo "refresh-developer-camps: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

fetched_on="$(date -u +%F)"

if [[ -n "$scan_file" ]]; then
  node --disable-warning=ExperimentalWarning --experimental-strip-types ./scripts/write-developer-catalog.ts \
    --input "$scan_file" \
    --out src/data/all-repos.json \
    --fetched-on "$fetched_on" \
    --detail "Rebaked from ${scan_file} on ${fetched_on}."
  exit 0
fi

if [[ ! -d "$developer_root" ]]; then
  echo "refresh-developer-camps: directory not found: $developer_root" >&2
  echo "Set DEVELOPER_ROOT, or pass --scan with a developer-camps scan JSON file." >&2
  exit 1
fi

node --disable-warning=ExperimentalWarning --experimental-strip-types ./scripts/write-developer-catalog.ts \
  --root "$developer_root" \
  --out src/data/all-repos.json \
  --fetched-on "$fetched_on" \
  --detail "Scanned ${developer_root} on ${fetched_on}."
