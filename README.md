# Mirmicode

**Macro the project. Micro the agents.**

Bird’s-eye map of an agent campaign. A **base** is a repo outpost. A **faction** is a harness, and each faction has its own painted body — Cursor angular, Codex organic, OhMyPi mechanical. A **unit** is one agent on that outpost, a Mirmi. The **model picks the silhouette** from the v2 atlas: scout, worker, drone, tankette, walker, medic, mirmi, armed, skiff, or builder. The same model wears the same silhouette on whichever faction body it stands on. Idle and working add a ground marker. Blocked adds a red slash. The repo name and last touch stay in the HUD.

Build in public. Not monetized. No accounts, no payments, no analytics.

![Multi-type squads on the four bases](docs/bases-map.png)

![Selected Cursor walker in the HUD](docs/selected-hud.png)

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173. The map loads the committed sample fixture: four bases, each with a multi-type squad from more than one faction, plus pad, depot, turret, refinery, barracks, lab, and a few resource props.

```bash
npm test
npm run build
npm run preview
```

`preview` serves the static build at http://127.0.0.1:4173.

Drag to pan. Scroll to zoom. **Select** a unit to read its harness, model, thread, and status in the HUD. **Attach** locks the view on that unit’s base. The **minimap** jumps the view. Escape detaches. These are view controls. The map does not send orders to agents.

The legend under the title groups the atlas: faction bodies, the ten unit types, and the field (buildings and resource props). It does not list every file in the pack.

## Sprites

The map draws the staged v2 pack in `public/rts-art-v2/` (`STAGED.txt` is the file list). v1 art in `public/rts-art/` stays as the fallback when a mapping has no v2 file. v2 PNGs ship with a flat backdrop; the map keys that backdrop out at display time and does not replace the files.

A known model always picks one silhouette. A type word in the model string (`Scout`, `Mirmi-armed`) picks that sprite directly.

| Model | Silhouette | v2 file stem |
| --- | --- | --- |
| Astra, Scout | Scout | `scout-bot-01` |
| Luna, Worker | Worker | `worker-bot-02` |
| Terra, Drone | Drone | `drone-05` |
| Sol, Tankette | Tankette | `tankette-06` |
| Grok-4.6, Walker | Walker | `walker-07` |
| Gemini, Medic | Medic | `medic-bot-09` |
| MiniMax, Mirmi-small | Mirmi | `mirmi-small-03` |
| Kimi, Mirmi-armed | Armed | `mirmi-armed-04` |
| Skiff | Skiff | `skiff-08` |
| Builder | Builder | `builder-bot-10` |

The file is `units/{cursor|codex|ohmypi}-{stem}.png`. OpenCode and other harnesses use the neutral body when that file was staged.

Each base also shows a v2 outpost kit for the plurality faction: pad (the clickable base), depot, turret, refinery, barracks, and lab, plus crystal, biomass, and scrap props. A tie still breaks toward Cursor, then Codex, then OhMyPi. In the sample fixture that is Cursor on `asymetryk/mirmicode`, Codex on `example/charter` and `example/prompt-lab`, and OhMyPi on `example/ops-board`.

Working units get `fx/{faction}-work-marker-02.png`. Idle units get `fx/{faction}-idle-marker-01.png`. Selection is still a ring. Working still adds a faction-colored glow. Blocked still adds a red slash. Idle still dims the sprite.

### Wired vs staged-but-unused

Wired on the map: all ten unit roles for Cursor, Codex, and OhMyPi; neutral unit bodies as the fallback where the file exists; pad, depot, turret, refinery, barracks, and lab; crystal, biomass, and scrap; idle and work markers.

Staged but not drawn:

- `ui/neutral-alert-badge-04.png`
- `ui/neutral-button-plate-02.png`
- `ui/neutral-panel-corner-01.png`
- `ui/neutral-resource-pip-03.png`

Not in the staged subset, so they are not referenced: neutral pad, neutral mirmi-small, neutral mirmi-armed, neutral skiff. A missing v2 unit falls back to the v1 hero plus crest when that harness has one. A harness with neither (OpenCode on an unmapped model) keeps its faction color and a plain token.

v1 crests, used only on that fallback:

