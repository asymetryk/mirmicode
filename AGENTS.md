# Mirmicode agent instructions

Mirmicode maps repository camps, agent units, and project work. The canonical Git repository is `https://github.com/asymetryk/mirmicode`; `main` is its primary branch. The private deployed map is `https://mirmicode.tail21f530.ts.net`. Confirm current deployment state before claiming a change is live.

## Agent Charter

- Load `~/.agent_charter/MANIFESTO.md` and its modules first. Repo setup answers and the one-to-one OpenProject/Buzz identity are in `.agent_charter/CONFIG.md`.
- When `CONFIG.md` is absent or has `setup_complete: false`, run `~/.agent_charter/SETUP.md` before feature work. Preserve the previous adapter-cut waiver only for that historical cut.
- OpenProject work packages own project state and evidence; the project Wiki holds shared context and assumptions. Discuss each WP in its dedicated thread in the private `mirmicode` Buzz channel before committing or merging.
- Use Graft to orient on this codebase before broad search. Treat `graft/` as a regenerable local cache.
- Build and deploy test/dev/UAT services on the homelab K3s cluster. The Mac is an operator surface, not a local deployment target.

Private production and isolated UAT use `server/` and a same-origin live snapshot with independent SQLite volumes and credentials. Production is `https://mirmicode.tail21f530.ts.net`; UAT is `https://mirmicode-uat.tail21f530.ts.net`. The separate public Cloudflare deployment remains on its earlier static path. Verify the live image and source freshness before claiming current activity. See `docs/standalone-release.md`, `docs/integration-access.md`, and WP #788 for evidence, access checks, limitations, and rollback. Visual choices and source-derived facts must be distinct in any editable map contract.
