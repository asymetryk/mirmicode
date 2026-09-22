import { afterEach, describe, expect, it } from "vitest";
import { normalizeWorkingSetPayload } from "./adapters/normalize";
import { popoverSnippet, unitContext } from "./format";
import { applyNoiseFilter, DEFAULT_NOISE_FILTER, hasUsableContextSnippet } from "./mapNoise";
import { setPublicModeForTests } from "./publicMode";
import type { Unit } from "./types";

afterEach(() => {
  setPublicModeForTests(null);
});

function unit(partial: Partial<Unit> & Pick<Unit, "id">): Unit {
  return {
    harness: "codex",
    model: "Luna",
    threadName: null,
    label: null,
    lastPrompt: null,
    hasContextSnippet: false,
    status: null,
    lifecycle: "idle",
    presence: "present",
    freshness: null,
    hidden: false,
    updatedAt: "unknown",
    ...partial,
  };
}

describe("context snippet hard filter", () => {
  it("hides units with no usable Last-prompt snippet, including label-only shells", () => {
    const { bases } = normalizeWorkingSetPayload({
      items: [
        {
          item_id: "with-prompt",
          observed: { repo: "example/kept", lastUserPrompt: "Ship the Howard rail" },
        },
        {
          item_id: "note-only",
          observed: { repo: "example/kept" },
          annotation: { note: "  Note counts as snippet  ", label: "Thread title" },
        },
        {
          item_id: "label-only",
          observed: { repo: "example/kept" },
          annotation: { label: "Thread title alone" },
        },
        {
          item_id: "empty-shell",
          observed: { repo: "example/kept", surface: "codex", model: "Luna" },
        },
        {
          item_id: "unassigned-prompt",
          observed: { last_user_prompt: "Unassigned still needs a snippet" },
        },
        {
          item_id: "unassigned-empty",
          observed: { surface: "cursor", model: "Scout", lifecycle: "unknown" },
        },
      ],
    });

    const filtered = applyNoiseFilter(bases, DEFAULT_NOISE_FILTER);
    const visible = filtered.bases.flatMap((base) => base.units.map((entry) => entry.id));
    expect(visible).toEqual(["with-prompt", "note-only", "unassigned-prompt"]);
    expect(visible).not.toContain("label-only");
    expect(visible).not.toContain("empty-shell");
    expect(visible).not.toContain("unassigned-empty");
    expect(filtered.hiddenCount).toBe(3);

    const unassigned = filtered.bases.find((base) => base.repo === "Unassigned");
    expect(unassigned?.units.map((entry) => entry.id)).toEqual(["unassigned-prompt"]);
  });

  it("keeps public-mode units that had a snippet even when prompt text is scrubbed", () => {
    setPublicModeForTests({ publicMode: true });
    const { bases } = normalizeWorkingSetPayload({
      items: [
        {
          item_id: "secret",
          observed: { repo: "example/kept", lastUserPrompt: "Secret Howard prompt" },
          annotation: { label: "Thread title" },
        },
        {
          item_id: "no-snippet",
          observed: { repo: "example/kept" },
          annotation: { label: "Only a thread" },
        },
      ],
    });
    const secret = bases[0]!.units.find((entry) => entry.id === "secret")!;
    const bare = bases[0]!.units.find((entry) => entry.id === "no-snippet")!;
    expect(secret.lastPrompt).toBeNull();
    expect(secret.hasContextSnippet).toBe(true);
    expect(hasUsableContextSnippet(secret)).toBe(true);
    expect(bare.hasContextSnippet).toBe(false);

    const filtered = applyNoiseFilter(bases, DEFAULT_NOISE_FILTER);
    expect(filtered.bases[0]?.units.map((entry) => entry.id)).toEqual(["secret"]);
    expect(popoverSnippet(secret)).toBeNull();
    expect(unitContext(secret)).toBe("Thread: Thread title");
    expect(unitContext(secret)).not.toContain("Secret");
  });
});

describe("popoverSnippet", () => {
  it("shows the real context snippet when present and private", () => {
    setPublicModeForTests({ publicMode: false });
    expect(
      popoverSnippet(
        unit({
          id: "u1",
          lastPrompt: "  Enrich the popover with this prompt  ",
          hasContextSnippet: true,
          label: "Thread title",
        }),
      ),
    ).toBe("Enrich the popover with this prompt");
  });

  it("scrubs displayed prompt text in public mode", () => {
    setPublicModeForTests({ publicMode: true });
    expect(
      popoverSnippet(
        unit({
          id: "u1",
          lastPrompt: "should not leak",
          hasContextSnippet: true,
          label: "Thread title",
        }),
      ),
    ).toBeNull();
  });
});
