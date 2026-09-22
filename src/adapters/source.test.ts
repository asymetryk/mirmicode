import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import cahqSample from "../data/cahq-working-set.sample.json";
import sampleBases from "../data/sample-bases.json";
import { postureOf, postureSignal } from "../factions";
import { unitContext } from "../format";
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
import {
  CAHQ_WORKING_SET_ORIGIN,
  SAME_ORIGIN_WORKING_SET_PATH,
  STALE_SNAPSHOT_BANNER,
  loadFixture,
  parseWorkingSetUrl,
  readStartupWorkingSetUrl,
  resolveSnapshot,
} from "./source";

describe("normalizeWorkingSetPayload", () => {
  it("prefers observed last-user-prompt fields and keeps the older honesty fallback", () => {
    const published = "Review the map filters. ".repeat(10).trim();
    expect(published.length).toBeLessThanOrEqual(240);
    expect(published.length).toBeGreaterThan(180);
    const { bases } = normalizeWorkingSetPayload({
      items: [
        {
          item_id: "camel",
          observed: {
            repo: "example/demo",
            lastUserPrompt: " Camel prompt ",
            last_user_prompt: "snake prompt",
          },
          annotation: { label: "Thread title", note: "note text" },
          last_prompt: "flat prompt",
        },
        {
          item_id: "snake",
          observed: { repo: "example/demo", lastUserPrompt: " ", last_user_prompt: published },
          annotation: { label: "Thread title", note: "note text" },
        },
        {
          item_id: "note",
          observed: { repo: "example/demo", lastUserPrompt: {}, last_user_prompt: "" },
          annotation: { label: "Thread title", note: " Actual note " },
        },
        {
          item_id: "label-only",
          observed: { repo: "example/demo" },
          annotation: { label: "Thread title" },
        },
      ],
    });
    const [camel, snake, note, labelOnly] = bases[0]!.units;
    if (!camel || !snake || !note || !labelOnly) throw new Error("Missing normalized units");
    expect(camel.lastPrompt).toBe("Camel prompt");
    expect(unitContext(camel)).toBe("Last prompt: Camel prompt");
    expect(snake.lastPrompt).toBe(published);
    expect(unitContext(snake)).toBe(`Last prompt: ${published}`);
    expect(unitContext(snake, true)).toBe(`Last prompt: ${published.slice(0, 139)}…`);
    expect(unitContext(note)).toBe("Last prompt: Actual note");
    expect(labelOnly.lastPrompt).toBeNull();
    expect(unitContext(labelOnly)).toBe("Thread: Thread title");
  });

  it("keeps label-only items honest and skips blank or non-string prompts", () => {
    const { bases } = normalizeWorkingSetPayload({ items: [
      { observed: { repo: "example/demo" }, annotation: { label: "Thread title", note: " " }, prompt: {} },
      { observed: { repo: "example/demo" }, annotation: { label: "Thread title", note: " Actual note " }, last_prompt: " ", input: 42 },
      { repo: "example/demo", last_prompt: " First prompt ", lastPrompt: "Second prompt", prompt: "Third prompt" },
    ] });
    const [labelOnly, note, explicit] = bases[0]!.units;
    if (!labelOnly || !note || !explicit) throw new Error("Missing normalized units");
    expect(labelOnly.lastPrompt).toBeNull();
    expect(unitContext(labelOnly)).toBe("Thread: Thread title");
    expect(unitContext(note)).toBe("Last prompt: Actual note");
    expect(unitContext(explicit)).toBe("Last prompt: First prompt");
  });

  it("preserves full prompt text while shortening visible context", () => {
    const prompt = "Please review this fictional change. ".repeat(10);
    const { bases } = normalizeWorkingSetPayload([{ repo: "example/demo", lastUserMessage: prompt }]);
    const unit = bases[0]!.units[0]!;
    expect(unitContext(unit)).toBe(`Last prompt: ${prompt.trim()}`);
    expect(unitContext(unit, true)).toBe(`Last prompt: ${prompt.slice(0, 139)}…`);
  });

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

  it("prefers nested item metadata over conflicting flat fields", () => {
    const normalized = normalizeWorkingSetPayload({
      items: [
        {
          item_id: "nested-item",
          id: "flat-id",
          repo_name: "example/flat-name",
          repo: "example/flat",
          harness: "cursor",
          surface: "codex",
          model: "flat-model",
          label: "Flat label",
          thread_name: "flat-thread",
          updated_at: "2026-09-21T12:00:00Z",
          status: "flat-status",
          observed: {
            repo_name: "example/nested-name",
            repo: "example/nested-repo",
            surface: "Oh My Pi",
            harness: "OpenCode",
            model: "nested-model",
            updated_at: "2026-09-21T11:00:00Z",
            lifecycle: "idle",
            presence: "offline",
          },
          annotation: {
            label: "Annotated label",
            updated_at: "2026-09-21T10:00:00Z",
            status: "blocked",
          },
        },
      ],
    });

    expect(normalized.issues).toEqual([]);
    expect(normalized.bases.map((base) => base.repo)).toEqual(["example/nested-name"]);
    expect(normalized.bases[0]?.updatedAt).toBe("2026-09-21T10:00:00Z");
    expect(normalized.bases[0]?.units).toEqual([
      {
        id: "nested-item",
        harness: "ohmypi",
        model: "nested-model",
        threadName: "flat-thread",
        label: "Annotated label",
        lastPrompt: null,
        hasContextSnippet: false,
        updatedAt: "2026-09-21T10:00:00Z",
        status: "blocked",
        lifecycle: "idle",
        presence: "offline",
        freshness: null,
        hidden: false,
      },
    ]);
  });

  it("falls through absent or blank nested fields to observed and flat metadata", () => {
    const normalized = normalizeWorkingSetPayload({
      items: [
        {
          id: "observed-fallback",
          label: "Flat label",
          status: "flat-status",
          updated_at: "2026-09-21T07:00:00Z",
          observed: {
            repo_name: " ",
            repo: "example/fallbacks",
            surface: "",
            harness: "Open Code",
            model: "observed-model",
            updated_at: "2026-09-21T08:00:00Z",
            lifecycle: "idle",
            presence: "offline",
          },
          annotation: { label: "", updated_at: " ", status: "" },
        },
        {
          id: "presence-fallback",
          harness: "Cursor",
          surface: "codex",
          model: "flat-model",
          thread_name: "snake-thread",
          updatedAt: "2026-09-21T09:00:00Z",
          status: "flat-status",
          observed: { repo: "example/fallbacks", presence: "working" },
        },
        {
          id: "flat-fallback",
          surface: "Codex",
          threadName: "camel-thread",
          last_touched: "2026-09-21T10:00:00Z",
          status: "blocked",
          observed: { repo: "example/fallbacks" },
        },
      ],
    });

    expect(normalized.bases.map((base) => base.repo)).toEqual(["example/fallbacks"]);
    expect(normalized.bases[0]?.updatedAt).toBe("2026-09-21T10:00:00Z");
    expect(normalized.bases[0]?.units).toEqual([
      expect.objectContaining({
        id: "observed-fallback",
        harness: "opencode",
        model: "observed-model",
        label: "Flat label",
        updatedAt: "2026-09-21T08:00:00Z",
        status: "flat-status",
        lifecycle: "idle",
        presence: "offline",
      }),
      expect.objectContaining({
        id: "presence-fallback",
        harness: "cursor",
        model: "flat-model",
        label: "snake-thread",
        updatedAt: "2026-09-21T09:00:00Z",
        status: "flat-status",
        lifecycle: null,
        presence: "working",
      }),
      expect.objectContaining({
        id: "flat-fallback",
        harness: "codex",
        label: "camel-thread",
        updatedAt: "2026-09-21T10:00:00Z",
        status: "blocked",
        lifecycle: null,
        presence: null,
      }),
    ]);
  });

  it("groups nested items without an observed repo into one Unassigned base", () => {
    const normalized = normalizeWorkingSetPayload({
      items: [
        {
          item_id: "unassigned-one",
          source_label: "example/source-one",
          repo_name: "example/flat-repo",
          observed: { surface: "cursor" },
        },
        {
          item_id: "unassigned-two",
          source_label: "example/source-two",
          annotation: { label: "Annotation only" },
        },
        {
          item_id: "assigned",
          source_label: "example/source-one",
          observed: { repo_name: "example/assigned", surface: "codex" },
        },
      ],
    });

    expect(normalized.issues).toEqual([]);
    expect(normalized.bases.map((base) => base.repo)).toEqual([
      "Unassigned",
      "example/assigned",
    ]);
    expect(normalized.bases[0]?.units.map((unit) => unit.id)).toEqual([
      "unassigned-one",
      "unassigned-two",
    ]);
    expect(JSON.stringify(normalized.bases)).not.toContain("example/source-");
    expect(JSON.stringify(normalized.bases)).not.toContain("example/flat-repo");
  });

  it("prefers flat repo_name and uses thread names as label fallbacks", () => {
    const normalized = normalizeWorkingSetPayload({
      records: [
        {
          repo_name: "example/preferred",
          repo: "example/ignored",
          thread_name: "snake-thread",
          threadName: "ignored-thread",
        },
        { repo_name: "example/preferred", threadName: "camel-thread" },
        { repo_name: "example/preferred", label: "Explicit label", thread_name: "thread" },
      ],
    });

    expect(normalized.bases.map((base) => base.repo)).toEqual(["example/preferred"]);
    expect(normalized.bases[0]?.units.map((unit) => unit.label)).toEqual([
      "snake-thread",
      "camel-thread",
      "Explicit label",
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

  it.each(["units", "agents"])("reads grouped %s without inheriting the parent harness", (key) => {
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
          [key]: [
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

  it("reads a top-level units array of flat rows that share a repo", () => {
    const normalized = normalizeWorkingSetPayload({
      units: [
        { repo: "example/shared", surface: "cursor", model: "Gemini", status: "working" },
        { repo: "example/shared", harness: "codex", model: "Terra", status: "idle" },
      ],
    });
    expect(normalized.issues).toEqual([]);
    expect(normalized.bases).toHaveLength(1);
    expect(normalized.bases[0]?.units.map((unit) => [unit.harness, unit.model])).toEqual([
      ["cursor", "Gemini"],
      ["codex", "Terra"],
    ]);
  });

  it("drops records without a repo and reports an empty payload", () => {
    const dropped = normalizeWorkingSetPayload({
      bases: [{ label: "no repo" }, { repo: "example/kept", label: "kept" }],
    });
    const empty = normalizeWorkingSetPayload({ ok: true });

    expect(dropped.bases.map((base) => base.repo)).toEqual(["example/kept"]);
    expect(dropped.issues[0]).toMatch(/missing repo\/base/);
    expect(empty.bases).toEqual([]);
    expect(empty.issues[0]).toMatch(/no bases, items, records, agents, or units/);
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
    expect(result.snapshot.bases).toEqual(loadFixture().bases);
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

  it.each([
    ["Error", new Error("synthetic-secret-token at /private/synthetic-path")],
    ["TypeError", new TypeError("synthetic-secret-token at /private/synthetic-path")],
    ["non-Error", "synthetic-secret-token at /private/synthetic-path"],
  ])("falls back without exposing arbitrary thrown %s details", async (_kind, error) => {
    const fetchImpl: typeof fetch = async () => {
      throw error;
    };
    const result = await resolveSnapshot(
      "https://working-set.example/private/synthetic-path?token=synthetic-secret-token",
      fetchImpl,
    );

    expect(result.snapshot.source).toBe("fixture");
    expect(result.snapshot.bases).toEqual(loadFixture().bases);
    expect(result.fallbackReason).toMatch(/request|reach|network|fetch/i);
    expect(JSON.stringify(result)).not.toContain("synthetic-secret-token");
    expect(JSON.stringify(result)).not.toContain("/private/synthetic-path");
  });

  it("rejects credentials and non-http URLs", () => {
    expect(() => parseWorkingSetUrl("https://user:pw@example.com/bases")).toThrow(/credentials/);
    expect(() => parseWorkingSetUrl("file:///tmp/bases.json")).toThrow(/http or https/);
    expect(() => parseWorkingSetUrl("//cahq.tail21f530.ts.net/api/v1/working-set")).toThrow(/valid URL/);
    expect(() => parseWorkingSetUrl(SAME_ORIGIN_WORKING_SET_PATH)).toThrow(/origin/);
  });

  it("requests the baked same-origin path on the page origin", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ items: [{ repo_name: "example/synthetic" }] }));
    };
    const page = "https://mirmicode.tail21f530.ts.net/map";
    const result = await resolveSnapshot(SAME_ORIGIN_WORKING_SET_PATH, fetchImpl, new Date("2026-09-22T00:00:00Z"), page);

    expect(requested).toEqual([`https://mirmicode.tail21f530.ts.net${SAME_ORIGIN_WORKING_SET_PATH}`]);
    expect(result.snapshot.source).toBe("working-set");
    expect(result.fallbackReason).toBeNull();
    expect(CAHQ_WORKING_SET_ORIGIN).toBe("https://cahq.tail21f530.ts.net");
  });

  it.each([
    {
      failure: "HTTP error",
      response: () => new Response("synthetic-private-response", { status: 503 }),
      reason: /503/,
    },
    {
      failure: "non-JSON response",
      response: () => new Response("<html>synthetic-private-response</html>"),
      reason: /json/i,
    },
    {
      failure: "empty working set",
      response: () => new Response(JSON.stringify({ items: [] })),
      reason: /no bases|empty/i,
    },
  ])("returns the fixture for $failure with a safe reason", async ({ response, reason }) => {
    const fetchImpl: typeof fetch = async () => response();
    const result = await resolveSnapshot("https://working-set.example/items", fetchImpl);

    expect(result.snapshot.source).toBe("fixture");
    expect(result.snapshot.bases).toEqual(loadFixture().bases);
    expect(result.fallbackReason).toMatch(reason);
    expect(JSON.stringify(result)).not.toContain("synthetic-private-response");
  });

  it("reads snapshot.stale as a banner flag and keeps freshness and hidden apart from lifecycle", () => {
    const normalized = normalizeWorkingSetPayload({
      snapshot: { stale: true },
      items: [
        {
          item_id: "open-item",
          observed: {
            repo_name: "example/live",
            lifecycle: "idle",
            presence: "present",
            freshness: "unknown",
          },
          annotation: { status: "open", hidden: false },
        },
        {
          item_id: "hid",
          observed: { repo_name: "example/live", lifecycle: "idle", presence: "present" },
          annotation: { status: "done", hidden: true },
        },
        {
          item_id: "string-hidden",
          observed: { repo_name: "example/live", lifecycle: "detached" },
          annotation: { hidden: "true", status: "open" },
        },
      ],
    });

    expect(normalized.stale).toBe(true);
    expect(STALE_SNAPSHOT_BANNER).toMatch(/refresh failed/i);
    expect(normalized.bases[0]?.units.map((unit) => [unit.id, unit.status, unit.lifecycle, unit.hidden, unit.freshness])).toEqual([
      ["open-item", "open", "idle", false, "unknown"],
      ["hid", "done", "idle", true, null],
      ["string-hidden", "open", "detached", false, null],
    ]);
    expect(normalizeWorkingSetPayload({ snapshot: { stale: "yes" }, items: [{ repo: "example/ok" }] }).stale).toBe(false);
    expect(normalizeWorkingSetPayload({ items: [{ repo: "example/ok" }] }).stale).toBe(false);
    expect(loadFixture().stale).toBe(false);
  });

  it("points the default origin at the live CAHQ host", () => {
    expect(CAHQ_WORKING_SET_ORIGIN).toBe("https://cahq.tail21f530.ts.net");
    expect(parseWorkingSetUrl(CAHQ_WORKING_SET_ORIGIN).toString()).toBe(
      "https://cahq.tail21f530.ts.net/api/v1/working-set",
    );
  });

  it.each([
    ["https://working-set.example", "https://working-set.example/api/v1/working-set"],
    ["http://working-set.example:8080/", "http://working-set.example:8080/api/v1/working-set"],
    ["https://working-set.example/#private-fragment", "https://working-set.example/api/v1/working-set"],
    ["https://working-set.example/custom/items#private-fragment", "https://working-set.example/custom/items"],
    ["https://working-set.example/?view=compact#private-fragment", "https://working-set.example/?view=compact"],
    ["https://working-set.example/custom/items?view=compact#private-fragment", "https://working-set.example/custom/items?view=compact"],
  ])("resolves %s to the intended request endpoint", async (input, expected) => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ items: [{ repo_name: "example/synthetic" }] }));
    };

    const result = await resolveSnapshot(input, fetchImpl);

    expect(requested).toEqual([expected]);
    expect(result.snapshot.source).toBe("working-set");
    expect(result.snapshot.bases.map((base) => base.repo)).toEqual(["example/synthetic"]);
    expect(result.fallbackReason).toBeNull();
  });

  it("reads startup URL precedence for VITE_WORKING_SET_URL", () => {
    const storage = new Map<string, string>();
    const read = {
      getItem: (key: string) => storage.get(key) ?? null,
    };
    expect(readStartupWorkingSetUrl(CAHQ_WORKING_SET_ORIGIN, read)).toBe(CAHQ_WORKING_SET_ORIGIN);
    expect(readStartupWorkingSetUrl("  ", read)).toBe("");
    storage.set("mirmicode.workingSetUrl", "https://working-set.example/agents");
    expect(readStartupWorkingSetUrl(CAHQ_WORKING_SET_ORIGIN, read)).toBe(
      "https://working-set.example/agents",
    );
    storage.set("mirmicode.dataSource", "fixture");
    expect(readStartupWorkingSetUrl(CAHQ_WORKING_SET_ORIGIN, read)).toBe("");
    expect(readStartupWorkingSetUrl(CAHQ_WORKING_SET_ORIGIN, null)).toBe(CAHQ_WORKING_SET_ORIGIN);
  });
});

