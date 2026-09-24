import { describe, expect, it } from "vitest";
import { fitView, WORLD } from "./layout";

describe("map fit bounds", () => {
  it("keeps the bottom row of a 12-unit camp inside a 1920x1080 viewport", () => {
    const base = {
      x: WORLD.width / 2,
      y: WORLD.height / 2,
      units: Array.from({ length: 12 }, (_, index) => ({ id: String(index) })),
    };
    const stageWidth = 1560;
    const stageHeight = 1012;
    const view = fitView([base], stageWidth, stageHeight);
    const rows = Math.ceil(base.units.length / 5);
    const spriteBottom = base.y + 108 + (rows - 1) * 108 + 150;
    const screenBottom = view.y + spriteBottom * view.scale;

    expect(screenBottom).toBeLessThan(stageHeight - 60);
  });

  it("preserves the existing sparse-camp fit", () => {
    const view = fitView([{ x: WORLD.width / 2, y: WORLD.height / 2 }], 1920, 1080);
    expect(view.scale).toBe(1.5);
  });
});
