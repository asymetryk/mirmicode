# Mirmicode

**Macro the project. Micro the agents.**

Bird’s-eye map of an agent campaign. A **base** is a repo outpost. A **faction** is a harness, and each faction has its own painted body — Cursor angular, Codex organic, OhMyPi mechanical. A **unit** is one agent on that outpost, a Mirmi. The **model is the unit type**: Codex fields Astra, Luna, Terra, and Sol; Cursor fields Grok-4.6 and Gemini; OhMyPi fields Astra, Sol, MiniMax, and Kimi. The same model wears the same crest on whichever faction body it stands on. Idle, working, and blocked are filters and overlays on that sprite. The repo name and last touch stay in the HUD.

Build in public. Not monetized. No accounts, no payments, no analytics.

![Multi-faction units on the Mirmicode base](docs/bases-map.png)

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173. The map loads the committed sample fixture: four bases, each with units from more than one faction.

```bash
npm test
npm run build
npm run preview
```

`preview` serves the static build at http://127.0.0.1:4173.

Drag to pan. Scroll to zoom. **Select** a unit to read its harness, model, thread, and status in the HUD. **Attach** locks the view on that unit’s base. The **minimap** jumps the view. Escape detaches. These are view controls. The map does not send orders to agents.

The legend under the title shows the faction sprites and the model crests on those bodies.

## Sprites

Painted units and outposts live in `public/rts-art/` (`MANIFEST.txt` records the pack). Heroes and buildings are 1024×1024 with the figure framed near the bottom. Crests are centered.

A unit is the faction hero with an optional crest on the torso:

| Crest | File | Models |
| --- | --- | --- |
| A | `glyph-model-a.png` | Astra, Sol, MiniMax |
| B | `glyph-model-b.png` | Luna, Grok-4.6, Kimi |
| C | `glyph-model-c.png` | Terra, Gemini |

Models outside that table draw the faction body with no crest. A harness without a painted hero (OpenCode, unknown) keeps its faction color and a plain token. No fourth sprite is invented.

An outpost uses the building of the faction with the most units on that repo. A tie breaks toward Cursor, then Codex, then OhMyPi. In the sample fixture that is Cursor on `asymetryk/mirmicode`, Codex on `example/charter` and `example/prompt-lab`, and OhMyPi on `example/ops-board`.

Selection is still a ring around the figure. Working adds a faction-colored glow. Blocked adds a red slash. Idle dims the sprite.

## Sample data

`src/data/sample-bases.json` is synthetic metadata so the map runs with nothing else reachable. `example/*` repos are not live telemetry. The status line says `Fixture · sample data`.

Each base carries several units. `asymetryk/mirmicode` has Cursor Grok-4.6, Cursor Gemini, Codex Luna, and OhMyPi Kimi.

## Data adapter

CAHQ Working Set is the intended source of truth: metadata only, for Cursor, Codex, OhMyPi, and OpenCode surfaces. This spike does not vendor that service. OpenCode still renders as its own faction color if a payload names it. The fixture demonstrates the three factions above.

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

Two record shapes collapse into the same map:

1. **Grouped base.** One object per repo, with a `units` array (or `agents`, same meaning). This is the shape to prefer once Working Set can emit multi-unit rows.
2. **Flat unit row.** One object per agent. Rows that share a repo, ignoring case, become one base with many units. A legacy single harness/model row is one unit on that repo.

Flat rows do not invent a second unit from a parent harness when `units` or `agents` is present. The parent harness and model are ignored in that case.

| Map field | Accepted keys | Notes |
| --- | --- | --- |
| Repo / base | `repo`, `repository`, `project`, or `base` | `base` may be a string or an object with `repo`, `repository`, `full_name`, or `name`. Records without a repo are dropped. Same repo merges. |
| Base id | `id` on a grouped base | Optional. Derived from the repo when omitted. Duplicate base ids get a numeric suffix. On a flat row, `id` belongs to the unit. |
| Base label | `label` on a grouped base | Human name for the repo. Flat-row `label` stays on the unit. |
| Units | `units` or `agents` | Array of unit objects. Omit it and the record itself is one unit. |
| Faction / harness | `harness` or `surface` | Lowercased. Missing becomes `unknown`. |
| Unit type / model | `model` | Blank or missing becomes `unknown`. |
| Thread | `thread_name` or `threadName` | Empty renders as an em dash. |
| Status | `status` | Free text such as `active`. Empty renders as an em dash. |
| Unit label | `label` on a unit or flat row | Optional human label. |
| Last touched | `updated_at`, `updatedAt`, `last_touched`, or `lastTouched` | ISO-8601 string. The base shows the latest unit time. |
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

Startup URL precedence: a saved “use fixture” choice, then a URL saved in this browser, then `VITE_WORKING_SET_URL`, then the fixture.

## Lore

You are the commander. Agents on a base are Mirmis — a myrmidon word for the units under that command. Factions are the harnesses those units belong to. The name is flavor. The product is the map.

## Out of scope

Spectating a session, dragging work onto another base, chat or retask orders, a game engine, payments, and any analytics SDK.
