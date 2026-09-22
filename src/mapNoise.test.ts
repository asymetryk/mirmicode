import { describe, expect, it } from "vitest";
import { normalizeWorkingSetPayload } from "./adapters/normalize";
import { loadFixture } from "./adapters/source";
import {
  DEFAULT_NOISE_FILTER,
  applyNoiseFilter,
  drawsUnitTokens,
  exactToken,
  noiseReason,
} from "./mapNoise";

describe("exactToken", () => {
  it("matches the live strings and leaves near-synonyms alone", () => {
    expect(exactToken("not_seen")).toBe("not_seen");
    expect(exactToken(" NOT_SEEN ")).toBe("not_seen");
    expect(exactToken("archived")).toBe("archived");
    expect(exactToken("Detached")).toBe("detached");
    expect(exactToken("unknown")).toBe("unknown");
    expect(exactToken("not-seen")).toBe("not-seen");
    expect(exactToken("Not Seen")).toBe("not seen");
    expect(exactToken("unseen")).toBe("unseen");
    expect(exactToken("archive")).toBe("archive");
    expect(exactToken("detach")).toBe("detach");
    expect(exactToken("offline")).toBe("offline");
    expect(exactToken("idle")).toBe("idle");
    expect(exactToken("")).toBeNull();
    expect(exactToken("   ")).toBeNull();
    expect(exactToken(null)).toBeNull();
    expect(exactToken(undefined)).toBeNull();
    expect(exactToken(3)).toBeNull();
  });
});

describe("noiseReason", () => {
  const on = DEFAULT_NOISE_FILTER;

  it("hides the live presence and lifecycle strings", () => {
    expect(noiseReason({ presence: "not_seen", lifecycle: "active" }, on, "example/repo")).toBe("not_seen");
    expect(noiseReason({ presence: "NOT_SEEN", lifecycle: null }, on)).toBe("not_seen");
    expect(noiseReason({ presence: "seen", lifecycle: "archived" }, on)).toBe("archived");
    expect(noiseReason({ presence: "seen", lifecycle: "detached" }, on)).toBe("detached");
    expect(noiseReason({ presence: "seen", lifecycle: "Detached" }, on)).toBe("detached");
  });

  it("hides repo-less Cursor units whose lifecycle is unknown", () => {
    expect(
      noiseReason({ presence: "seen", lifecycle: "unknown", harness: "cursor" }, on, "Unassigned"),
    ).toBe("cursor_collector");
    expect(
      noiseReason({ presence: "seen", lifecycle: "Unknown", harness: "Cursor" }, on, "unassigned"),
    ).toBe("cursor_collector");
    expect(
      noiseReason({ presence: "seen", lifecycle: "unknown", harness: "cursor" }, on, "example/repo"),
    ).toBeNull();
    expect(
      noiseReason({ presence: "seen", lifecycle: "unknown", harness: "codex" }, on, "Unassigned"),
    ).toBeNull();
    expect(
      noiseReason({ presence: null, lifecycle: null, harness: "cursor" }, on, "Unassigned"),
    ).toBeNull();
  });

  it("skips a rule when that field is absent and keeps near-synonyms", () => {
    expect(noiseReason({ presence: null, lifecycle: null }, on)).toBeNull();
    expect(noiseReason({ presence: "not-seen", lifecycle: "active" }, on)).toBeNull();
    expect(noiseReason({ presence: "offline", lifecycle: "idle" }, on)).toBeNull();
    expect(noiseReason({ presence: "unseen", lifecycle: "archive" }, on)).toBeNull();
    expect(noiseReason({ presence: "seen", lifecycle: "active" }, on)).toBeNull();
    expect(noiseReason({ presence: "seen", lifecycle: "unknown", harness: "cursor" }, { hideNoise: false }, "Unassigned")).toBeNull();
  });
});

describe("applyNoiseFilter", () => {
  it("drops empty bases and keeps Unassigned as one bucket", () => {
    const { bases } = normalizeWorkingSetPayload({
      items: [
        { item_id: "gone", observed: { surface: "cursor", presence: "not_seen", lifecycle: "active" } },
        { item_id: "kept", observed: { repo_name: "example/kept", surface: "codex", lifecycle: "active" }, annotation: { status: "working" } },
        { item_id: "also-gone", observed: { repo_name: "example/empty", presence: "seen", lifecycle: "archived" } },
        { item_id: "bc-cloud", observed: { surface: "cursor", lifecycle: "unknown", model: "Scout" } },
        { item_id: "codex-open", observed: { surface: "codex", lifecycle: "unknown", model: "Luna" } },
      ],
    });
    const filtered = applyNoiseFilter(bases, DEFAULT_NOISE_FILTER);
    expect(filtered.hiddenCount).toBe(3);
    expect(filtered.bases.map((base) => base.repo)).toEqual(["Unassigned", "example/kept"]);
    expect(filtered.bases[0]?.units.map((unit) => unit.id)).toEqual(["codex-open"]);
    expect(drawsUnitTokens("example/kept")).toBe(true);
    expect(drawsUnitTokens("Unassigned")).toBe(false);
  });

  it("does not throw when presence and lifecycle are missing", () => {
    const { bases } = normalizeWorkingSetPayload({
      items: [{ item_id: "bare", observed: { repo_name: "example/bare", surface: "cursor", model: "Scout" } }],
    });
    const unit = bases[0]?.units[0];
    expect(unit).toMatchObject({ presence: null, lifecycle: null, status: null });
    expect(applyNoiseFilter(bases, DEFAULT_NOISE_FILTER).bases[0]?.units).toHaveLength(1);
  });
});

describe("sample fixture noise", () => {
  it("hides live noise strings and repo-less Cursor unknowns, and keeps one Unassigned base", () => {
    const snapshot = loadFixture();
    const filtered = applyNoiseFilter(snapshot.bases, DEFAULT_NOISE_FILTER);
    const visibleIds = filtered.bases.flatMap((base) => base.units.map((unit) => unit.id));
    const hiddenIds = [
      "mirmicode-not-seen",
      "mirmicode-not-seen-spaced",
      "mirmicode-archived",
      "mirmicode-detached",
      "unassigned-archived",
      "unassigned-detached",
      "bc-collector",
      "bc-collector-2",
    ];
    for (const id of hiddenIds) expect(visibleIds).not.toContain(id);

    expect(visibleIds).toContain("mirmicode-grok");
    expect(visibleIds).toContain("mirmicode-cursor-unknown");
    expect(visibleIds).toContain("mirmicode-unknown-status");
    expect(visibleIds).toContain("unassigned-not-seen");
    expect(visibleIds).toContain("unassigned-codex-unknown");
    expect(visibleIds).toContain("unassigned-astra");
    expect(visibleIds).toContain("unassigned-kimi");

    const unassigned = filtered.bases.filter((base) => !drawsUnitTokens(base.repo));
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0]?.units.length).toBeGreaterThan(1);
    expect(filtered.hiddenCount).toBe(hiddenIds.length);

    const rawUnassigned = snapshot.bases.find((base) => base.repo === "Unassigned");
    expect(rawUnassigned?.units.length).toBeGreaterThan(unassigned[0]?.units.length ?? 0);

    const grok = snapshot.bases.flatMap((base) => base.units).find((unit) => unit.id === "mirmicode-grok");
    expect(grok?.lifecycle).toBe("active");
    expect(grok?.presence).toBe("seen");
    expect(grok?.lastPrompt).toMatch(/last-prompt/i);
  });
});
