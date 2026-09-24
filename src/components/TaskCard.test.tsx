import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { setPublicModeForTests } from "../publicMode";
import type { Unit } from "../types";
import { TaskCard } from "./TaskCard";

function sampleUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: "task-1",
    harness: "codex",
    model: "GPT-6 Sol",
    threadName: "Map inspector work",
    label: null,
    lastPrompt: null,
    hasContextSnippet: false,
    status: null,
    lifecycle: null,
    presence: null,
    freshness: null,
    hidden: false,
    updatedAt: "unknown",
    ...overrides,
  };
}

afterEach(() => setPublicModeForTests(null));

describe("TaskCard", () => {
  it("shows task lifecycle, TL;DR, elapsed time, and explicitly unassessed outcome", () => {
    const html = renderToStaticMarkup(
      <TaskCard
        unit={sampleUnit({
          activityStatus: "working",
          promptTldr: "Add a task summary to the selected agent inspector.",
          taskStartedAt: "2026-09-24T10:00:00.000Z",
        })}
        now={Date.parse("2026-09-24T10:01:30.000Z")}
      />,
    );

    expect(html).toContain("Task status: Working");
    expect(html).toContain("Add a task summary to the selected agent inspector.");
    expect(html).toContain("1m 30s");
    expect(html).toContain("Unknown / unassessed");
  });

  it("labels completed work as finished and renders only available token counts", () => {
    const html = renderToStaticMarkup(
      <TaskCard
        unit={sampleUnit({
          activityStatus: "completed",
          taskDurationMs: 125_000,
          tokenUsage: {
            input_tokens: 1200,
            output_tokens: null,
            cached_input_tokens: null,
            reasoning_output_tokens: null,
            total_tokens: 1500,
          },
        })}
        now={0}
      />,
    );

    expect(html).toContain("Finished");
    expect(html).toContain("2m 5s");
    expect(html).toContain("1,200");
    expect(html).toContain("1,500");
    expect(html).not.toContain("Output");
  });

  it("points to sign-in when request keywords are redacted in public mode", () => {
    setPublicModeForTests({ publicMode: true });
    const html = renderToStaticMarkup(
      <TaskCard unit={sampleUnit()} now={0} />,
    );

    expect(html).toContain("Sign in to view request keywords, when available.");
    expect(html).toContain("Unknown / unassessed");
  });

  it("shows keywords supplied to an authenticated editor session on a public route", () => {
    setPublicModeForTests({ publicMode: true });
    const html = renderToStaticMarkup(
      <TaskCard unit={sampleUnit({ promptTldr: "Prompt keywords: inspector, elapsed time" })} now={0} />,
    );

    expect(html).toContain("Prompt keywords: inspector, elapsed time");
    expect(html).toContain("prompt text is not shown");
  });
});
