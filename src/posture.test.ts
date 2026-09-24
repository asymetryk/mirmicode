import { describe, expect, it } from "vitest";
import { postureLabel, postureSignal } from "./factions";
import { visualPosture } from "./components/UnitFigure";

describe("completed unit posture", () => {
  it("keeps completed states distinct from unknown and idle", () => {
    expect(visualPosture("completed")).toBe("completed");
    expect(visualPosture("complete")).toBe("completed");
    expect(visualPosture("done")).toBe("completed");
    expect(visualPosture("unknown")).toBe("unknown");
    expect(postureLabel("completed")).toBe("Completed");
  });

  it("preserves open and done as triage statuses when lifecycle is known", () => {
    expect(postureSignal("done", "idle")).toBe("idle");
    expect(postureSignal("open", "completed")).toBe("completed");
    expect(postureSignal("completed", "idle")).toBe("completed");
  });
});
