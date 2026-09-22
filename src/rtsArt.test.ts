import { describe, expect, it } from "vitest";
import { BUILDING_KINDS, bareBuildingSet, buildingSetForStage, stageFromString } from "./rtsArt";

describe("bareBuildingSet", () => {
  it("keeps the pad and uses the stage set as the upper bound", () => {
    const set = bareBuildingSet("active", "asymetryk/agentos");
    expect(set).toContain("pad");
    for (const kind of set) {
      expect(BUILDING_KINDS).toContain(kind);
    }
  });

  it("returns the full stage set for the idea stage (single pad only)", () => {
    expect(bareBuildingSet("idea", "asymetryk/agentos")).toEqual(["pad"]);
  });

  it("varies the kit for different repos on the same stage", () => {
    const a = bareBuildingSet("active", "asymetryk/agentos");
    const b = bareBuildingSet("active", "asymetryk/agentvault");
    const c = bareBuildingSet("active", "asymetryk/agentworkforce");
    const seen = new Set([a.join(","), b.join(","), c.join(",")]);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is stable for the same repo and stage", () => {
    const first = bareBuildingSet("active", "asymetryk/agentos").join(",");
    for (let i = 0; i < 8; i += 1) {
      expect(bareBuildingSet("active", "asymetryk/agentos").join(",")).toBe(first);
    }
  });

  it("treats unknown repos with a hash and still draws a pad", () => {
    const set = bareBuildingSet("active", "asymetryk/some-unseen-camp");
    expect(set.length).toBeGreaterThan(0);
    expect(set[0]).toBe("pad");
  });

  it("is a subset of the stage set when stage is unknown and repo is empty", () => {
    const stage = buildingSetForStage(stageFromString("active"));
    const set = bareBuildingSet("active", "");
    for (const kind of set) {
      expect(stage).toContain(kind);
    }
  });
});
