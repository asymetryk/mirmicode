import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/feed-v0-snapshot.json";
import { CAHQ_WORKING_SET_ORIGIN } from "./source";
import {
  NATIVE_FEED_SOURCE,
  loadNativeFeed,
  loadNativeFeedFixture,
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
  it("loads camps and units from a valid snapshot and tags source as native", () => {
    const { snapshot, rejected } = loadNativeFeed(VALID_SNAPSHOT, new Date("2026-09-22T16:00:00Z"));

    expect(rejected).toEqual([]);
    expect(snapshot.source).toBe(NATIVE_FEED_SOURCE);
    expect(snapshot.fetchedAt).toBe("2026-09-22T15:00:00Z");
    expect(snapshot.bases).toHaveLength(1);
    const [base] = snapshot.bases;
    expect(base).toBeDefined();
    expect(base?.repo).toBe("asymetryk/agentinfra");
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
    const fetchImpl: typeof fetch = async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

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
    for (const url of requested) {
      expect(url).not.toContain(CAHQ_WORKING_SET_ORIGIN);
      expect(url).not.toContain("cahq.tail21f530.ts.net");
    }
    // The native path should never import or call the working-set helpers;
    // the adapter has no fetchImpl dependency on working-set at all.
    expect(requested.length).toBeGreaterThanOrEqual(1);
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

  it("parseNativeFeedSnapshot throws on a non-object payload", () => {
    expect(() => parseNativeFeedSnapshot(null)).toThrow(/not an object/i);
    expect(() => parseNativeFeedSnapshot("nope")).toThrow(/not an object/i);
    expect(() => parseNativeFeedSnapshot([])).toThrow(/not an object/i);
  });
});
