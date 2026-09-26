# Mirmicode

The standalone-core migration is being validated on K3s at
<https://mirmicode-uat.tail21f530.ts.net/>. It owns a persistent API and live
Codex metadata feed; production still uses the deployment described below.
See [the migration plan](docs/migration-plan.md),
[standalone architecture and evidence](docs/standalone-core.md), and
[OpenProject WP #788](https://openproject.tail21f530.ts.net/work_packages/788)
before promoting it.

**Macro the project. Micro the agents.**

Bird’s-eye map of an agent campaign. A **base** is a repo outpost. A **faction** is a harness. Cursor, Codex, and OhMyPi each have a painted body — angular, organic, and mechanical. **Grok Bot** (`grokbot`) is a first-class faction on the same legend, rail, and HUD. No grokbot paint was staged, so it wears the neutral v2 body with a bone-white wash. A **unit** is one agent on that outpost, a Mirmi. The **model picks the silhouette** from the v2 atlas: scout, worker, drone, tankette, walker, medic, mirmi, armed, skiff, or builder. The same model wears the same silhouette on whichever faction body it stands on. Idle and working add a ground marker. Blocked adds a red slash. The repo name and last touch stay in the HUD.

Build in public. Not monetized. No accounts, no payments, no analytics.

![Multi-type squads on the four bases](docs/bases-map.png)

![Selected Cursor walker in the HUD](docs/selected-hud.png)

## Deploy

The private surface is **https://mirmicode.tail21f530.ts.net** on cluster **asym-k3s**, namespace `mirmicode`, pinned to node **asym-k1**. A public BIP at **https://mirmicode.asymetryk.com** (CF Tunnel) can reuse the same image with public mode on so agent prompts stay off the map. `http://127.0.0.1:5173` is interim local preview.

Labhand applies. This repo does not run `kubectl` from a cloud VM.

### Private vs public BIP

| Surface | Mode | Prompts |
| --- | --- | --- |
| `mirmicode.tail21f530.ts.net` | Private (default) | Shows `observed.lastUserPrompt` / aliases as **Last prompt** |
| `mirmicode.asymetryk.com` | Public / read-only | Scrubs prompts in the UI and in the Working Set JSON; popover/tooltips show **Thread** (label) or omit the snippet hero |

Public mode still draws bases, units, filters, Unassigned, status, lifecycle, presence, and freshness. It drops `lastUserPrompt`, `last_user_prompt`, flat prompt aliases, and `annotation.note` used as a prompt. On the public pod those fields are nulled in the `/working-set` JSON before the browser sees them, and `hasContextSnippet: true` is set when a snippet existed so the hard filter can keep the unit. Obvious absolute home paths and `.jsonl` paths in labels/thread names are redacted in the UI when scrubbing.

**Flags (pick one layer):**

| Knob | Where | Default |
| --- | --- | --- |
| `VITE_PUBLIC_MODE=1` | Bake-time (`.env`, Docker `ARG`) | off |
| `VITE_PUBLIC_FULL_LIVE=1` | Bake-time escape hatch: keep prompts on a public build | off |
| `PUBLIC_MODE=1` | Runtime env on the web/Caddy container. Rewrites `/runtime-config.js` and scrubs Working Set JSON on `/working-set` | unset (private passthrough) |
| `PUBLIC_FULL_LIVE=1` | Runtime full-live override: keep prompt text in the UI and skip the JSON scrub | unset |

Labhand / Abby: set **`PUBLIC_MODE=1`** on the public CF Tunnel deploy only. That one flag covers the UI and the Working Set JSON. Leave the existing tailnet deploy unset so prompts stay visible there. Do not turn on `PUBLIC_FULL_LIVE` for the public hostname unless you intentionally want prompts on the open map.

`/runtime-config.js` is a real file from `public/` (Vite copies it into the image). Caddy serves that path with `Cache-Control: no-store` and does not fall through to `index.html`. After deploying the public pod, purge the Cloudflare cache for `https://mirmicode.asymetryk.com/runtime-config.js` so an older HTML response is not reused. A shared image is enough: bake-time `MIRMICODE_PUBLIC_MODE=1` is optional and only affects the UI fallback when runtime config leaves `publicMode` unset. The API scrub follows runtime `PUBLIC_MODE` on that pod.

```bash
# Bake a public image (optional; runtime PUBLIC_MODE is enough for a shared image):
MIRMICODE_PUBLIC_MODE=1 ./deploy/k3s/mirmicode/build-image.sh
```


```bash
# On asym-k1, after the tailscale secret exists (below):
./deploy/k3s/mirmicode/build-image.sh
MIRMICODE_APPLY=1 ./deploy/k3s/mirmicode/apply.sh
```

`apply.sh` prints the plan and exits unless `MIRMICODE_APPLY=1`. It refuses a kube context whose name and cluster are both different from `asym-k3s` unless `MIRMICODE_ALLOW_CONTEXT=1`. The image tag defaults to `mirmicode.local/web:<git sha>` with `imagePullPolicy: Never`, so the build has to happen on asym-k1 and be imported into that node's containerd.

What the pod does:

- Caddy serves the Vite build on port 8080 inside the pod.
- The image bakes `VITE_WORKING_SET_URL=/working-set/api/v1/working-set`. The browser calls its own origin. CAHQ does not send CORS, and the browser never talks to it.
- A userspace Tailscale sidecar (`tag:homelab-sidecar`, hostname `mirmicode`) runs `tailscale serve --https=443` at that Caddy port. MagicDNS name: `mirmicode.tail21f530.ts.net`.
- Caddy reverse-proxies `/working-set/*` through the sidecar's SOCKS5 port (`127.0.0.1:1055`) to **https://cahq.tail21f530.ts.net**. Stripping `/working-set` leaves `/api/v1/working-set`. `working-set.tail21f530.ts.net` is stale and is not the upstream. With `PUBLIC_MODE=1` (and `PUBLIC_FULL_LIVE` unset), Caddy sends that path to a loopback scrubber in the same process. The scrubber dials CAHQ over the same SOCKS port, nulls prompt fields, and sets `hasContextSnippet`. `PUBLIC_MODE` unset keeps the direct TLS proxy, so the private tailnet response is unchanged.
- A later in-cluster caller could use a ClusterIP Service on port 8080. v1 does not ship that Service. The browser surface is the Tailscale hostname.

### Secrets

Nothing under `deploy/` contains an auth key or a Working Set token. Create them on the cluster:

```bash
kubectl --context asym-k3s -n mirmicode create secret generic mirmicode-tailscale-auth \
  --from-file=authkey=./ts-authkey
```

The key is `authkey`. The file is a Tailscale auth key allowed to advertise `tag:homelab-sidecar`. State is a `local-path` PVC (`mirmicode-tailscale-state`), so later starts reuse the node identity and only read the key when tailscaled is logged out.

If CAHQ needs a bearer token, the browser still does not see it:

```bash
kubectl --context asym-k3s -n mirmicode create secret generic mirmicode-working-set \
  --from-file=token=./working-set-token
```

The key is `token` (raw token, no `Bearer ` prefix). The volume is optional. When the file is non-empty, Caddy adds `Authorization: Bearer <token>` on the upstream request only.

### What to copy from working-set-ui

`asymetryk/agentinfra` was not readable here (GitHub 404 for `deploy/k3s/working-set-ui`). The sidecar shape follows that packet, and the userspace entrypoint follows the public observatory manifest `deployment/k3s/ingress.yaml` (including its Tailscale image digest). Before the first apply, diff this directory against `deploy/k3s/working-set-ui` and keep that repo's values when they differ:

- Tailscale image digest
- Auth secret name and key (`authkey` here; observatory uses the same key name on `asymk3-tailscale-auth`)
- State: this PVC versus `TS_KUBE_SECRET` plus a ServiceAccount
- `tailscale serve` flags
- Apply flag spelling, if that repo uses something other than `MIRMICODE_APPLY`
- Resource requests

Do not copy a proxy target of `working-set.tail21f530.ts.net`.

## Local preview

Interim only. The deployed hostname above is the map people open.

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173. With no `VITE_WORKING_SET_URL`, the map loads the committed sample fixture: four bases, each with a multi-type squad from more than one faction, plus pad, depot, turret, refinery, barracks, lab, and a few resource props.

Tailscale Serve can front this dev server on a MagicDNS name. `server.allowedHosts` is `[".tail21f530.ts.net"]`, so Vite 6 accepts that suffix. The live Working Set origin is `https://cahq.tail21f530.ts.net`. Details are under **Point a tailnet machine at CAHQ** below.

```bash
npm test
npm run build
npm run preview
```

`preview` serves the static build at http://127.0.0.1:4173. A production `npm run build` without the Docker `ARG` does not bake the same-origin path; the image build does.

Drag to pan. Scroll to zoom. **Select** a unit or camp to open a popover with its context snippet (hero), harness, model, thread, status, lifecycle, and OpenProject. **Attach** locks the view on that base. The **minimap** jumps the view. Escape closes the popover (or detaches first). These are view controls. The map does not send orders to agents. Git branch names are not shown.

**Forces** is the side rail: camps, factions and their units, and the legend (bodies, types, field, noise switches, data source). **Hide** collapses it so the map fills the space under the title. The choice is remembered as `mirmicode.railOpen`. Unit and base details stay in the popover.

The **Noise** switch starts on. It hides `presence` `not_seen` and `annotation.hidden` true. `archived` stays dimmer until **Hide archived** is turned on. `detached` stays dimmer for other harnesses. An OhMyPi unit (`omp` / `ohmypi`) with `lifecycle` `detached` stays full strength when `presence` is `present` or it has a last-user prompt. **Hide detached** still removes detached units. `unknown` stays visible and dimmer. A Cursor unit with `lifecycle` `unknown` and no repo is dimmed further inside Unassigned. **Unassigned** is one outpost with a count. Select it to open that list in the popover. Counts come from the loaded snapshot. They are not a fixed demo size.

Units without a usable **Last prompt** snippet (same resolution as the field below) are hard-hidden from the map — no empty shells. Public mode still scrubs prompt *text* but keeps units whose payload had a snippet. A catalog camp with no units stays on the map.

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

The file is `units/{cursor|codex|ohmypi}-{stem}.png`. OpenCode and other unpainted harnesses use the neutral body when that file was staged.

**Grok Bot art.** There is no `grokbot-*` sprite in `public/rts-art/` or `public/rts-art-v2/STAGED.txt`. Grok Bot uses the staged neutral sheet, the same files an unpainted harness gets: `units/neutral-{stem}.png`, neutral buildings (no neutral pad), neutral resources, and neutral idle/work markers. The Grok model silhouette is the walker, `units/neutral-walker-07.png`, the same role map as MiniMax → mirmi and Grok* → walker. The legend faction chip draws that walker. CSS (`--grokbot`, bone `#f6f1e7`, plus a grayscale brightness wash on the sprite) keeps it off the Cursor, Codex, and OhMyPi bodies and off the raw gray-teal neutral used by OpenCode. A camp that is mostly Grok Bot still claims the outpost, and that kit is the neutral sheet. Ties still break toward Cursor, then Codex, then OhMyPi, then Grok Bot.

Each base also shows a v2 outpost kit for the plurality faction: pad (the clickable base), depot, turret, refinery, barracks, and lab, plus crystal, biomass, and scrap props. A tie still breaks toward Cursor, then Codex, then OhMyPi, then Grok Bot. In the sample fixture that is Cursor on `asymetryk/mirmicode`, Codex on `example/charter` and `example/prompt-lab`, and OhMyPi on `example/ops-board`. Grok Bot units in that fixture are a minority on those repos, plus one walker on Unassigned.

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

Each base carries a mixed squad, not one hero. `asymetryk/mirmicode` is a Cursor majority (Grok-4.6 walker, Gemini medic, plus scout, drone, builder, and tankette) with Codex Luna and Skiff, OhMyPi Kimi and Medic, and one Grok Bot walker. The other bases are a Codex charter (plus one Grok Bot walker), an OhMyPi ops board, and a Codex prompt lab. Together the fixture fields every v2 silhouette. It also includes hidden noise rows and one Unassigned outpost, including one Grok Bot with no repo, so the filters and the drilldown work with no network. Those three Grok Bot units each have a context snippet. A Grok Bot row with no snippet is omitted by the same hard filter as the other factions.

`src/data/cahq-working-set.sample.json` is a separate flat `agents` document in the Working Set field shape (several units sharing a repo). It is also synthetic. It is not a capture from the tailnet host. Tests run it through the same normalizer the live fetch uses.

## Live Working Set vs fixture

CAHQ Working Set is the live source of truth: metadata only, for Cursor, Codex, OhMyPi, Grok Bot, and OpenCode surfaces. This client does not vendor that service. OpenCode still renders as its own faction color if a payload names it. Grok Bot renders when a row names `grokbot` (see the faction field below). Live rows need an agentinfra Grok Bot producer; until that lands, the sample fixture is the offline demo.

The live upstream is `https://cahq.tail21f530.ts.net/api/v1/working-set`. CAHQ does not send CORS. The deployed map therefore calls the same-origin path `/working-set/api/v1/working-set`, and Caddy on the pod proxies that to CAHQ. A pasted root URL with no query still resolves to `/api/v1/working-set`. `working-set.tail21f530.ts.net` is a stale hostname. Do not point the client at it.

### What the client does

- **Fixture path.** Default when `VITE_WORKING_SET_URL` is empty and this browser has not saved a URL. No network. `loadFixture()` normalizes `src/data/sample-bases.json`.
- **Live path.** Paste a URL in **Data source**, or set `VITE_WORKING_SET_URL` (see `.env.example`). A path that starts with one `/` is resolved on the page origin; the deployed build uses `/working-set/api/v1/working-set`. A root URL without a query resolves to `/api/v1/working-set`; an explicit endpoint path or query is preserved. Fragments are removed. The browser sends an unauthenticated `GET` with `Accept: application/json`, `credentials: "omit"`, and `cache: "no-store"`. A JSON body with at least one base becomes the map. The status line reads `Live Working Set · N bases · M units` only after successful loading.
- **Fallback.** DNS/TLS/network/CORS failure, HTTP error, non-JSON, an empty or unsupported document, an oversized response, or a URL with embedded credentials loads the committed sample fixture. The status says `Fixture · sample data`, and an alert starts with `Fixture fallback.` and explains the failure category. Browser fetch cannot distinguish DNS/TLS/CORS failures. Raw error text and response bodies are never included in that alert. This is not cached live data; no live connection is claimed.

Startup URL precedence: a saved “use fixture” choice, then a URL saved in this browser, then `VITE_WORKING_SET_URL`, then the fixture.

### Open the deployed map

Join the tailnet and open **https://mirmicode.tail21f530.ts.net**. The baked URL is `/working-set/api/v1/working-set`. A root URL with no query still resolves to `/api/v1/working-set` when you paste an absolute origin; the deployed default is already the full same-origin path, so it is left as-is. If this browser saved a fixture choice or an old URL, paste `/working-set/api/v1/working-set` into **Data source** and press **Load**.

`VITE_` values are public and embedded at image build time. Do not put cookies, tokens, or userinfo in URLs or `VITE_` variables. The optional `mirmicode-working-set` secret is the auth hook: Caddy adds the bearer header on the pod, and the client still sends `credentials: "omit"`.

### Point a tailnet machine at CAHQ

Interim local preview, only when you are not on the deployed host. Join the tailnet so MagicDNS resolves `cahq.tail21f530.ts.net`.

1. Create an uncommitted `.env.local`:

   ```dotenv
   VITE_WORKING_SET_URL=http://127.0.0.1:5173/working-set/api/v1/working-set
   ```

2. Start the same-origin development proxy:

   ```bash
   WORKING_SET_PROXY_TARGET=https://cahq.tail21f530.ts.net npm run dev
   ```

3. Open **http://127.0.0.1:5173** (the hostname must match the configured URL). Vite forwards `/working-set/api/v1/working-set` to CAHQ, removing `/working-set`. If this browser saved a fixture choice or an old URL, paste `http://127.0.0.1:5173/working-set/api/v1/working-set` into **Data source** and press **Load** to override it.

Tailscale Serve can proxy this dev server at a MagicDNS name such as `howards-macbook-pro.tail21f530.ts.net`. `server.allowedHosts` is `[".tail21f530.ts.net"]`, so Vite 6 accepts that name and any other host on the same tailnet suffix.

With an origin that permits your browser via CORS, either direct setting works:

```dotenv
VITE_WORKING_SET_URL=https://cahq.tail21f530.ts.net
# Equivalent explicit endpoint:
# VITE_WORKING_SET_URL=https://cahq.tail21f530.ts.net/api/v1/working-set
```

CAHQ does not send a CORS allow-origin header, so the same-origin proxy above is the path that works in the browser. Restart Vite after changing environment variables. `VITE_` values are public and embedded at build time. The Vite development proxy is not included in the static image; the K3s image bakes `/working-set/api/v1/working-set` instead.

To check transport from a tailnet host without printing the body:

```bash
curl --silent --show-error --output /dev/null \
  --write-out 'HTTP %{http_code}; content type %{content_type}; TLS verify %{ssl_verify_result}\n' \
  https://cahq.tail21f530.ts.net/api/v1/working-set
```

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
| Faction / harness | `observed.surface`, then `observed.harness`, then `observed.faction`, then flat `harness`, `surface`, or `faction`. A `source` value is used only when it names a known faction (`cursor`, `codex`, `ohmypi`, `opencode`, `grokbot`) and the fields above are blank. | Lowercased. `omp`, `oh-my-pi`, and `OhMyPi` fold onto the painted id `ohmypi` and display as **OhMyPi**. `grok-bot`, `grok_bot`, and `Grok Bot` fold onto `grokbot` and display as **Grok Bot**. `open-code` folds onto `opencode`. Missing becomes `unknown`. The UI does not show the bare `omp` token. `source_label` is still not a base key and is not read as a faction. A `source` string that is not a known faction is ignored. |
| Unit type / model | `observed.model`, then flat `model` | Blank or missing becomes `unknown`. |
| Thread | `thread_name` or `threadName` | Empty renders as an em dash. |
| Status | `annotation.status`, then flat `status` | Operator triage. Live values are `open` and `done`. Shown as Status, never as lifecycle. `open` and `done` do not drive the glow. `working`, `active`, and `busy` still glow; `blocked`, `queued`, `stuck`, and `error` take the blocked slash. |
| Lifecycle | `observed.lifecycle`, then flat `lifecycle`, then `annotation.lifecycle` | Live values are `idle`, `detached`, `archived`, and `unknown`. Shown on its own HUD line. |
| Presence | `observed.presence`, then flat `presence`, then `annotation.presence` | Live values are `present` and `not_seen`. Shown on its own HUD line. |
| Freshness | `observed.freshness`, then flat `freshness` | Relative string. The literal `unknown` is kept and shown. Missing stays an em dash. It does not hide the unit. |
| Operator hidden | `annotation.hidden`, then flat `hidden` | Boolean `true` hides the unit. Any other value, including the string `"true"`, does not. |
| Stale snapshot | `snapshot.stale` | Boolean `true` shows a refresh-failed banner. It does not hide units. Missing or non-boolean stays quiet. |
| Unit label | `annotation.label`, flat `label`, then `thread_name` / `threadName` | First nonblank string wins. |
| Last prompt | `observed.lastUserPrompt`, then `observed.last_user_prompt`, then flat `last_prompt`, `lastPrompt`, `last_user_message`, `lastUserMessage`, `user_prompt`, `userPrompt`, `prompt`, `input`, then `annotation.note` | First nonblank string wins; non-string and blank values are skipped. The published observed prompt is at most 240 characters and is kept in full for the tooltip. Never derived from `annotation.label`. Units without a usable value are hard-hidden from the map. **Public BIP** (`PUBLIC_MODE=1` on the pod, or bake-time `VITE_PUBLIC_MODE`) drops displayed prompt text unless full live is set. The public pod also nulls those JSON fields and sets `hasContextSnippet: true` when a snippet existed, which the client honors so the hard filter can show the unit without the text. |
| Last touched | `annotation.updated_at`, `observed.updated_at`, then flat `updated_at`, `updatedAt`, `last_touched`, or `lastTouched` | The base shows the latest valid unit time. |
| Placement | `x`, `y` on the base | Optional numbers in `0..1`. Map presentation only. Ignored when out of range. |
| OpenProject | `associations.openproject` on the item or grouped base. Fallback: a repo map already on the payload at `openproject`, `repo_openproject`, or `openproject_by_repo` (top level or under `snapshot`) | Object fields read when present: `href` / `url` / `html_url` / `project_url`, `name` / `title` / `identifier`, `status` / `phase`, `description` / `summary` / `next_update` / `updated_at`. A nested `project` object is read the same way. The base shows the project most of its units share; a tie keeps the first. Only `http` and `https` become links. No association, including a null `associations.openproject`, renders the plain text **no OP project linked**. The client does not call OpenProject. |

Unknown fields, transcript bodies, and git branch names are ignored. Display metadata is capped at 180 characters, except prompt text, which is retained for full native `title` tooltips. The selection popover shows the prompt as hero content when private; public BIP scrubs that hero and falls back to `Thread:` (label/name) in secondary lines. `annotation.label` alone is not enough to place a unit on the map. Both sample fixtures include fictional prompt text and a few label-only shells that the hard filter removes. A grouped fixture record looks like this:

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
          "presence": "seen",
          "lifecycle": "active",
          "updated_at": "2026-09-21T19:05:00Z"
        }
      ]
    }
  ]
}
```

When the live payload uses different names, extend the alias lists in `normalize.ts`. The UI only renders `CampaignBase` and `Unit` (`src/types.ts`).

## Map noise

![Filtered map with the Unassigned count and lifecycle in the HUD](docs/map-noise.png)

![Unassigned drilldown list](docs/unassigned-list.png)

**Hide not seen and operator-hidden** defaults to on (`mirmicode.hideNoise`). **Hide archived** defaults to off (`mirmicode.hideArchived`). **Hide detached** defaults to off (`mirmicode.hideDetached`). This browser remembers each switch. The status line counts visible bases and units, then adds a hidden count when a filter removed any. Those counts are computed from the snapshot.

| Rule | Default | Effect |
| --- | --- | --- |
| Not seen | On | Hide when `presence` is `not_seen` |
| Operator hidden | On | Hide when `annotation.hidden` is boolean `true` |
| Archived | Dim, hide optional | Stay on the map, drawn dimmer. **Hide archived** removes them |
| Detached | Dim, hide optional | Stay on the map, drawn dimmer, except OhMyPi (`omp` / `ohmypi`) when `presence` is `present` or a last-user prompt is present. **Hide detached** still removes them |
| Unknown lifecycle | Dim | Stay visible, drawn dimmer. Unclear or cold, not dead |
| Repo-less Cursor unknown | Demote | Dimmed further and listed last in the Unassigned drilldown. Not removed |
| Stale snapshot | Banner | `snapshot.stale` true shows “Working Set refresh failed. This snapshot is stale.” Units stay |

Comparison is trim and case fold on those exact strings. A missing, blank, or non-string field skips that rule. `not-seen`, `archive`, `idle`, and freshness `unknown` do not hide a unit. `annotation.status` `open` or `done` is triage in the HUD and is not labeled as lifecycle.

An item is Unassigned only when `observed.repo` and `observed.repo_name` are both missing or blank. One of those fields is enough to place it on that repo.

Hidden units remain in the snapshot. Turning the noise switch off draws `not_seen` and operator-hidden units again. Archived stays dim unless **Hide archived** is on. Unknown stays dim either way. A base whose units are all hidden leaves the map until one of them passes.

### Unassigned

Nested items with both `observed.repo` and `observed.repo_name` missing or blank share one base named Unassigned. The map draws that base as a single outpost and a count of the units that passed the filter (noise **and** usable context snippet). It does not place a token per unit. Select the outpost to open the list in the popover, then select a unit. The popover shows lifecycle, presence, freshness, and status on separate lines, plus the snippet hero when private, and the base’s OpenProject line. Assigned repos keep one token per visible unit. Repo-less Cursor units whose lifecycle is `unknown` sit at the end of that list, dimmer than the rest.

## Repo camps

`src/data/all-repos.json` is the camp catalog. The source of truth is Howard’s `~/Developer` tree, baked from a directory scan (see `src/data/developer-camps.scan.json` and `scripts/refresh-developer-camps.sh`). It is not the old public GitHub list for user **asymetryk** (10 repos). A private GitHub credential bake failed: `GET /user` returned 403, and `gh repo list` with no owner only saw `asymetryk/mirmicode`. The browser does not call GitHub and does not need a token.

`loadFixture` and `loadWorkingSet` merge that list after normalize. A Working Set repo keeps its units. A catalog name with no units is an empty camp (an outpost and a name, no army). Names dedupe on the lowercased id. When the scan recorded an `origin` remote, the id is `owner/name`. Otherwise the id is the folder name, so a local-only checkout still appears. Regenerate on the Mac with `./scripts/refresh-developer-camps.sh`. Do not put a GitHub token in the client.

The sample fixture’s noise rows and Unassigned outpost are synthetic. They demonstrate the filter offline. Live counts follow whatever the Working Set returns.

## Lore

You are the commander. Agents on a base are Mirmis — a myrmidon word for the units under that command. Factions are the harnesses those units belong to. The name is flavor. The product is the map.

## Out of scope

Spectating a session, dragging work onto another base, chat or retask orders, a game engine, payments, and any analytics SDK.
