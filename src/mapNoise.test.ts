import { describe, expect, it } from "vitest";
import { normalizeWorkingSetPayload } from "./adapters/normalize";
import { loadFixture } from "./adapters/source";
import {
  DEFAULT_NOISE_FILTER,
  applyNoiseFilter,
  compactField,
  drawsUnitTokens,
  noiseReason,
} from "./mapNoise";

describe("compactField", () => {
  it("folds spacing and punctuation and leaves near-synonyms alone", () => {
    expect(compactField("not_seen")).toBe("notseen");
    expect(compactField("Not-Seen")).toBe("notseen");
    expect(compactField(" not seen ")).toBe("notseen");
    expect(compactField("ARCHIVED")).toBe("archived");
    expect(compactField("Detached")).toBe("detached");
    expect(compactField("offline")).toBe("offline");
    expect(compactField("unseen")).toBe("unseen");
    expect(compactField("archive")).toBe("archive");
    expect(compactField("detach")).toBe("detach");
    expect(compactField("idle")).toBe("idle");
    expect(compactField("")).toBeNull();
    expect(compactField("   ")).toBeNull();
    expect(compactField(null)).toBeNull();
    expect(compactField(undefined)).toBeNull();
    expect(compactField(3)).toBeNull();
  });
});

describe("noiseReason", () => {
  const on = DEFAULT_NOISE_FILTER;

  it("hides not_seen, archived, detached, and unknown status", () => {
    expect(noiseReason({ presence: "not_seen", lifecycle: "active", status: "idle" }, on)).toBe("not_seen");
    expect(noiseReason({ presence: "not-seen", lifecycle: null, status: null }, on)).toBe("not_seen");
    expect(noiseReason({ presence: "seen", lifecycle: "archived", status: "idle" }, on)).toBe("archived");
    expect(noiseReason({ presence: "seen", lifecycle: "detached", status: "working" }, on)).toBe("detached");
    expect(noiseReason({ presence: "seen", lifecycle: "active", status: "Unknown" }, on)).toBe("unknown");
  });

  it("skips a rule when that field is absent and keeps near-synonyms", () => {
    expect(noiseReason({ presence: null, lifecycle: null, status: null }, on)).toBeNull();
    expect(noiseReason({ presence: "offline", lifecycle: "idle", status: "idle" }, on)).toBeNull();
    expect(noiseReason({ presence: "unseen", lifecycle: "archive", status: "working" }, on)).toBeNull();
    expect(noiseReason({ presence: "seen", lifecycle: "active", status: "idle" }, on)).toBeNull();
    expect(noiseReason({ presence: null, lifecycle: "archived", status: null }, { hideNoise: false, hideUnknownStatus: true })).toBeNull();
    expect(noiseReason({ presence: null, lifecycle: null, status: "unknown" }, { hideNoise: true, hideUnknownStatus: false })).toBeNull();
  });
});

describe("applyNoiseFilter", () => {
  it("drops empty bases and keeps Unassigned as one bucket", () => {
    const { bases } = normalizeWorkingSetPayload({
      items: [
        { item_id: "gone", observed: { surface: "cursor", presence: "not_seen", lifecycle: "active" } },
        { item_id: "kept", observed: { repo_name: "example/kept", surface: "codex", lifecycle: "active" }, annotation: { status: "working" } },
        { item_id: "also-gone", observed: { repo_name: "example/empty", presence: "seen", lifecycle: "archived" } },
      ],
    });
    const filtered = applyNoiseFilter(bases, DEFAULT_NOISE_FILTER);
    expect(filtered.hiddenCount).toBe(2);
    expect(filtered.bases.map((base) => base.repo)).toEqual(["example/kept"]);
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
  it("hides not_seen, archived, detached, and unknown while keeping one Unassigned base", () => {
    const snapshot = loadFixture();
    const filtered = applyNoiseFilter(snapshot.bases, DEFAULT_NOISE_FILTER);
    const visibleIds = filtered.bases.flatMap((base) => base.units.map((unit) => unit.id));
    const hiddenIds = [
      "mirmicode-not-seen",
      "mirmicode-not-seen-spaced",
      "mirmicode-archived",
      "mirmicode-detached",
      "mirmicode-unknown-status",
      "unassigned-not-seen",
      "unassigned-archived",
      "unassigned-detached",
      "unassigned-unknown",
    ];
    for (const id of hiddenIds) expect(visibleIds).not.toContain(id);

    expect(visibleIds).toContain("mirmicode-grok");
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
