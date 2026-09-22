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

  it("hard-hides not_seen and annotation.hidden, and dims archived until asked", () => {
    expect(noiseReason({ presence: "not_seen", lifecycle: "idle" }, on)).toBe("not_seen");
    expect(noiseReason({ presence: "NOT_SEEN", lifecycle: null }, on)).toBe("not_seen");
    expect(noiseReason({ presence: "present", lifecycle: "archived" }, on)).toBeNull();
    expect(noiseReason({ presence: "present", lifecycle: "idle", hidden: true }, on)).toBe("hidden");
    expect(
      noiseReason({ presence: "present", lifecycle: "archived" }, { hideNoise: true, hideDetached: false, hideArchived: true }),
    ).toBe("archived");
  });

  it("keeps archived, detached, and unknown visible, including a stale snapshot's units", () => {
    expect(noiseReason({ presence: "present", lifecycle: "detached" }, on)).toBeNull();
    expect(noiseReason({ presence: "present", lifecycle: "archived" }, on)).toBeNull();
    expect(noiseReason({ presence: "present", lifecycle: "unknown", harness: "cursor" }, on)).toBeNull();
    expect(noiseReason({ presence: "present", lifecycle: "idle" }, on)).toBeNull();
    expect(noiseReason({ presence: "not-seen", lifecycle: "idle" }, on)).toBeNull();
    expect(noiseReason({ presence: null, lifecycle: null }, on)).toBeNull();
    expect(
      noiseReason({ presence: "present", lifecycle: "detached" }, { hideNoise: true, hideDetached: true, hideArchived: false }),
    ).toBe("detached");
    expect(
      noiseReason(
        { presence: "not_seen", lifecycle: "archived", hidden: true },
        { hideNoise: false, hideDetached: false, hideArchived: false },
      ),
    ).toBeNull();

    const { bases, stale } = normalizeWorkingSetPayload({
      snapshot: { stale: true },
      items: [
        { item_id: "still-here", observed: { repo_name: "example/kept", lifecycle: "idle", presence: "present" } },
        { item_id: "cold", observed: { repo_name: "example/kept", lifecycle: "archived", presence: "present" } },
      ],
    });
    expect(stale).toBe(true);
    const filtered = applyNoiseFilter(bases, DEFAULT_NOISE_FILTER);
    expect(filtered.bases[0]?.units.map((unit) => unit.id)).toEqual(["still-here", "cold"]);
    expect(unitEmphasis(filtered.bases[0]!.units[1]!, "example/kept")).toBe("dim");
    expect(filtered.hiddenCount).toBe(0);
  });
});

