import type { CampaignBase, ViewState } from "./types";

export const WORLD = { width: 2400, height: 1600 };

export type PositionedBase = CampaignBase & { x: number; y: number };

const FIELD_MARGIN_X = 180;
const FIELD_MARGIN_Y = 140;

export function positionBases(bases: CampaignBase[]): PositionedBase[] {
  const unplaced = bases.filter((base) => base.place === null);
  const columns = Math.max(1, Math.ceil(Math.sqrt(unplaced.length || 1)));
  const rows = Math.max(1, Math.ceil(unplaced.length / columns));
  let unplacedIndex = 0;

  return bases.map((base) => {
    if (base.place) {
      return {
        ...base,
        x: base.place.x * (WORLD.width - FIELD_MARGIN_X * 2) + FIELD_MARGIN_X,
        y: base.place.y * (WORLD.height - FIELD_MARGIN_Y * 2) + FIELD_MARGIN_Y,
      };
    }
    const column = unplacedIndex % columns;
    const row = Math.floor(unplacedIndex / columns);
    unplacedIndex += 1;
    return {
      ...base,
      x: ((column + 0.5) / columns) * (WORLD.width - FIELD_MARGIN_X * 2) + FIELD_MARGIN_X,
      y: ((row + 0.5) / rows) * (WORLD.height - FIELD_MARGIN_Y * 2) + FIELD_MARGIN_Y,
    };
  });
}

export function fitView(
  bases: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): ViewState {
  if (bases.length === 0 || width <= 0 || height <= 0) {
    return { x: 40, y: 40, scale: 1 };
  }
  const padX = 200;
  const padY = 160;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const base of bases) {
    minX = Math.min(minX, base.x - padX);
    minY = Math.min(minY, base.y - padY);
    maxX = Math.max(maxX, base.x + padX);
    maxY = Math.max(maxY, base.y + padY);
  }
  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);
  const scale = clamp(Math.min(width / worldW, height / worldH), 0.35, 1.35);
  return {
    scale,
    x: (width - worldW * scale) / 2 - minX * scale,
    y: (height - worldH * scale) / 2 - minY * scale,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
