import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapStage } from "./components/MapStage";
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
