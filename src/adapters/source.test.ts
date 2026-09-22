import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sampleBases from "../data/sample-bases.json";
import { postureOf } from "../factions";
import { BUILDING_OFFSET, fitView, positionBases, resourcePlacements, unitSlot } from "../layout";
import {
  BUILDING_KINDS,
  RESOURCE_KINDS,
  UNIT_ROLES,
  buildingSrc,
  dominantFaction,
  glyphId,
  heroSrc,
  markerSrc,
  outpostSrc,
  resourceSrc,
  unitRole,
  unitSrc,
} from "../rtsArt";
import { normalizeWorkingSetPayload } from "./normalize";
import { loadFixture, parseWorkingSetUrl, resolveSnapshot } from "./source";

describe("normalizeWorkingSetPayload", () => {
  it("reads the canonical contract", () => {
    const normalized = normalizeWorkingSetPayload({
      bases: [
        {
          id: "alpha",
          repo: "example/alpha",
          label: "Alpha label",
          thread_name: "alpha-thread",
          harness: "Cursor",
          model: "demo-model",
          updated_at: "2026-09-21T12:00:00Z",
          x: 0.25,
          y: 0.5,
        },
      ],
    });

    expect(normalized.issues).toEqual([]);
    expect(normalized.bases).toHaveLength(1);
    expect(normalized.bases[0]).toMatchObject({
      repo: "example/alpha",
      label: null,
      updatedAt: "2026-09-21T12:00:00Z",
      place: { x: 0.25, y: 0.5 },
    });
    expect(normalized.bases[0]?.units).toEqual([
      expect.objectContaining({
        id: "alpha",
        harness: "cursor",
        model: "demo-model",
        threadName: "alpha-thread",
        label: "Alpha label",
      }),
    ]);
  });

  it("groups flat rows for one repo into units", () => {
    const normalized = normalizeWorkingSetPayload({
      records: [
        {
          repo: "example/shared",
          harness: "cursor",
          model: "Gemini",
          thread_name: "one",
          updated_at: "2026-09-21T01:00:00Z",
        },
        {
          repo: "Example/shared",
          surface: "codex",
          model: "Luna",
          threadName: "two",
          status: "active",
          updated_at: "2026-09-21T05:00:00Z",
        },
      ],
    });

    expect(normalized.bases).toHaveLength(1);
    expect(normalized.bases[0]?.updatedAt).toBe("2026-09-21T05:00:00Z");
    expect(normalized.bases[0]?.units.map((unit) => [unit.harness, unit.model, unit.status])).toEqual([
      ["cursor", "Gemini", null],
      ["codex", "Luna", "active"],
    ]);
  });

  it("reads a grouped base with an agents array and ignores the parent harness", () => {
    const normalized = normalizeWorkingSetPayload({
      bases: [
        {
          id: "grouped",
          repo: "example/grouped",
          label: "Grouped base",
          harness: "cursor",
          model: "Gemini",
          x: 0.4,
          y: 0.6,
          agents: [
            {
              harness: "ohmypi",
              model: "Kimi",
              status: "idle",
              thread_name: "kimi-thread",
              transcript: "do not keep",
            },
          ],
        },
      ],
    });

    expect(normalized.bases[0]).toMatchObject({
      id: "grouped",
      label: "Grouped base",
      place: { x: 0.4, y: 0.6 },
    });
    expect(normalized.bases[0]?.units).toHaveLength(1);
    expect(normalized.bases[0]?.units[0]).toMatchObject({
      harness: "ohmypi",
      model: "Kimi",
      status: "idle",
      threadName: "kimi-thread",
    });
    expect(JSON.stringify(normalized.bases[0])).not.toContain("do not keep");
    expect(JSON.stringify(normalized.bases[0])).not.toContain("Gemini");
  });

  it("accepts surface, base, threadName, and last_touched aliases", () => {
    const normalized = normalizeWorkingSetPayload({
      items: [
        {
          base: { full_name: "example/nested" },
          surface: "OpenCode",
          threadName: "nested-thread",
          model: "",
          last_touched: "2026-09-20T00:00:00Z",
        },
      ],
    });

    expect(normalized.bases[0]).toMatchObject({
      repo: "example/nested",
      label: null,
      updatedAt: "2026-09-20T00:00:00Z",
    });
    expect(normalized.bases[0]?.units[0]).toMatchObject({
      harness: "opencode",
      model: "unknown",
      threadName: "nested-thread",
    });
  });

  it("accepts a bare array and a records wrapper", () => {
    const fromArray = normalizeWorkingSetPayload([
      { project: "example/array", label: "Array", updatedAt: "2026-09-01T00:00:00Z" },
    ]);
    const fromRecords = normalizeWorkingSetPayload({
      records: [{ repository: "example/records", title: "ignored" }],
    });

    expect(fromArray.bases[0]?.repo).toBe("example/array");
    expect(fromArray.bases[0]?.units[0]?.label).toBe("Array");
    expect(fromArray.bases[0]?.updatedAt).toBe("2026-09-01T00:00:00Z");
    expect(fromRecords.bases[0]?.repo).toBe("example/records");
    expect(fromRecords.bases[0]?.label).toBeNull();
    expect(fromRecords.bases[0]?.units[0]?.label).toBeNull();
  });

  it("drops records without a repo and reports an empty payload", () => {
    const dropped = normalizeWorkingSetPayload({
      bases: [{ label: "no repo" }, { repo: "example/kept", label: "kept" }],
    });
    const empty = normalizeWorkingSetPayload({ ok: true });

    expect(dropped.bases.map((base) => base.repo)).toEqual(["example/kept"]);
    expect(dropped.issues[0]).toMatch(/missing repo\/base/);
    expect(empty.bases).toEqual([]);
    expect(empty.issues[0]).toMatch(/no bases, items, or records/);
  });

  it("ignores placement outside 0–1 and suffixes duplicate ids", () => {
    const normalized = normalizeWorkingSetPayload({
      bases: [
        { id: "same", repo: "example/one", x: 2, y: 0.2 },
        { id: "same", repo: "example/two" },
      ],
    });

    expect(normalized.bases[0]?.place).toBeNull();
    expect(normalized.bases[0]?.units[0]?.id).toBe("same");
    expect(normalized.bases[1]?.units[0]?.id).toBe("same-2");
  });

  it("suffixes duplicate base ids on grouped records", () => {
    const normalized = normalizeWorkingSetPayload({
      bases: [
        { id: "same", repo: "example/one", units: [{ harness: "codex", model: "Luna" }] },
        { id: "same", repo: "example/two", units: [{ harness: "codex", model: "Sol" }] },
      ],
    });
    expect(normalized.bases.map((base) => base.id)).toEqual(["same", "same-2"]);
    expect(normalized.bases[0]?.units).toHaveLength(1);
    expect(normalized.bases[1]?.units).toHaveLength(1);
  });

  it("bounds oversized text and leaves unknown fields unread", () => {
    const normalized = normalizeWorkingSetPayload({
      bases: [
        {
          repo: "example/long",
          label: "L".repeat(400),
          transcript: "should never be copied",
          messages: ["secret conversation"],
        },
      ],
    });
    const unit = normalized.bases[0]?.units[0];
    expect(unit?.label?.endsWith("…")).toBe(true);
    expect(unit?.label?.length).toBeLessThanOrEqual(180);
    expect(JSON.stringify(normalized.bases[0])).not.toContain("secret conversation");
  });
});

