import { describe, expect, it } from "vitest";
import { normalizeWorkingSetPayload } from "./adapters/normalize";
import { loadFixture } from "./adapters/source";
import {
  DEFAULT_NOISE_FILTER,
  applyNoiseFilter,
  drawsUnitTokens,
  exactToken,
  noiseReason,
  unitEmphasis,
} from "./mapNoise";

describe("exactToken", () => {
  it("matches the live strings and leaves near-synonyms alone", () => {
    expect(exactToken("not_seen")).toBe("not_seen");
    expect(exactToken(" NOT_SEEN ")).toBe("not_seen");
    expect(exactToken("archived")).toBe("archived");
    expect(exactToken("Detached")).toBe("detached");
    expect(exactToken("unknown")).toBe("unknown");
    expect(exactToken("present")).toBe("present");
    expect(exactToken("idle")).toBe("idle");
    expect(exactToken("not-seen")).toBe("not-seen");
    expect(exactToken("archive")).toBe("archive");
    expect(exactToken("")).toBeNull();
    expect(exactToken(null)).toBeNull();
    expect(exactToken(false)).toBeNull();
  });
});

describe("noiseReason", () => {
  const on = DEFAULT_NOISE_FILTER;

  it("hard-hides not_seen, archived, and annotation.hidden", () => {
    expect(noiseReason({ presence: "not_seen", lifecycle: "idle" }, on)).toBe("not_seen");
    expect(noiseReason({ presence: "NOT_SEEN", lifecycle: null }, on)).toBe("not_seen");
    expect(noiseReason({ presence: "present", lifecycle: "archived" }, on)).toBe("archived");
    expect(noiseReason({ presence: "present", lifecycle: "idle", hidden: true }, on)).toBe("hidden");
  });

  it("keeps detached and unknown visible, including a stale snapshot's units", () => {
    expect(noiseReason({ presence: "present", lifecycle: "detached" }, on)).toBeNull();
    expect(noiseReason({ presence: "present", lifecycle: "unknown", harness: "cursor" }, on)).toBeNull();
    expect(noiseReason({ presence: "present", lifecycle: "idle" }, on)).toBeNull();
    expect(noiseReason({ presence: "not-seen", lifecycle: "idle" }, on)).toBeNull();
    expect(noiseReason({ presence: null, lifecycle: null }, on)).toBeNull();
    expect(noiseReason({ presence: "not_seen", lifecycle: "archived", hidden: true }, { hideNoise: false })).toBeNull();

    const { bases, stale } = normalizeWorkingSetPayload({
      snapshot: { stale: true },
      items: [
        { item_id: "still-here", observed: { repo_name: "example/kept", lifecycle: "idle", presence: "present" } },
        { item_id: "gone", observed: { repo_name: "example/kept", lifecycle: "archived", presence: "present" } },
      ],
    });
    expect(stale).toBe(true);
    const filtered = applyNoiseFilter(bases, DEFAULT_NOISE_FILTER);
    expect(filtered.bases[0]?.units.map((unit) => unit.id)).toEqual(["still-here"]);
    expect(filtered.hiddenCount).toBe(1);
  });
});

describe("unitEmphasis", () => {
  it("dims detached and unknown, and demotes repo-less Cursor unknowns further", () => {
    expect(unitEmphasis({ presence: "present", lifecycle: "idle" }, "example/repo")).toBe("normal");
    expect(unitEmphasis({ presence: "present", lifecycle: "detached" }, "example/repo")).toBe("dim");
    expect(unitEmphasis({ presence: "present", lifecycle: "unknown", harness: "cursor" }, "example/repo")).toBe("dim");
    expect(unitEmphasis({ presence: "present", lifecycle: "unknown", harness: "codex" }, "Unassigned")).toBe("dim");
    expect(unitEmphasis({ presence: "present", lifecycle: "unknown", harness: "cursor" }, "Unassigned")).toBe("collector");
    expect(unitEmphasis({ presence: "present", lifecycle: "unknown", harness: "Cursor" }, "unassigned")).toBe("collector");
    expect(unitEmphasis({ presence: null, lifecycle: null, harness: "cursor" }, "Unassigned")).toBe("normal");
  });
});

