# Mirmicode native feed — contract v0

**Principle:** clean and fresh. CAHQ / agentinfra Working Set is **example plumbing only**, not a product dependency. No label-only destinations. No invented repos.

## Source of truth

| Layer | Owner | Notes |
|---|---|---|
| Validated associations | Baserow `CampAssociations` (db 253 / table 888) | Map trusts `status=ok` only |
| Camp + unit snapshot | mirmicode-native feed (this contract) | Served to the map UI |
| Art / UI | `asymetryk/mirmicode` | BIP + private |

## Objects

### Camp
```json
{
  "repo_key": "agentinfra",
  "repo_label": "agentinfra",
  "github_url": "https://github.com/asymetryk/agentinfra",
  "stage": "active",
  "open_project": {
    "id": 123,
    "key": "coding-agent-hq",
    "name": "Coding Agent HQ",
    "url": "https://openproject.example/projects/coding-agent-hq"
  },
  "one_liner": optional string,
  "aliases": ["agentinfra", "cahq"]
}
```
Rules:
- `repo_key` required, unique, stable.
- `open_project` only when association `status=ok` in Baserow (or explicit override).
- Empty camps (no units) are allowed and honest.

### Unit
```json
{
  "id": "stable-id",
  "repo_key": "agentinfra",
  "harness": "omp",
  "model": "MiniMax-M3",
  "thread_name": optional string,
  "status": "open",
  "destination": {
    "kind": "repo",
    "value": "asymetryk/agentinfra"
  },
  "updated_at": "RFC3339"
}
```
Rules:
- `repo_key` **required**. Drop the unit if unknown — do not emit `destination.kind=label`.
- `destination.kind` is only `repo` | `path` (path optional; never `label`).
- Public BIP must scrub prompts / secrets; this contract does not carry prompt bodies.

## Feed endpoints (v0)

- `GET /feed/v0/camps` → `{ fetched_at, camps: Camp[] }`
- `GET /feed/v0/units` → `{ fetched_at, units: Unit[] }`  
  or combined `GET /feed/v0/snapshot` → camps + units.

Implementation may start as **static JSON baked at build** (from Baserow export + a small unit file), then grow a Worker/cron. No CAHQ client in v0.

## Adapters (allowed sources)

1. **Baserow CampAssociations** — camps + OP links (`status=ok`).
2. **Explicit unit ledger** — JSON/CSV/API we control (manual or future collectors).
3. Later: first-party collectors modeled *after* cahq lessons, owned by mirmicode — never import cahq WS blobs wholesale.

## Non-goals (v0)

- Reading `coding-agent-hq` Working Set API.
- ConfigMap `REPO_MAP` generation for cahq.
- Cursor metadata DB scraping.
- Building cosmetics / sprite fixes.

## Acceptance

- [ ] Contract doc in `asymetryk/mirmicode` (`docs/feed-contract-v0.md`)
- [ ] Fixture snapshot with ≥1 camp `ok` + ≥0 units obeying rules
- [ ] Map adapter can load feed without calling cahq (feature flag / default path)
- [ ] Public mode still scrubs sensitive fields

## Private note

Existing private map may keep interim cahq wiring until cutover; it is not the release architecture.