describe("resolveSnapshot", () => {
  it("loads the committed fixture when no URL is set", async () => {
    const result = await resolveSnapshot("");
    expect(result.fallbackReason).toBeNull();
    expect(result.snapshot.source).toBe("fixture");
    expect(result.snapshot.bases.length).toBeGreaterThanOrEqual(3);
  });

  it("returns working-set bases from a JSON URL", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          bases: [
            {
              repo: "example/live",
              surface: "codex",
              model: "demo",
              thread_name: "live-thread",
              label: "Live label",
              updated_at: "2026-09-21T00:00:00Z",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const result = await resolveSnapshot("https://working-set.example/bases", fetchImpl);
    expect(result.fallbackReason).toBeNull();
    expect(result.snapshot.source).toBe("working-set");
    expect(result.snapshot.bases[0]?.repo).toBe("example/live");
    expect(result.snapshot.bases[0]?.units[0]).toMatchObject({
      harness: "codex",
      model: "demo",
      threadName: "live-thread",
      label: "Live label",
    });
  });

  it("falls back to the fixture when the request fails", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("Could not resolve host");
    };
    const result = await resolveSnapshot("https://working-set.example/bases", fetchImpl);
    expect(result.snapshot.source).toBe("fixture");
    expect(result.fallbackReason).toBe("Could not resolve host. Showing the local fixture.");
  });

  it("turns a network TypeError into a readable fallback", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const result = await resolveSnapshot("https://working-set.example/bases", fetchImpl);
    expect(result.snapshot.source).toBe("fixture");
    expect(result.fallbackReason).toBe(
      "Working Set could not be reached. Showing the local fixture.",
    );
  });

  it("rejects credentials and non-http URLs", () => {
    expect(() => parseWorkingSetUrl("https://user:pw@example.com/bases")).toThrow(/credentials/);
    expect(() => parseWorkingSetUrl("file:///tmp/bases.json")).toThrow(/http or https/);
  });
});

