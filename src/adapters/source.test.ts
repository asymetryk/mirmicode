import { describe, expect, it } from "vitest";
import sampleBases from "../data/sample-bases.json";
import { postureOf } from "../factions";
import { fitView, positionBases, unitSlot } from "../layout";
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
  });
});
