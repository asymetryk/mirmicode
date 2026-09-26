import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SelectionPopover } from "./components/SelectionPopover";
import type { CampaignBase, Unit } from "./types";

describe("selected Codex worker group inspector", () => {
  it("renders task activity in the actual selected-unit inspector path", () => {
    const selected = unit({
      id: "codex-working",
      status: "working",
      activityStatus: "working",
      promptTldr: "Prompt keywords: selected unit, task inspector",
      taskStartedAt: "2026-09-23T12:29:30Z",
    });
    const markup = render(camp([selected]), selected);

    expect(markup).toContain("Current task");
    expect(markup).toContain("Task status: Working");
    expect(markup).toContain("Prompt keywords: selected unit, task inspector");
    expect(markup).toContain("30s");
    expect(markup).toContain("Unknown / unassessed");
  });

  it("shows the resolved root, descendants, state, last seen, and only verified task links", () => {
    const root = unit({ id: "codex-root", model: "GPT-6-Sol", status: "working", nativeUrl: "https://tasks.example.test/root" });
    const direct = unit({ id: "codex-direct", model: "GPT-6-Luna", parentId: root.id, status: "completed", nativeUrl: "https://tasks.example.test/direct" });
    const descendant = unit({ id: "codex-descendant", model: "GPT-5.6-Terra", parentId: direct.id, status: "queued", nativeUrl: null });
    const orphan = unit({ id: "codex-orphan", model: "GPT-6-Astra", parentId: "missing-parent", nativeUrl: null });
    const base = camp([root, direct, descendant, orphan]);
    const markup = render(base, direct);

    expect(markup).toContain("Codex worker group · 2 linked subagents");
    expect(markup).toContain("Group root · Status working");
    expect(markup).toContain("Direct subagent · Status completed");
    expect(markup).toContain("Descendant subagent · level 2 · Status queued");
    expect(markup).toContain('data-worker-id="codex-descendant"');
    expect(markup).toContain("Last seen");
    expect(markup).toContain('href="https://tasks.example.test/root"');
    expect(markup).toContain('href="https://tasks.example.test/direct"');
    expect(markup).not.toContain('href="https://tasks.example.test/codex-descendant"');
  });

  it("labels a missing parent as orphaned without making up a parent or URL", () => {
    const orphan = unit({ id: "codex-orphan", parentId: "missing-parent", nativeUrl: null });
    const markup = render(camp([orphan]), orphan);

    expect(markup).toContain("Orphaned / ungrouped");
    expect(markup).toContain("parent that is not present in this camp snapshot");
    expect(markup).not.toContain('href="');
  });
});

function render(base: CampaignBase, selected: Unit): string {
  return renderToStaticMarkup(createElement(SelectionPopover, {
    base,
    unit: selected,
    attached: false,
    now: Date.parse("2026-09-23T12:30:00Z"),
    metadataRevision: null,
    canEditMetadata: false,
    onRefreshSnapshot: () => undefined,
    onToggleAttach: () => undefined,
    onClose: () => undefined,
    onSelectUnit: () => undefined,
  }));
}

function camp(units: Unit[]): CampaignBase {
  return {
    id: "repo-mirmicode",
    repo: "asymetryk/mirmicode",
    label: null,
    openProject: null,
    updatedAt: "2026-09-23T12:00:00Z",
    place: null,
    stage: "active",
    oneLiner: null,
    units,
  };
}

function unit(overrides: Partial<Unit> & Pick<Unit, "id">): Unit {
  return {
    harness: "codex",
    model: "GPT-6-Luna",
    threadName: null,
    label: null,
    lastPrompt: null,
    hasContextSnippet: false,
    status: "working",
    lifecycle: null,
    presence: "present",
    freshness: null,
    hidden: false,
    updatedAt: "2026-09-23T12:15:00Z",
    ...overrides,
  };
}