describe("sample fixture", () => {
  it("has at least three bases and several factions of units on each", () => {
    const raw = sampleBases;
    expect(raw.bases.length).toBeGreaterThanOrEqual(3);

    const snapshot = loadFixture();
    expect(snapshot.notice).toBeNull();
    expect(snapshot.bases.length).toBe(raw.bases.length);

    for (const base of snapshot.bases) {
      expect(base.units.length).toBeGreaterThanOrEqual(2);
      const factions = new Set(base.units.map((unit) => unit.harness));
      expect(factions.size).toBeGreaterThanOrEqual(2);
      for (const unit of base.units) {
        expect(unit.harness.length).toBeGreaterThan(0);
        expect(unit.model.length).toBeGreaterThan(0);
        expect(unit.threadName || unit.status).toBeTruthy();
        expect(unit.updatedAt).not.toBe("unknown");
      }
    }

    const harnesses = new Set(snapshot.bases.flatMap((base) => base.units.map((unit) => unit.harness)));
    expect(harnesses.has("cursor")).toBe(true);
    expect(harnesses.has("codex")).toBe(true);
    expect(harnesses.has("ohmypi")).toBe(true);
  });
});

describe("posture", () => {
  it("maps working, idle, and blocked words", () => {
    expect(postureOf("working")).toBe("working");
    expect(postureOf("active")).toBe("working");
    expect(postureOf("idle")).toBe("idle");
    expect(postureOf("blocked")).toBe("blocked");
    expect(postureOf("queued")).toBe("blocked");
    expect(postureOf(null)).toBe("idle");
  });
});

describe("rts sprites", () => {
  it("maps each known model onto one crest, stable across factions", () => {
    expect(glyphId("Astra")).toBe("a");
    expect(glyphId("Sol")).toBe("a");
    expect(glyphId("MiniMax")).toBe("a");
    expect(glyphId("Luna")).toBe("b");
    expect(glyphId("Grok-4.6")).toBe("b");
    expect(glyphId("Kimi")).toBe("b");
    expect(glyphId("Terra")).toBe("c");
    expect(glyphId("Gemini")).toBe("c");
    expect(glyphId("unknown-model")).toBeNull();
  });

  it("points heroes and outposts at the committed png pack", () => {
    expect(heroSrc("cursor")).toBe("/rts-art/hero-cursor-angular.png");
    expect(heroSrc("codex")).toBe("/rts-art/hero-codex-organic.png");
    expect(heroSrc("ohmypi")).toBe("/rts-art/hero-ohmypi-mechanical.png");
    expect(heroSrc("opencode")).toBeNull();
    expect(outpostSrc("Cursor")).toBe("/rts-art/building-outpost-cursor.png");
  });

  it("maps models and explicit types onto staged v2 sprites", () => {
    expect(unitRole("Astra")).toBe("scout");
    expect(unitRole("Luna")).toBe("worker");
    expect(unitRole("Terra")).toBe("drone");
    expect(unitRole("Sol")).toBe("tankette");
    expect(unitRole("Grok-4.6")).toBe("walker");
    expect(unitRole("Gemini")).toBe("medic");
    expect(unitRole("MiniMax")).toBe("mirmi-small");
    expect(unitRole("Kimi")).toBe("mirmi-armed");
    expect(unitRole("Scout")).toBe("scout");
    expect(unitRole("Mirmi-armed")).toBe("mirmi-armed");
    expect(unitRole("Mirmi-small")).toBe("mirmi-small");
    expect(unitRole("unknown-model")).toBeNull();

    expect(unitSrc("cursor", "Grok-4.6")).toBe("/rts-art-v2/units/cursor-walker-07.png");
    expect(unitSrc("codex", "Luna")).toBe("/rts-art-v2/units/codex-worker-bot-02.png");
    expect(unitSrc("ohmypi", "Builder")).toBe("/rts-art-v2/units/ohmypi-builder-bot-10.png");
    expect(unitSrc("opencode", "Walker")).toBe("/rts-art-v2/units/neutral-walker-07.png");
    expect(unitSrc("opencode", "Scout")).toBe("/rts-art-v2/units/neutral-scout-bot-01.png");
    expect(unitSrc("opencode", "Mirmi-small")).toBeNull();
    expect(unitSrc("opencode", "Skiff")).toBeNull();
    expect(unitSrc("opencode", "unknown-model")).toBeNull();

    expect(buildingSrc("cursor", "pad")).toBe("/rts-art-v2/buildings/cursor-pad-01.png");
    expect(buildingSrc("codex", "lab")).toBe("/rts-art-v2/buildings/codex-lab-06.png");
    expect(buildingSrc("ohmypi", "turret")).toBe("/rts-art-v2/buildings/ohmypi-turret-03.png");
    expect(buildingSrc(null, "depot")).toBe("/rts-art-v2/buildings/neutral-depot-02.png");
    expect(buildingSrc(null, "pad")).toBeNull();
    expect(resourceSrc("ohmypi", "scrap")).toBe("/rts-art-v2/resources/ohmypi-scrap-pile-03.png");
    expect(resourceSrc(null, "crystal")).toBe("/rts-art-v2/resources/neutral-crystal-node-01.png");
    expect(markerSrc("cursor", "working")).toBe("/rts-art-v2/fx/cursor-work-marker-02.png");
    expect(markerSrc("codex", "idle")).toBe("/rts-art-v2/fx/codex-idle-marker-01.png");
    expect(markerSrc("opencode", "working")).toBe("/rts-art-v2/fx/neutral-work-marker-02.png");

    for (const faction of ["cursor", "codex", "ohmypi"] as const) {
      for (const role of UNIT_ROLES) {
        expectPublic(unitSrc(faction, role));
      }
      for (const kind of BUILDING_KINDS) {
        expectPublic(buildingSrc(faction, kind));
      }
      for (const kind of RESOURCE_KINDS) {
        expectPublic(resourceSrc(faction, kind));
      }
      expectPublic(markerSrc(faction, "idle"));
      expectPublic(markerSrc(faction, "working"));
    }
  });

  it("fields every v2 silhouette on the sample map and keeps faction majorities", () => {
    const snapshot = loadFixture();
    const roles = new Set(
      snapshot.bases.flatMap((base) => base.units.map((unit) => unitRole(unit.model))),
    );
    for (const role of UNIT_ROLES) expect(roles.has(role)).toBe(true);

    const byId = Object.fromEntries(snapshot.bases.map((base) => [base.id, dominantFaction(base.units)]));
    expect(byId.mirmicode).toBe("cursor");
    expect(byId.charter).toBe("codex");
    expect(byId["ops-board"]).toBe("ohmypi");
    expect(byId["prompt-lab"]).toBe("codex");

    expect(resourcePlacements(0).map((prop) => prop.kind)).toEqual(["crystal", "biomass", "scrap"]);
    expect(resourcePlacements(1)).toHaveLength(2);
    const offsets = Object.values(BUILDING_OFFSET);
    const keys = new Set(offsets.map((slot) => `${slot.x},${slot.y}`));
    expect(keys.size).toBe(offsets.length);
  });

  it("picks the plurality faction for the outpost and breaks ties toward cursor", () => {
    expect(
      dominantFaction([
        { harness: "cursor" },
        { harness: "cursor" },
        { harness: "codex" },
        { harness: "ohmypi" },
      ]),
    ).toBe("cursor");
    expect(
      dominantFaction([
        { harness: "codex" },
        { harness: "codex" },
        { harness: "cursor" },
      ]),
    ).toBe("codex");
    expect(
      dominantFaction([
        { harness: "cursor" },
        { harness: "codex" },
      ]),
    ).toBe("cursor");
    expect(dominantFaction([{ harness: "opencode" }])).toBeNull();

    for (const base of loadFixture().bases) {
      expect(dominantFaction(base.units)).not.toBeNull();
    }
  });
});

