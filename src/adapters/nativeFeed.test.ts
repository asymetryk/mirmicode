import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/feed-v0-snapshot.json";
import { CAHQ_WORKING_SET_ORIGIN } from "./source";
import { setPublicModeForTests } from "../publicMode";
import {
  NATIVE_FEED_SOURCE,
  loadNativeFeed,
  loadNativeFeedFixture,
  loadNativeFeedServer,
  parseNativeFeedSnapshot,
} from "./nativeFeed";

const VALID_SNAPSHOT = {
  fetched_at: "2026-09-22T15:00:00Z",
  camps: [
    {
      repo_key: "agentinfra",
      repo_label: "agentinfra",
      github_url: "https://github.com/asymetryk/agentinfra",
      stage: "active",
      open_project: {
        id: 123,
        key: "coding-agent-hq",
        name: "Coding Agent HQ",
        url: "https://openproject.example/projects/coding-agent-hq",
        status: "ok",
      },
    },
  ],
  units: [
    {
      id: "agentinfra-1",
      repo_key: "agentinfra",
      harness: "omp",
      model: "MiniMax-M3",
      thread_name: "feed-contract-v0",
      status: "open",
      destination: { kind: "repo", value: "asymetryk/agentinfra" },
      updated_at: "2026-09-22T15:30:00Z",
    },
  ],
};

