import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapStage, unitsForMap } from "./components/MapStage";
import { positionBases } from "./layout";
import type { CampaignBase, Unit } from "./types";

describe("map decorative resources", () => {
  it("omits resource sprites while keeping units and camps visible", () => {
    const bases = positionBases([
      base("working-camp", [unit("working-unit")]),
      base("bare-camp", []),
    ]);
    const markup = renderToStaticMarkup(createElement(MapStage, {
      bases,
      selectedBaseId: "working-camp",
      selectedUnitId: "working-unit",
      attached: false,
      onSelectBase: () => undefined,
      onSelectUnit: () => undefined,
      onClearSelection: () => undefined,
    }));

    expect(markup).toContain('data-unit-id="working-unit"');
    expect(markup).toContain('data-base-id="bare-camp"');
    expect(markup).not.toContain("resource resource-");
    expect(markup).not.toContain("/rts-art-v2/resources/");
  });
});

describe("crowded camp map", () => {
  it("keeps attention, working, and the selected thread visible while the full roster remains available", () => {
    const units = Array.from({ length: 10 }, (_, index) => ({
      ...unit(`thread-${index}`),
      status: index === 1 ? "needs-attention" : index === 2 ? "working" : "completed",
      updatedAt: `2026-09-23T12:${String(index).padStart(2, "0")}:00Z`,
    }));
    const shown = unitsForMap(units, "thread-0");
    expect(shown.map((entry) => entry.id)).toEqual([
      "thread-0", "thread-1", "thread-2", "thread-9", "thread-8", "thread-7",
    ]);

    const markup = renderToStaticMarkup(createElement(MapStage, {
      bases: positionBases([base("crowded-camp", units)]),
      selectedBaseId: "crowded-camp",
      selectedUnitId: "thread-0",
      attached: false,
      onSelectBase: () => undefined,
      onSelectUnit: () => undefined,
      onClearSelection: () => undefined,
    }));
    expect(markup.match(/data-unit-id=/g)).toHaveLength(6);
    expect(markup).toContain("+4 in Forces");
    expect(markup).toContain('data-unit-id="thread-0"');
    expect(markup).not.toContain('data-unit-id="thread-3"');
  });
});

function base(id: string, units: Unit[]): CampaignBase {
  return {
    id,
    repo: `example/${id}`,
    label: null,
    openProject: null,
    updatedAt: "unknown",
    place: null,
    stage: "active",
    oneLiner: null,
    units,
  };
}

function unit(id: string): Unit {
  return {
    id,
    harness: "codex",
    model: "gpt-6-luna",
    threadName: null,
    label: null,
    lastPrompt: "Keep the unit token clear",
    hasContextSnippet: true,
    status: "working",
    lifecycle: null,
    presence: "present",
    freshness: null,
    hidden: false,
    updatedAt: "2026-09-23T12:00:00Z",
  };
}