describe("layout", () => {
  it("places fixture bases inside the world and fits them in a viewport", () => {
    const positioned = positionBases(loadFixture().bases);
    for (const base of positioned) {
      expect(base.x).toBeGreaterThan(0);
      expect(base.y).toBeGreaterThan(0);
      expect(base.x).toBeLessThan(2400);
      expect(base.y).toBeLessThan(1600);
    }
    const fitted = fitView(positioned, 1280, 720);
    expect(fitted.scale).toBeGreaterThan(0.3);
    expect(Number.isFinite(fitted.x)).toBe(true);
    expect(Number.isFinite(fitted.y)).toBe(true);
  });

  it("spreads units around a base instead of stacking them", () => {
    const slots = [0, 1, 2, 3].map((index) => unitSlot(index, 4));
    const keys = new Set(slots.map((slot) => `${slot.x},${slot.y}`));
    expect(keys.size).toBe(4);
    expect(Math.max(...slots.map((slot) => slot.x)) - Math.min(...slots.map((slot) => slot.x))).toBeGreaterThan(80);

    const army = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => unitSlot(index, 10));
    const armyKeys = new Set(army.map((slot) => `${slot.x},${slot.y}`));
    expect(armyKeys.size).toBe(10);
    expect(new Set(army.map((slot) => slot.y)).size).toBeGreaterThan(1);
  });
});

function expectPublic(src: string | null): void {
  expect(src, "missing sprite path").toBeTruthy();
  const rel = (src ?? "").replace(/^\//, "");
  expect(existsSync(resolve("public", rel)), rel).toBe(true);
}