describe("parseNativeFeedSnapshot", () => {
  it("maps task-card fields and keeps lifecycle status separate from legacy triage", () => {
    const { snapshot } = loadNativeFeed({
      camps: [{ repo_key: "agentinfra", github_url: "https://github.com/asymetryk/agentinfra" }],
      units: [{
        ...VALID_SNAPSHOT.units[0],
        status: "needs-attention",
        prompt_tldr: "Review the desktop inspector.",
        started_at: "2026-09-24T10:00:00Z",
        finished_at: null,
        duration_ms: 45_000,
        token_usage: { input_tokens: 80, total_tokens: 80 },
        outcome: { state: "needs-help", summary: "Awaiting review", evidence: ["No browser evidence"] },
      }],
    });
    const unit = snapshot.bases[0]?.units[0];

    expect(unit).toMatchObject({
      status: "needs-attention",
      activityStatus: "needs-attention",
      promptTldr: "Review the desktop inspector.",
      taskStartedAt: "2026-09-24T10:00:00Z",
      taskDurationMs: 45_000,
      tokenUsage: { input_tokens: 80, total_tokens: 80 },
      outcome: { state: "needs-help", summary: "Awaiting review", evidence: ["No browser evidence"] },
    });
  });

  it("passes through an API-provided keyword sketch in public mode after server authorization", () => {
    setPublicModeForTests({ publicMode: true });
    try {
      const { snapshot } = loadNativeFeed({
        camps: [{ repo_key: "agentinfra", github_url: "https://github.com/asymetryk/agentinfra" }],
        units: [{ ...VALID_SNAPSHOT.units[0], prompt_tldr: "Prompt keywords: authorized detail" }],
      });
      expect(snapshot.bases[0]?.units[0]?.promptTldr).toBe("Prompt keywords: authorized detail");
    } finally {
      setPublicModeForTests(null);
    }
  });

  it("uses the safe display label for an opaque local repository identity", () => {
    const key = `local:sha256:${"a".repeat(64)}`;
    const { snapshot } = loadNativeFeed({
      fetched_at: "2026-09-22T15:00:00Z",
      camps: [{ repo_key: key, repo_label: "Policy Sentinel", github_url: null, stage: null }],
      units: [],
    });
    expect(snapshot.bases[0]?.repo).toBe("Policy Sentinel");
    expect(snapshot.bases[0]?.repoKey).toBe(key);
    expect(snapshot.bases[0]?.stage).toBe("unknown");
  });

  it("loads camps and units from a valid snapshot and tags source as native", () => {
    const { snapshot, rejected } = loadNativeFeed(VALID_SNAPSHOT, new Date("2026-09-22T16:00:00Z"));

    expect(rejected).toEqual([]);
    expect(snapshot.source).toBe(NATIVE_FEED_SOURCE);
    expect(snapshot.fetchedAt).toBe("2026-09-22T15:00:00Z");
    expect(snapshot.bases).toHaveLength(1);
    const [base] = snapshot.bases;
    expect(base).toBeDefined();
    expect(base?.repo).toBe("asymetryk/agentinfra");
    expect(base?.repoKey).toBe("agentinfra");
    expect(base?.openProject?.href).toBe("https://openproject.example/projects/coding-agent-hq");
    expect(base?.stage).toBe("active");
    expect(base?.units).toHaveLength(1);
    expect(base?.units[0]).toMatchObject({
      harness: "omp",
      model: "MiniMax-M3",
      threadName: "feed-contract-v0",
      status: "open",
    });
    expect(base?.units[0]?.lastPrompt).toBeNull();
  });

  it("drops units missing repo_key and keeps the rest of the snapshot", () => {
    const snapshot = {
      fetched_at: "2026-09-22T15:00:00Z",
      camps: [
        {
          repo_key: "homelab",
          github_url: "https://github.com/asymetryk/homelab",
          stage: "active",
        },
      ],
      units: [
        {
          id: "good",
          repo_key: "homelab",
          harness: "omp",
          model: "MiniMax-M3",
          destination: { kind: "repo", value: "asymetryk/homelab" },
          updated_at: "2026-09-22T15:30:00Z",
        },
        {
          id: "orphan",
          harness: "omp",
          model: "MiniMax-M3",
          destination: { kind: "repo", value: "asymetryk/homelab" },
        },
      ],
    };

    const { snapshot: loaded, rejected } = loadNativeFeed(snapshot);

    expect(loaded.bases).toHaveLength(1);
    expect(loaded.bases[0]?.units.map((u) => u.id)).toEqual(["good"]);
    expect(rejected).toEqual([{ reason: "missing-repo-key", id: "orphan" }]);
  });

  it("rejects units with destination.kind=label and accepts repo/path kinds", () => {
    const snapshot = {
      fetched_at: "2026-09-22T15:00:00Z",
      camps: [
        { repo_key: "policy-sentinel", github_url: "https://github.com/asymetryk/policy-sentinel" },
        { repo_key: "agentinfra", github_url: "https://github.com/asymetryk/agentinfra" },
      ],
      units: [
        // accepted: repo
        {
          id: "ok-repo",
          repo_key: "agentinfra",
          harness: "omp",
          model: "MiniMax-M3",
          destination: { kind: "repo", value: "asymetryk/agentinfra" },
          updated_at: "2026-09-22T15:30:00Z",
        },
        // accepted: path
        {
          id: "ok-path",
          repo_key: "agentinfra",
          harness: "omp",
          model: "MiniMax-M3",
          destination: { kind: "path", value: "asymetryk/agentinfra/docs" },
          updated_at: "2026-09-22T15:31:00Z",
        },
        // rejected: label
        {
          id: "bad-label",
          repo_key: "policy-sentinel",
          harness: "omp",
          model: "MiniMax-M3",
          destination: { kind: "label", value: "inbox" },
        },
        // rejected: bogus kind
        {
          id: "bad-kind",
          repo_key: "policy-sentinel",
          harness: "omp",
          model: "MiniMax-M3",
          destination: { kind: "branch", value: "main" },
        },
      ],
    };

    const { snapshot: loaded, rejected } = loadNativeFeed(snapshot);

    expect(loaded.bases).toHaveLength(2);
    const units = loaded.bases.flatMap((b) => b.units);
    expect(units.map((u) => u.id)).toEqual(["ok-repo", "ok-path"]);
    expect(rejected).toEqual([
      { reason: "label-destination", id: "bad-label" },
      { reason: "label-destination", id: "bad-kind" },
    ]);
  });

  it("uses the baked fixture and never reaches the cahq origin", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = (async (input) => {
      requested.push(String(input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const snapshot = await loadNativeFeedFixture(fetchImpl, new Date("2026-09-22T16:00:00Z"));

    expect(snapshot.source).toBe(NATIVE_FEED_SOURCE);
    // Derive expectations from the actual fixture instead of hard-coding the
    // old 3-camp stub. The fixture is the source of truth here.
    const parsedFixture = loadNativeFeed(fixture).snapshot;
    expect(snapshot.bases.map((b) => b.repo).sort()).toEqual(
      parsedFixture.bases.map((b) => b.repo).sort(),
    );
    expect(snapshot.bases).toHaveLength(parsedFixture.bases.length);
    expect(snapshot.fetchedAt).toBe(parsedFixture.fetchedAt);
    // Units must round-trip: every unit in the parsed fixture must appear.
    expect(snapshot.bases.flatMap((b) => b.units).length).toBe(
      parsedFixture.bases.flatMap((b) => b.units).length,
    );
    for (const base of snapshot.bases) {
      expect(base.repo.length).toBeGreaterThan(0);
      for (const unit of base.units) {
        expect(unit.lastPrompt).toBeNull();
      }
    }
    // The native fixture is statically imported and bundled by the build,
    // so no fetchImpl should be invoked at all — definitely not against the
    // cahq working-set origin.
    expect(requested).toEqual([]);
    for (const url of requested) {
      expect(url).not.toContain(CAHQ_WORKING_SET_ORIGIN);
      expect(url).not.toContain("cahq.tail21f530.ts.net");
    }
  });

  it("never carries prompt bodies — lastPrompt stays null on every unit", () => {
    const { snapshot } = loadNativeFeed(VALID_SNAPSHOT);
    for (const base of snapshot.bases) {
      for (const unit of base.units) {
        expect(unit.lastPrompt).toBeNull();
        expect(unit.hasContextSnippet).toBe(false);
      }
    }
  });

  it("loads the same-origin live snapshot with status, hierarchy, and freshness", async () => {
    const requested: string[] = [];
    const live = {
      ...VALID_SNAPSHOT,
      stale: true,
      notice: "Waiting for a source to report.",
      units: [{ ...VALID_SNAPSHOT.units[0], status: "completed", parent_id: "parent-1" }],
    };
    const fetchImpl = (async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response(JSON.stringify(live), { status: 200 });
    }) as typeof fetch;
    const loaded = await loadNativeFeedServer(fetchImpl);
    expect(requested).toEqual(["/api/v1/snapshot"]);
    expect(loaded.source).toBe("mirmicode");
    expect(loaded.stale).toBe(true);
    expect(loaded.metadataRevision).toBeUndefined();
    expect(loaded.notice).toBe("Waiting for a source to report.");
    expect(loaded.bases[0]?.units[0]).toMatchObject({ status: "completed", parentId: "parent-1" });
  });

  it("preserves shared appearance, link provenance, and only verified latest-thread destinations", () => {
    const { snapshot } = loadNativeFeed({
      metadata_revision: 3,
      camps: [{
        repo_key: "agentinfra",
        github_url: "https://github.com/asymetryk/agentinfra",
        buzz_channel_id: "b9faf317-85e2-4a89-ab4e-592791f70f3c",
        links: {
          github_url: "https://github.com/asymetryk/agentinfra",
          openproject_url: "https://openproject.example/projects/repo-agentinfra",
          buzz_url: null,
        },
        link_provenance: { github_url: "observation", openproject_url: "manual", buzz_url: "manual" },
        appearance: { color: "#ABCDEF", building_set: ["pad", "depot", "lab"] },
        latest_thread: {
          id: "task-42", title: "A recent task", url: "codex://threads/task-42",
          updated_at: "2026-09-22T15:30:00Z",
        },
      }],
      units: [{
        id: "task-42", repo_key: "agentinfra", harness: "Codex", model: "gpt-6-sol",
        native_url: "codex://threads/task-42", appearance: { color: "#123456", unit_role: "builder" },
        destination: { kind: "repo", value: "asymetryk/agentinfra" },
        updated_at: "2026-09-22T15:30:00Z",
      }],
    });

    expect(snapshot.metadataRevision).toBe(3);
    expect(snapshot.bases[0]).toMatchObject({
      appearance: { color: "#abcdef", buildingSet: ["pad", "depot", "lab"] },
      links: {
        githubUrl: "https://github.com/asymetryk/agentinfra",
        openProjectUrl: "https://openproject.example/projects/repo-agentinfra",
        buzzUrl: null,
      },
      linkProvenance: { githubUrl: "observation", openProjectUrl: "manual", buzzUrl: "manual" },
      buzzChannelId: "b9faf317-85e2-4a89-ab4e-592791f70f3c",
      latestThread: { id: "task-42", url: "codex://threads/task-42" },
    });
    expect(snapshot.bases[0]?.units[0]).toMatchObject({
      nativeUrl: "codex://threads/task-42",
      appearance: { color: "#123456", unitRole: "builder" },
    });
    const noLink = loadNativeFeed({
      camps: [{ repo_key: "agentinfra" }],
      units: [{ id: "task-43", repo_key: "agentinfra", harness: "Codex", destination: { kind: "repo" } }],
    }).snapshot;
    expect(noLink.bases[0]?.latestThread).toBeNull();
  });

  it("parseNativeFeedSnapshot throws on a non-object payload", () => {
    expect(() => parseNativeFeedSnapshot(null)).toThrow(/not an object/i);
    expect(() => parseNativeFeedSnapshot("nope")).toThrow(/not an object/i);
    expect(() => parseNativeFeedSnapshot([])).toThrow(/not an object/i);
  });
});
