import type { BuildingKind, ResourceKind } from "./rtsArt";
import { RESOURCE_KINDS } from "./rtsArt";
import type { CampaignBase, ViewState } from "./types";

export const WORLD = { width: 5600, height: 3680 };

export type PositionedBase = CampaignBase & { x: number; y: number };

const FIELD_MARGIN_X = 350;
const FIELD_MARGIN_Y = 280;

export function positionBases(bases: CampaignBase[]): PositionedBase[] {
  const unplaced = bases.filter((base) => base.place === null);
  const columns = Math.max(1, Math.ceil(Math.sqrt(unplaced.length || 1)));
  const rows = Math.max(1, Math.ceil(unplaced.length / columns));
  const pitchX = Math.min(900, (WORLD.width - FIELD_MARGIN_X * 2) / Math.max(columns - 1, 1));
  const pitchY = Math.min(760, (WORLD.height - FIELD_MARGIN_Y * 2) / Math.max(rows - 1, 1));
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
      x: WORLD.width / 2 + (column - (columns - 1) / 2) * pitchX,
      y: WORLD.height / 2 + (row - (rows - 1) / 2) * pitchY,
    };
  });
}

export function fitView(
  bases: Array<{ x: number; y: number; units?: unknown[] }>,
  width: number,
  height: number,
): ViewState {
  if (bases.length === 0 || width <= 0 || height <= 0) {
    return { x: 40, y: 40, scale: 1 };
  }
  const padX = 420;
  const padY = 360;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const base of bases) {
    const unitCount = base.units?.length ?? 0;
    const unitRows = Math.ceil(unitCount / 5);
    const lastUnitBottom = unitRows > 0 ? 108 + (unitRows - 1) * 108 + 150 + 120 : 0;
    minX = Math.min(minX, base.x - padX);
    minY = Math.min(minY, base.y - padY);
    maxX = Math.max(maxX, base.x + padX);
    maxY = Math.max(maxY, base.y + Math.max(padY, lastUnitBottom));
  }
  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);
  const scale = clamp(Math.min(width / worldW, height / worldH), 0.2, 1.6);
  return {
    scale,
    x: (width - worldW * scale) / 2 - minX * scale,
    y: (height - worldH * scale) / 2 - minY * scale,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Token position relative to a base anchor. Rows are centered and hold up to five units. */
export function unitSlot(index: number, count: number): { x: number; y: number } {
  const columns = Math.min(5, Math.max(count, 1));
  const row = Math.floor(index / columns);
  const rowStart = row * columns;
  const rowCount = Math.min(columns, count - rowStart);
  const column = index - rowStart;
  return {
    x: (column - (rowCount - 1) / 2) * 118,
    y: row * 108,
  };
}

/** Satellite buildings around a base anchor. The pad itself is the outpost at the origin. */
export const BUILDING_OFFSET: Record<BuildingKind, { x: number; y: number }> = {
  pad: { x: 0, y: 0 },
  depot: { x: -196, y: 42 },
  turret: { x: 196, y: 34 },
  refinery: { x: -122, y: -124 },
  barracks: { x: 128, y: -118 },
  lab: { x: 4, y: -196 },
};

export const RESOURCE_OFFSETS: Array<{ x: number; y: number }> = [
  { x: -252, y: 78 },
  { x: 256, y: 86 },
  { x: 214, y: -206 },
];

/** A few props per base. Every fourth base shows all three kinds so the field reads as a set. */
export function resourcePlacements(baseIndex: number): Array<{ kind: ResourceKind; slot: number }> {
  if (baseIndex % 4 === 0) {
    return RESOURCE_KINDS.map((kind, slot) => ({ kind, slot }));
  }
  const first = baseIndex % RESOURCE_KINDS.length;
  const second = (baseIndex + 1) % RESOURCE_KINDS.length;
  const a = RESOURCE_KINDS[first];
  const b = RESOURCE_KINDS[second];
  if (!a || !b) return [];
  return [
    { kind: a, slot: 0 },
    { kind: b, slot: 1 },
  ];
}
