# Mirmicode

**Macro the project. Micro the agents.**

Bird’s-eye map of agent campaigns. Each project is a base. On every base: when it was last touched, which harness was on it, which model, and the thread name or human label.

Build in public. Not monetized. No accounts, no payments, no analytics.

![Bases map with asymetryk/mirmicode selected](docs/bases-map.png)

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173. The map loads the committed sample fixture (four bases).

```bash
npm test
npm run build
npm run preview
```

`preview` serves the static build at http://127.0.0.1:4173.

Drag to pan. Scroll to zoom. **Select** a base to read it. **Attach** locks the view on that base. The **minimap** jumps the view. Escape detaches. These are view controls. The map does not send orders to agents.

## Sample data

`src/data/sample-bases.json` is synthetic metadata so the map runs with nothing else reachable. `example/*` repos are not live telemetry. The status line says `Fixture · sample data`.

| Base | Last touched | Harness | Model | Thread / label |
| --- | --- | --- | --- | --- |
| `asymetryk/mirmicode` | 2026-09-21 19:05 UTC | cursor | unknown | `bases-map` / Map MVP spike |
| `example/charter` | 2026-09-21 13:10 UTC | codex | gpt-5.4 | `charter-notes` / Readme pass |
| `example/ops-board` | 2026-09-20 21:40 UTC | opencode | unknown | `live-state` / Cluster sketch |
| `example/prompt-lab` | 2026-09-18 15:00 UTC | ohmypi | local | `ohmypi-session` / Session label |

## Data adapter

CAHQ Working Set is the intended source of truth: metadata only, for Cursor, Codex, OhMyPi, and OpenCode surfaces. This spike does not vendor that service.

From the environment that produced this spike, the private Working Set host did not resolve, and the private reference implementation was not readable. The map therefore ships a fixture plus an adapter Howard can point at a JSON URL later.

### What works now

- **Fixture path.** Default. No network. `loadFixture()` normalizes `src/data/sample-bases.json`.
- **Working Set path.** Paste a URL in **Data source**, or set `VITE_WORKING_SET_URL` (see `.env.example`). The browser sends an unauthenticated `GET` with `Accept: application/json` and no credentials. A successful JSON body becomes the map. Any failure (DNS, HTTP error, non-JSON, empty bases, URL with embedded credentials) keeps the map on the fixture and shows the reason.
- **Dev proxy, optional.** If the service is reachable from your machine but does not send CORS headers:

  ```bash
  WORKING_SET_PROXY_TARGET=https://your-working-set-origin npm run dev
  ```

  Vite forwards `/working-set/...` to that origin with the prefix removed. Load `http://127.0.0.1:5173/working-set/<json-path>`. The proxy target is server-side only. Do not put tokens in the repo or in `VITE_` variables.

There is no built-in path, auth header, or transcript fetch. If Working Set needs a credential, terminate that on a proxy you control. This client will not store one.

### Contract

`normalizeWorkingSetPayload` in `src/adapters/normalize.ts` accepts:

- a top-level array, or
- an object with a `bases`, `items`, or `records` array

Each record:

| Map field | Accepted keys | Notes |
| --- | --- | --- |
| Repo / base | `repo`, `repository`, `project`, or `base` | `base` may be a string or an object with `repo`, `repository`, `full_name`, or `name`. Records without a repo are dropped. |
| Harness | `harness` or `surface` | Lowercased. Missing becomes `unknown`. |
| Model | `model` | Blank or missing becomes `unknown`. |
| Label | `label` | Human label. Empty becomes an em dash on the map. |
| Thread | `thread_name` or `threadName` | Empty becomes an em dash. |
| Last touched | `updated_at`, `updatedAt`, `last_touched`, or `lastTouched` | ISO-8601 string. Missing becomes `unknown`. |
| Id | `id` | Optional. Derived from repo + label + thread when omitted. |
| Placement | `x`, `y` | Optional numbers in `0..1`. Map presentation only. Ignored when out of range. Working Set does not have to send them. |

Unknown fields are ignored, including any message or transcript body. Strings are capped at 180 characters. The fixture is one valid document:

```json
{
  "bases": [
    {
      "id": "mirmicode",
      "repo": "asymetryk/mirmicode",
      "label": "Map MVP spike",
      "thread_name": "bases-map",
      "harness": "cursor",
      "model": "unknown",
      "updated_at": "2026-09-21T19:05:00Z",
      "x": 0.3,
      "y": 0.3
    }
  ]
}
```

When the live payload uses different names, extend the alias lists in `normalize.ts`. The UI only renders `CampaignBase` (`src/types.ts`).

Startup URL precedence: a saved “use fixture” choice, then a URL saved in this browser, then `VITE_WORKING_SET_URL`, then the fixture.

## Lore

You are the commander. Agents on a base are Mirmis — a myrmidon word for the units under that command. The name is flavor. The product is the map.

## Out of scope

Spectating a session, dragging work onto another base, chat or retask orders, game-engine art, payments, and any analytics SDK.
