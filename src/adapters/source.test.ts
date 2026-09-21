import { describe, expect, it } from "vitest";
import sampleBases from "../data/sample-bases.json";
import { fitView, positionBases } from "../layout";
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
      id: "alpha",
      repo: "example/alpha",
      label: "Alpha label",
      threadName: "alpha-thread",
      harness: "cursor",
      model: "demo-model",
      updatedAt: "2026-09-21T12:00:00Z",
      place: { x: 0.25, y: 0.5 },
    });
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
      harness: "opencode",
      model: "unknown",
      threadName: "nested-thread",
      label: null,
      updatedAt: "2026-09-20T00:00:00Z",
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
    expect(fromArray.bases[0]?.updatedAt).toBe("2026-09-01T00:00:00Z");
    expect(fromRecords.bases[0]?.repo).toBe("example/records");
    expect(fromRecords.bases[0]?.label).toBeNull();
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
    expect(normalized.bases[0]?.id).toBe("same");
    expect(normalized.bases[1]?.id).toBe("same-2");
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
    const base = normalized.bases[0];
    expect(base?.label?.endsWith("…")).toBe(true);
    expect(base?.label?.length).toBeLessThanOrEqual(180);
    expect(JSON.stringify(base)).not.toContain("secret conversation");
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
  it("has at least three bases and the four map fields", () => {
    const raw = sampleBases;
    expect(raw.bases.length).toBeGreaterThanOrEqual(3);

    for (const base of raw.bases) {
      expect(typeof base.repo).toBe("string");
      expect(typeof base.harness).toBe("string");
      expect(typeof base.model).toBe("string");
      expect(typeof base.updated_at).toBe("string");
      expect(typeof base.label === "string" || typeof base.thread_name === "string").toBe(true);
    }

    const snapshot = loadFixture();
    expect(snapshot.notice).toBeNull();
    expect(snapshot.bases.length).toBe(raw.bases.length);
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
});