| Crest | File | Models |
| --- | --- | --- |
| A | `glyph-model-a.png` | Astra, Sol, MiniMax |
| B | `glyph-model-b.png` | Luna, Grok-4.6, Kimi |
| C | `glyph-model-c.png` | Terra, Gemini |

## Sample data

`src/data/sample-bases.json` is the map fallback: synthetic metadata so the map runs with nothing else reachable. `example/*` repos are not live telemetry. The status line says `Fixture · sample data`.

Each base carries a mixed squad, not one hero. `asymetryk/mirmicode` is a Cursor majority (Grok-4.6 walker, Gemini medic, plus scout, drone, builder, and tankette) with Codex Luna and Skiff and OhMyPi Kimi and Medic. The other bases are a Codex charter, an OhMyPi ops board, and a Codex prompt lab. Together the fixture fields every v2 silhouette.

`src/data/cahq-working-set.sample.json` is a separate flat `agents` document in the Working Set field shape (several units sharing a repo). It is also synthetic. It is not a capture from the tailnet host. Tests run it through the same normalizer the live fetch uses.

## Live Working Set vs fixture

CAHQ Working Set is the live source of truth: metadata only, for Cursor, Codex, OhMyPi, and OpenCode surfaces. This client does not vendor that service. OpenCode still renders as its own faction color if a payload names it.

Verified from Howard's tailnet Mac: DNS resolves, TLS certificate verification succeeds, `/` returns HTTP 200 HTML (the SPA), and `/api/v1/working-set` returns HTTP 200 `application/json`. The API does not send a CORS allow-origin header in the verified response, so use the same-origin development proxy below for browser access.

### What the client does

- **Fixture path.** Default when `VITE_WORKING_SET_URL` is empty and this browser has not saved a URL. No network. `loadFixture()` normalizes `src/data/sample-bases.json`.
- **Live path.** Paste a URL in **Data source**, or set `VITE_WORKING_SET_URL` (see `.env.example`). A root URL without a query resolves to `/api/v1/working-set`; an explicit endpoint path or query is preserved. Fragments are removed. The browser sends an unauthenticated `GET` with `Accept: application/json`, `credentials: "omit"`, and `cache: "no-store"`. A JSON body with at least one base becomes the map. The status line reads `Live Working Set · N bases · M units` only after successful loading.
- **Fallback.** DNS/TLS/network/CORS failure, HTTP error, non-JSON, an empty or unsupported document, an oversized response, or a URL with embedded credentials loads the committed sample fixture. The status says `Fixture · sample data`, and an alert starts with `Fixture fallback.` and explains the failure category. Browser fetch cannot distinguish DNS/TLS/CORS failures. Raw error text and response bodies are never included in that alert. This is not cached live data; no live connection is claimed.

Startup URL precedence: a saved “use fixture” choice, then a URL saved in this browser, then `VITE_WORKING_SET_URL`, then the fixture.

### Point a tailnet machine at the live host

1. Join the tailnet so MagicDNS resolves `working-set.tail21f530.ts.net`.
2. Create an uncommitted `.env.local`:

   ```dotenv
   VITE_WORKING_SET_URL=http://127.0.0.1:5173/working-set/api/v1/working-set
   ```

3. Start the same-origin development proxy from this Mac:

   ```bash
   WORKING_SET_PROXY_TARGET=https://working-set.tail21f530.ts.net npm run dev
   ```

4. Open **http://127.0.0.1:5173** (the hostname must match the configured URL). Vite forwards `/working-set/api/v1/working-set` to the tailnet API, removing `/working-set`. If this browser saved a fixture choice or an old URL, paste `http://127.0.0.1:5173/working-set/api/v1/working-set` into **Data source** and press **Load** to override it.

With an origin that permits your browser via CORS, either direct setting works:

```dotenv
VITE_WORKING_SET_URL=https://working-set.tail21f530.ts.net
# Equivalent explicit endpoint:
# VITE_WORKING_SET_URL=https://working-set.tail21f530.ts.net/api/v1/working-set
```

Restart Vite after changing environment variables. `VITE_` values are public and embedded at build time. For a production build, set `VITE_WORKING_SET_URL` to an absolute API URL reachable by the browser through CORS or your deployment's same-origin reverse proxy, then run `npm run build`. The Vite development proxy is not included in the static build.

To check transport without printing private response bodies:

