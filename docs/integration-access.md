# Integration access and failure diagnosis

An administrator being signed into OpenProject does not authenticate a CLI, a
reporter, or another agent. A valid API token authenticates one service user;
private project access also requires that user's membership and role.

For Mirmicode, canonical Git identity is `github.com/asymetryk/mirmicode`,
OpenProject is project 59 (`Repo: Mirmicode`), and Hive channel is
`b9faf317-85e2-4a89-ab4e-592791f70f3c`. Linked worktrees share these identities.

## Verified 2026-09-26

The private project had no memberships. API users 8 (Wiki), 9 (Tracker), and
11 (Lifecycle) authenticated successfully but project 59 and WP 788 returned
404. The local principal inventory described old roles and project 15; its
permission lists did not match live roles. Credential rotation alone would
not repair this.

Using OpenProject's application services in an isolated K3s maintenance pod,
the three existing service users received project-59-only memberships with
role 19, `Mirmicode Agent Integration`. Its capabilities are project/work
read, work create/edit/status/comment/attachment, and wiki read/edit/manage.
It grants no system administration, membership management, project deletion,
or work-package deletion. Existing credentials were reused. API project/WP
reads then returned 200. The primary automated lane is the current K3s
`agent-tools` service, not the retired TrueNAS Python-container command.

The canonical Hive relay is `wss://asymetryk-hive.tail21f530.ts.net`.
`buzz-candidate.tail21f530.ts.net` is a retired compatibility address; its
reachability does not prove agent dispatch works. The private Mirmicode
channel and WP 788 discussion were read through the canonical relay.

## Checks at agent startup

1. Resolve canonical Git identity and its registered project/channel.
2. Resolve approved credential handles without logging their values.
3. Check OpenProject `/api/v3/users/me`, then the exact project and work item.
   Authentication success followed by 404 means verify private-project
   membership before assuming a missing work item or regenerating a token.
4. Verify the required write capability on the exact resource. An HTTP 200
   from a health endpoint is not proof of write access.
5. Verify the canonical Hive relay, signed identity, channel access, and
   thread read. Agent dispatch additionally requires a correct harness route
   and a source-confirmed response; relay health alone is insufficient.
6. Record the last verified time and the failure layer. Keep service health,
   network reachability, authentication, authorization, and harness dispatch
   as separate results.

Cluster DNS does not necessarily resolve MagicDNS names. Remote browser
validation can reach a deployed pod/service directly; label that proof as an
internal route. Tailnet HTTPS and native-app launch need separate evidence.
Run operational diagnostics in isolated bounded jobs, never by starting an
extra Rails process inside the live web container.

Repository enrollment currently imports associations; it does not provision
provider memberships automatically. A reconciler that creates/verifies the
project, channel, scoped identity, and capability checks together remains a
roadmap item. Do not claim this manual repair covers other repositories.
