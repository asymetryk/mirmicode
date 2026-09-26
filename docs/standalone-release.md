# Private standalone release

The tailnet production Deployment `mirmicode` can run the same standalone
API/frontend as UAT. `standalone-production.yaml` is an explicit opt-in;
the legacy `apply.sh` remains the static adapter rollback lane. The public
Cloudflare deployment is separate and must not receive private telemetry.

## Promote

1. Pass K3s tests and deployed UAT desktop Chrome checks. Record actual harness
   start/finish transitions separately from simulated API tests. Update WP
   788, Bootstrap/architecture Wiki pages, and the dedicated Hive discussion.
2. Snapshot the current production Deployment (references only, no Secret
   values). Retain its exact legacy image and existing Tailscale state PVC.
3. Provision independent production ingest/editor credentials through the
   approved private store and K3s Secrets `mirmicode-standalone-ingest` and
   `mirmicode-standalone-editor`. Never put values in manifests or arguments.
4. Create `mirmicode-standalone-data`. Online-backup the UAT SQLite database,
   verify `PRAGMA integrity_check`, and seed the new PVC once through an
   isolated nonroot pod. Preserve shared appearance/link overrides; never
   mount UAT and production to the same database.
5. Commit, push, and merge the candidate. Build
   `deploy/k3s/mirmicode/standalone.Dockerfile` from the exact merged `main`
   commit on K3s. Import the image on `asym-k1`.
6. Render the production manifest with
   `mirmicode.local/standalone:<merged-commit>` and apply. The existing
   selector, service, hostname, and Tailscale state remain attached to
   `mirmicode`; the app container changes from `caddy` to `web`.
7. Verify readiness, exact running image, tailnet HTTPS health/snapshot, and
   desktop Chrome against the deployed service. Cluster-internal browser
   proof and tailnet HTTPS API proof are separate checks.
8. Retarget the already-approved host reporters to the production endpoint
   and production token file. Kick the collector/flusher and verify a fresh
   production observation. Keep UAT's credentials and database independent.
9. Record merge/image provenance and live proof on WP 788 and Hive. Native
   desktop launch and real Cursor/OhMyPi subagent coverage remain separate
   acceptance checks, not implied by CLI-event tests.

## Roll back

Restore the saved legacy Deployment specification and exact image; preserve
the original Tailscale state. Retarget host reporters to their saved UAT
configuration. Keep the standalone production PVC and credentials for
diagnosis; do not delete or overwrite them. Verify the legacy map and health
through the same production hostname. For a later standalone-to-standalone
rollback, validate SQLite migration compatibility before choosing an older
image; use an online database backup when compatibility is uncertain.

## 2026-09-26 acceptance

PR 22 merged as `4b590e8efd12f7b2099c99fc21905d2e74f5b7ed`. The exact merged
source was built on K3s and deployed as `mirmicode.local/standalone:4b590e8`
to private production. OCI index digest:
`sha256:3994c7890c04843590d49104061ba84bbd70191361c3268fbf2d50b5cae86130`.
The merged-source build passed the same 167 frontend tests, TypeScript/Vite,
and 46 runtime Python tests (six Git-dependent installer tests passed in
the separate 52-test K3s run).

Production snapshot readback showed 31 camps, 19 units, revision 7, and
`stale: false` after retargeting the host reporters. Two fresh concurrent CLI
jobs each in Cursor and OhMyPi were observed working then completed through
production, with 16-second durations and null outcomes. The current Codex
parent reported working and its completed child remained linked. Both host
LaunchAgents exited 0 and the retry queue was empty. Tailnet HTTPS health,
snapshot, private editor-session exchange, and private keyword display
passed; unauthenticated ingest and event endpoints returned 401.

Retargeting initially malformed the collector argument list: numerical
`plutil` array edits inserted values, leaving the old endpoint/arguments.
The source correctly became stale. Replacing the full argument array and
restarting the LaunchAgent restored fresh Codex data. Validate the complete
installed argument list when changing endpoints.

Production secret handles: private operator files
`~/.codex/secrets/mirmicode-standalone-production-ingest-token` and
`~/.codex/secrets/mirmicode-standalone-production-editor-token`, both mode
0600, provision the two K3s Secrets named above. UAT handles remain separate.
The approved Baserow Secrets ledger contains production ingest in row 67
and production editor in row 68; both values were written and read back.

Candidate `mirmicode.local/standalone-uat:20260926-acceptance1` passed 167
frontend tests and TypeScript/Vite build on `asym-k1`; all 52 Python tests
passed in an isolated K3s pod with Git and hook templates present. A first
test-pod copy omitted templates and failed six installer tests; copying the
required fixtures repaired the test environment without code changes.

Two concurrent OhMyPi CLI jobs and two concurrent Cursor CLI jobs exited 0.
All four were observed in UAT as `working` then `completed`, with stable
distinct IDs, start/finish times, and 15–17 second duration. A real Codex
child preserved the parent ID and was observed `completed → working →
completed` on a second turn, with a 91,838 ms duration. The initial completed
baseline is the prior run, not a failed new transition. Outcomes stayed
null: these smoke jobs do not assess whether a user objective succeeded.
The parent orchestration task appeared working. No retry/poll errors were
observed. Desktop GUI and real Cursor/OhMyPi subagent hooks remain unverified.

Chrome 154 on K3s at 1920×1080 rendered the candidate's deployed internal
HTTP route with no page errors. The map fills its available viewport and
retains six priority units while exposing overflow in Forces. Tailnet DNS
and connectivity are not available in that isolated pod; do not describe
its internal-route screenshot as a tailnet browser acceptance.