describe("applyNoiseFilter", () => {
  it("drops empty bases, keeps detached, and sorts Unassigned collectors last", () => {
    const { bases } = normalizeWorkingSetPayload({
      items: [
        { item_id: "bc-cloud", observed: { surface: "cursor", lifecycle: "unknown", presence: "present", model: "Scout" } },
        { item_id: "kept", observed: { repo_name: "example/kept", surface: "codex", lifecycle: "idle", presence: "present" }, annotation: { status: "open" } },
        { item_id: "archived", observed: { repo_name: "example/empty", lifecycle: "archived", presence: "present" } },
        { item_id: "detached", observed: { surface: "codex", lifecycle: "detached", presence: "present", model: "Luna" } },
        { item_id: "hid", observed: { repo_name: "example/kept", lifecycle: "idle", presence: "present" }, annotation: { hidden: true, status: "done" } },
      ],
    });
    const filtered = applyNoiseFilter(bases, DEFAULT_NOISE_FILTER);
    expect(filtered.hiddenCount).toBe(2);
    expect(filtered.bases.map((base) => base.repo)).toEqual(["Unassigned", "example/kept"]);
    expect(filtered.bases[0]?.units.map((unit) => unit.id)).toEqual(["detached", "bc-cloud"]);
    expect(unitEmphasis(filtered.bases[0]!.units[0]!, "Unassigned")).toBe("dim");
    expect(unitEmphasis(filtered.bases[0]!.units[1]!, "Unassigned")).toBe("collector");
    expect(drawsUnitTokens("Unassigned")).toBe(false);
    expect(filtered.bases[1]?.units.map((unit) => unit.id)).toEqual(["kept"]);
  });

  it("does not throw when presence, lifecycle, and freshness are missing", () => {
    const { bases } = normalizeWorkingSetPayload({
      items: [{ item_id: "bare", observed: { repo_name: "example/bare", surface: "cursor", model: "Scout" } }],
    });
    const unit = bases[0]?.units[0];
    expect(unit).toMatchObject({ presence: null, lifecycle: null, status: null, freshness: null, hidden: false });
    expect(applyNoiseFilter(bases, DEFAULT_NOISE_FILTER).bases[0]?.units).toHaveLength(1);
  });
});

describe("sample fixture noise", () => {
  it("hides not_seen, archived, and operator-hidden, and keeps detached plus collectors", () => {
    const snapshot = loadFixture();
    expect(snapshot.stale).toBe(false);
    const filtered = applyNoiseFilter(snapshot.bases, DEFAULT_NOISE_FILTER);
    const visibleIds = filtered.bases.flatMap((base) => base.units.map((unit) => unit.id));
    const hiddenIds = [
      "mirmicode-not-seen",
      "mirmicode-not-seen-spaced",
      "mirmicode-archived",
      "mirmicode-operator-hidden",
      "unassigned-archived",
    ];
    for (const id of hiddenIds) expect(visibleIds).not.toContain(id);

    expect(visibleIds).toContain("mirmicode-grok");
    expect(visibleIds).toContain("mirmicode-detached");
    expect(visibleIds).toContain("mirmicode-cursor-unknown");
    expect(visibleIds).toContain("bc-collector");
    expect(visibleIds).toContain("unassigned-detached");
    expect(visibleIds).toContain("unassigned-codex-unknown");

    const unassigned = filtered.bases.find((base) => !drawsUnitTokens(base.repo));
    expect(unassigned).toBeTruthy();
    const tail = unassigned?.units.slice(-2).map((unit) => unit.id);
    expect(tail).toEqual(["bc-collector", "bc-collector-2"]);
    expect(filtered.hiddenCount).toBe(hiddenIds.length);

    const grok = snapshot.bases.flatMap((base) => base.units).find((unit) => unit.id === "mirmicode-grok");
    expect(grok).toMatchObject({
      lifecycle: "idle",
      status: "open",
      presence: "present",
      freshness: "2h",
    });
    expect(grok?.lastPrompt).toMatch(/last-prompt/i);
  });
});