```bash
curl --silent --show-error --output /dev/null \
  --write-out 'HTTP %{http_code}; content type %{content_type}; TLS verify %{ssl_verify_result}\n' \
  https://working-set.tail21f530.ts.net/api/v1/working-set
```

There is no auth header or transcript fetch. Do not put cookies, tokens, or userinfo in URLs or `VITE_` variables. If authentication is needed, terminate it on a proxy you control.

### Contract

`normalizeWorkingSetPayload` in `src/adapters/normalize.ts` accepts:

- a top-level array, or
- an object with a `bases`, `items`, `records`, `agents`, or `units` array (the first of those keys that is an array wins)

Three record shapes collapse into the same map:

1. **Grouped base.** One object per repo, with a `units` array (or `agents`, same meaning). This is the shape to prefer once Working Set can emit multi-unit rows.
2. **Flat unit row.** One object per agent. Rows that share a repo, ignoring case, become one base with many units. A legacy single harness/model row is one unit on that repo.
3. **Nested live item.** `items[]` contains `item_id`, `observed`, `annotation`, and `associations`. Repository metadata comes from `observed`; user overrides come from `annotation`. Missing nested repository metadata is retained under one **Unassigned** base. `source_label` is session-oriented and is never a base key.

Flat rows do not invent a second unit from a parent harness when `units` or `agents` is present. The parent harness and model are ignored in that case.

| Map field | Accepted keys | Notes |
| --- | --- | --- |
| Repo / base | Nested: `observed.repo_name`, then `observed.repo`; flat: `repo_name`, `repo`, `repository`, `project`, `full_name`, or `base` | `base` may be a string or an object with `repo`, `repository`, `full_name`, or `name`. Nested items without a repo share Unassigned; flat records without a repo are dropped. Same repo merges case-insensitively. |
| Base id | `id` on a grouped base | Optional. Derived from the repo when omitted. Duplicate base ids get a numeric suffix. On a flat row, `id` belongs to the unit. |
| Base label | `label` on a grouped base | Human name for the repo. Flat-row `label` stays on the unit. |
| Units | `units` or `agents` | Array of unit objects. Omit it and the record itself is one unit. |
| Faction / harness | `observed.surface`, `observed.harness`, then flat `harness` or `surface` | Lowercased. `oh-my-pi` and `open-code` fold onto `ohmypi` and `opencode`. Missing becomes `unknown`. |
| Unit type / model | `observed.model`, then flat `model` | Blank or missing becomes `unknown`. |
| Thread | `thread_name` or `threadName` | Empty renders as an em dash. |
| Status | `annotation.status`, `observed.lifecycle`, `observed.presence`, then flat `status` | First nonblank string wins. `working`, `active`, and `busy` glow; `blocked`, `queued`, `stuck`, and `error` take the blocked slash. Other values are idle. |
| Unit label | `annotation.label`, flat `label`, then `thread_name` / `threadName` | First nonblank string wins. |
| Last touched | `annotation.updated_at`, `observed.updated_at`, then flat `updated_at`, `updatedAt`, `last_touched`, or `lastTouched` | The base shows the latest valid unit time. |
| Placement | `x`, `y` on the base | Optional numbers in `0..1`. Map presentation only. Ignored when out of range. |

Unknown fields are ignored, including any message or transcript body. Strings are capped at 180 characters. A grouped fixture record looks like this:

```json
{
  "bases": [
    {
      "id": "mirmicode",
      "repo": "asymetryk/mirmicode",
      "label": "Map MVP",
      "x": 0.3,
      "y": 0.28,
      "units": [
        {
          "id": "mirmicode-grok",
          "harness": "cursor",
          "model": "Grok-4.6",
          "thread_name": "bases-map",
          "status": "working",
          "updated_at": "2026-09-21T19:05:00Z"
        }
      ]
    }
  ]
}
```

When the live payload uses different names, extend the alias lists in `normalize.ts`. The UI only renders `CampaignBase` and `Unit` (`src/types.ts`).

## Lore

You are the commander. Agents on a base are Mirmis — a myrmidon word for the units under that command. Factions are the harnesses those units belong to. The name is flavor. The product is the map.

## Out of scope

Spectating a session, dragging work onto another base, chat or retask orders, a game engine, payments, and any analytics SDK.