describe("cahq working set sample", () => {
  it("maps a flat multi-unit agents document onto bases, factions, crests, and glow", () => {
    const normalized = normalizeWorkingSetPayload(cahqSample);
    expect(normalized.issues).toEqual([]);
    expect(normalized.bases.map((base) => base.repo)).toEqual([
      "asymetryk/mirmicode",
      "example/charter",
      "example/ops-board",
    ]);

    const mirmicode = normalized.bases[0];
    expect(mirmicode?.units.map((unit) => [unit.harness, unit.model, unit.threadName, postureOf(unit.status)])).toEqual([
      ["cursor", "Grok-4.6", "bases-map", "working"],
      ["codex", "Luna", "readme-faction", "working"],
      ["ohmypi", "Kimi", "copy-pass", "blocked"],
    ]);
    expect(mirmicode?.updatedAt).toBe("2026-09-21T19:05:00Z");
    expect(mirmicode?.units.map((unit) => glyphId(unit.model))).toEqual(["b", "b", "b"]);
    expect(mirmicode?.units.map((unit) => heroSrc(unit.harness))).toEqual([
      "/rts-art/hero-cursor-angular.png",
      "/rts-art/hero-codex-organic.png",
      "/rts-art/hero-ohmypi-mechanical.png",
    ]);

    const charter = normalized.bases[1];
    expect(charter?.units.map((unit) => [unit.harness, postureOf(unit.status), unit.updatedAt])).toEqual([
      ["codex", "working", "2026-09-21T13:10:00Z"],
      ["cursor", "idle", "2026-09-21T11:00:00Z"],
    ]);
    expect(charter?.units[1]?.label).toBe("Review");

    const ops = normalized.bases[2];
    expect(ops?.units.map((unit) => unit.model)).toEqual(["MiniMax", "Sol"]);
    expect(ops?.units.map((unit) => glyphId(unit.model))).toEqual(["a", "a"]);
    expect(JSON.stringify(normalized)).not.toMatch(/transcript|secret/i);
  });

  it("loads that document through the live fetch path", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(cahqSample), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const result = await resolveSnapshot(`${CAHQ_WORKING_SET_ORIGIN}/agents`, fetchImpl);
    expect(result.fallbackReason).toBeNull();
    expect(result.snapshot.source).toBe("working-set");
    expect(result.snapshot.bases).toHaveLength(3);
    const units = result.snapshot.bases.reduce((sum, base) => sum + base.units.length, 0);
    expect(units).toBe(7);
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
    expect(postureOf(postureSignal("working", "archived"))).toBe("working");
    expect(postureOf(postureSignal("open", "idle"))).toBe("idle");
    expect(postureOf(postureSignal("done", "idle"))).toBe("idle");
    expect(postureOf(postureSignal(null, "active"))).toBe("working");
    expect(postureOf(postureSignal("  ", "blocked"))).toBe("blocked");
    expect(postureOf(postureSignal(null, null))).toBe("idle");
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
