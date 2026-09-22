import { afterEach, describe, expect, it } from "vitest";
import { normalizeWorkingSetPayload } from "./adapters/normalize";
import { unitContext } from "./format";
import {
  isFullLiveOverride,
  isPublicMode,
  isTruthyFlag,
  scrubSensitivePath,
  setPublicModeForTests,
  shouldScrubPrompts,
} from "./publicMode";

afterEach(() => {
  setPublicModeForTests(null);
});

describe("publicMode flags", () => {
  it("treats common truthy spellings as on", () => {
    expect(isTruthyFlag("1")).toBe(true);
    expect(isTruthyFlag("true")).toBe(true);
    expect(isTruthyFlag(" YES ")).toBe(true);
    expect(isTruthyFlag("on")).toBe(true);
    expect(isTruthyFlag("0")).toBe(false);
    expect(isTruthyFlag("false")).toBe(false);
    expect(isTruthyFlag("")).toBe(false);
    expect(isTruthyFlag(undefined)).toBe(false);
  });

  it("scrubs prompts only when public and not full live", () => {
    setPublicModeForTests({ publicMode: false });
    expect(isPublicMode()).toBe(false);
    expect(shouldScrubPrompts()).toBe(false);

    setPublicModeForTests({ publicMode: true, fullLive: false });
    expect(isPublicMode()).toBe(true);
    expect(isFullLiveOverride()).toBe(false);
    expect(shouldScrubPrompts()).toBe(true);

    setPublicModeForTests({ publicMode: true, fullLive: true });
    expect(shouldScrubPrompts()).toBe(false);
  });
});

describe("public BIP prompt scrub", () => {
  const payload = {
    items: [
      {
        item_id: "camel",
        observed: {
          repo: "example/demo",
          lastUserPrompt: "Secret camel prompt",
          last_user_prompt: "snake prompt",
        },
        annotation: { label: "Thread title", note: "note as prompt" },
        last_prompt: "flat prompt",
      },
      {
        item_id: "pathy",
        observed: { repo: "example/demo" },
        annotation: {
          label: "/Users/labhand/.cursor/projects/secret/agent.jsonl",
        },
        thread_name: "/home/labhand/work/transcript.jsonl",
      },
    ],
  };

  it("hides lastUserPrompt and prompt aliases in public mode", () => {
    setPublicModeForTests({ publicMode: true });
    const { bases } = normalizeWorkingSetPayload(payload);
    const [camel, pathy] = bases[0]!.units;
    if (!camel || !pathy) throw new Error("Missing normalized units");

    expect(camel.lastPrompt).toBeNull();
    expect(unitContext(camel)).toBe("Thread: Thread title");
    expect(unitContext(camel)).not.toContain("Secret");
    expect(unitContext(camel)).not.toContain("Last prompt");
    expect(pathy.lastPrompt).toBeNull();
    expect(pathy.label).toBe("[path redacted]");
    expect(pathy.threadName).toBe("[path redacted]");
  });

  it("still prefers lastUserPrompt in private mode", () => {
    setPublicModeForTests({ publicMode: false });
    const { bases } = normalizeWorkingSetPayload(payload);
    const camel = bases[0]!.units[0]!;
    expect(camel.lastPrompt).toBe("Secret camel prompt");
    expect(unitContext(camel)).toBe("Last prompt: Secret camel prompt");
  });

  it("keeps prompts when full live override is on", () => {
    setPublicModeForTests({ publicMode: true, fullLive: true });
    const { bases } = normalizeWorkingSetPayload(payload);
    const camel = bases[0]!.units[0]!;
    expect(camel.lastPrompt).toBe("Secret camel prompt");
    expect(unitContext(camel)).toBe("Last prompt: Secret camel prompt");
  });

  it("omits Last prompt from unitContext even if lastPrompt was already set", () => {
    setPublicModeForTests({ publicMode: true });
    expect(
      unitContext({
        id: "u1",
        harness: "cursor",
        model: "demo",
        threadName: "thread-a",
        label: "Label A",
        lastPrompt: "should not leak",
        status: null,
        lifecycle: null,
        presence: null,
        freshness: null,
        hidden: false,
        updatedAt: "unknown",
      }),
    ).toBe("Thread: Label A");
  });
});

describe("scrubSensitivePath", () => {
  it("redacts home and jsonl paths only while scrubbing", () => {
    setPublicModeForTests({ publicMode: true });
    expect(scrubSensitivePath("/Users/me/secret.jsonl")).toBe("[path redacted]");
    expect(scrubSensitivePath("/home/me/work")).toBe("[path redacted]");
    expect(scrubSensitivePath("~/Projects/x")).toBe("[path redacted]");
    expect(scrubSensitivePath("normal thread name")).toBe("normal thread name");

    setPublicModeForTests({ publicMode: false });
    expect(scrubSensitivePath("/Users/me/secret.jsonl")).toBe("/Users/me/secret.jsonl");
  });
});
