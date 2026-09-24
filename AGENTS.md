# Mirmicode agent instructions

Mirmicode maps repository camps, agent units, and project work. The canonical Git repository is `https://github.com/asymetryk/mirmicode`; `main` is its primary branch. The private deployed map is `https://mirmicode.tail21f530.ts.net`. Confirm current deployment state before claiming a change is live.

## Agent Charter

- Load `~/.agent_charter/MANIFESTO.md` and its modules first. Repo setup answers and the one-to-one OpenProject/Buzz identity are in `.agent_charter/CONFIG.md`.
- When `CONFIG.md` is absent or has `setup_complete: false`, run `~/.agent_charter/SETUP.md` before feature work. Preserve the previous adapter-cut waiver only for that historical cut.
- OpenProject work packages own project state and evidence; the project Wiki holds shared context and assumptions. Discuss each WP in its dedicated thread in the private `mirmicode` Buzz channel before committing or merging.
- Use Graft to orient on this codebase before broad search. Treat `graft/` as a regenerable local cache.
- Build and deploy test/dev/UAT services on the homelab K3s cluster. The Mac is an operator surface, not a local deployment target.

Production still uses the earlier bundled/native feed and is not live telemetry. The isolated standalone UAT at `https://mirmicode-uat.tail21f530.ts.net` uses `server/` and a same-origin live snapshot. See `docs/standalone-core.md` and WP #788 for current evidence and gaps before changing either environment. Visual choices and source-derived facts must be distinct in any editable map contract.