describe("unitEmphasis", () => {
  it("dims archived, detached, and unknown, and demotes repo-less Cursor unknowns further", () => {
    expect(unitEmphasis({ presence: "present", lifecycle: "idle" }, "example/repo")).toBe("normal");
    expect(unitEmphasis({ presence: "present", lifecycle: "archived" }, "example/repo")).toBe("dim");
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
    expect(filtered.hiddenCount).toBe(1);
    expect(filtered.bases.map((base) => base.repo)).toEqual(["Unassigned", "example/kept", "example/empty"]);
    expect(filtered.bases[0]?.units.map((unit) => unit.id)).toEqual(["detached", "bc-cloud"]);
    expect(unitEmphasis(filtered.bases[0]!.units[0]!, "Unassigned")).toBe("dim");
    expect(unitEmphasis(filtered.bases[0]!.units[1]!, "Unassigned")).toBe("collector");
    expect(drawsUnitTokens("Unassigned")).toBe(false);
    expect(filtered.bases[1]?.units.map((unit) => unit.id)).toEqual(["kept"]);
    expect(filtered.bases[2]?.units.map((unit) => unit.id)).toEqual(["archived"]);
    expect(unitEmphasis(filtered.bases[2]!.units[0]!, "example/empty")).toBe("dim");
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
  it("hides not_seen and operator-hidden, and keeps archived, detached, and collectors", () => {
    const snapshot = loadFixture();
    expect(snapshot.stale).toBe(false);
    const filtered = applyNoiseFilter(snapshot.bases, DEFAULT_NOISE_FILTER);
    const visibleIds = filtered.bases.flatMap((base) => base.units.map((unit) => unit.id));
    const hiddenIds = ["mirmicode-not-seen", "mirmicode-not-seen-spaced", "mirmicode-operator-hidden"];
    for (const id of hiddenIds) expect(visibleIds).not.toContain(id);

    expect(visibleIds).toContain("mirmicode-grok");
    expect(visibleIds).toContain("mirmicode-archived");
    expect(visibleIds).toContain("unassigned-archived");
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

    const archived = snapshot.bases.flatMap((base) => base.units).find((unit) => unit.id === "mirmicode-archived");
    expect(unitEmphasis(archived!, "asymetryk/mirmicode")).toBe("dim");

    const withoutDetached = applyNoiseFilter(snapshot.bases, { hideNoise: true, hideDetached: true, hideArchived: false });
    const stillVisible = withoutDetached.bases.flatMap((base) => base.units.map((unit) => unit.id));
    expect(stillVisible).not.toContain("mirmicode-detached");
    expect(stillVisible).not.toContain("unassigned-detached");
    expect(withoutDetached.hiddenCount).toBeGreaterThan(filtered.hiddenCount);
  });
});

describe("live feed shape", () => {
  /**
   * Marginal counts from the confirmed cahq snapshot.
   * They describe the payload shape in this test only. The map computes its own counts.
   */
  const SHAPE = {
    items: 150,
    present: 98,
    notSeen: 52,
    idle: 84,
    detached: 36,
    unknown: 23,
    archived: 7,
    unassigned: 135,
  } as const;

  it("collapses null repo and repo_name into one Unassigned base and filters the live vocabulary", () => {
    const items = liveShapeItems();
    expect(items).toHaveLength(SHAPE.items);
    expect(items.filter((item) => item.observed.presence === "present")).toHaveLength(SHAPE.present);
    expect(items.filter((item) => item.observed.presence === "not_seen")).toHaveLength(SHAPE.notSeen);
    expect(items.filter((item) => item.observed.lifecycle === "idle")).toHaveLength(SHAPE.idle);
    expect(items.filter((item) => item.observed.lifecycle === "detached")).toHaveLength(SHAPE.detached);
    expect(items.filter((item) => item.observed.lifecycle === "unknown")).toHaveLength(SHAPE.unknown);
    expect(items.filter((item) => item.observed.lifecycle === "archived")).toHaveLength(SHAPE.archived);
    expect(items.filter((item) => item.observed.repo === null && item.observed.repo_name === null)).toHaveLength(
      SHAPE.unassigned,
    );

    const normalized = normalizeWorkingSetPayload({ snapshot: { stale: false }, items });
    expect(normalized.stale).toBe(false);
    const unassignedRaw = normalized.bases.filter((base) => !drawsUnitTokens(base.repo));
    expect(unassignedRaw).toHaveLength(1);
    expect(unassignedRaw[0]?.units).toHaveLength(SHAPE.unassigned);
    expect(normalized.bases.filter((base) => drawsUnitTokens(base.repo)).reduce((sum, base) => sum + base.units.length, 0)).toBe(
      SHAPE.items - SHAPE.unassigned,
    );

    const filtered = applyNoiseFilter(normalized.bases, DEFAULT_NOISE_FILTER);
    const visible = filtered.bases.flatMap((base) => base.units);
    expect(visible.some((unit) => unit.presence === "not_seen")).toBe(false);
    expect(visible.filter((unit) => unit.lifecycle === "archived")).toHaveLength(SHAPE.archived);
    expect(visible.filter((unit) => unit.lifecycle === "archived").every((unit) => unitEmphasis(unit) === "dim")).toBe(true);
    expect(visible.some((unit) => unit.lifecycle === "detached")).toBe(true);
    expect(visible.some((unit) => unit.lifecycle === "unknown")).toBe(true);
    expect(filtered.bases.filter((base) => !drawsUnitTokens(base.repo))).toHaveLength(1);
    expect(drawsUnitTokens(filtered.bases.find((base) => base.repo === "Unassigned")?.repo ?? "")).toBe(false);

    const kept = filtered.bases.find((base) => base.repo === "example/kept");
    expect(kept && drawsUnitTokens(kept.repo)).toBe(true);
    expect(kept?.units.length).toBeGreaterThan(0);

    const unassigned = filtered.bases.find((base) => base.repo === "Unassigned");
    const collectors = unassigned?.units.filter((unit) => unitEmphasis(unit, "Unassigned") === "collector") ?? [];
    expect(collectors.length).toBeGreaterThan(0);
    expect(collectors.every((unit) => unit.harness === "cursor" && unit.lifecycle === "unknown")).toBe(true);
    expect(unassigned?.units.slice(-collectors.length).every((unit) => unitEmphasis(unit, "Unassigned") === "collector")).toBe(true);
    expect(visible.length + filtered.hiddenCount).toBe(SHAPE.items);

    const detachedHidden = applyNoiseFilter(normalized.bases, { hideNoise: true, hideDetached: true, hideArchived: false });
    expect(detachedHidden.bases.flatMap((base) => base.units).some((unit) => unit.lifecycle === "detached")).toBe(false);
    expect(detachedHidden.hiddenCount).toBe(filtered.hiddenCount + SHAPE.detached);

    const archivedHidden = applyNoiseFilter(normalized.bases, { hideNoise: true, hideDetached: false, hideArchived: true });
    expect(archivedHidden.bases.flatMap((base) => base.units).some((unit) => unit.lifecycle === "archived")).toBe(false);
    expect(archivedHidden.hiddenCount).toBe(filtered.hiddenCount + SHAPE.archived);
  });
});

type ShapeItem = {
  item_id: string;
  observed: {
    surface: string;
    lifecycle: string;
    presence: string;
    repo: string | null;
    repo_name: string | null;
  };
  annotation: { status: "open" };
};

function liveShapeItems(): ShapeItem[] {
  return Array.from({ length: 150 }, (_, index) => {
    const lifecycle =
      index < 7 ? "archived" : index < 30 ? "unknown" : index < 66 ? "detached" : "idle";
    const presence = index < 98 ? "present" : "not_seen";
    const assigned = index % 10 === 0;
    const unassigned = !assigned;
    const surface = lifecycle === "unknown" && unassigned ? "cursor" : "codex";
    return {
      item_id: `shape-${index}`,
      observed: {
        surface,
        lifecycle,
        presence,
        repo: null,
        repo_name: assigned ? "example/kept" : null,
      },
      annotation: { status: "open" },
    };
  });
}
