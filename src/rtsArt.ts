import { canonicalHarness, unitKind, type UnitKind } from "./factions";

/** Crest shared by models on the v1 hero fallback. Same model always wears the same glyph. */
export type GlyphId = "a" | "b" | "c";

const GLYPH_BY_KIND: Partial<Record<UnitKind, GlyphId>> = {
  astra: "a",
  sol: "a",
  minimax: "a",
  luna: "b",
  grok: "b",
  kimi: "b",
  terra: "c",
  gemini: "c",
};

const HERO_SRC: Record<string, string> = {
  cursor: "/rts-art/hero-cursor-angular.png",
  codex: "/rts-art/hero-codex-organic.png",
  ohmypi: "/rts-art/hero-ohmypi-mechanical.png",
};

const OUTPOST_SRC: Record<string, string> = {
  cursor: "/rts-art/building-outpost-cursor.png",
  codex: "/rts-art/building-outpost-codex.png",
  ohmypi: "/rts-art/building-outpost-ohmypi.png",
};

const GLYPH_SRC: Record<GlyphId, string> = {
  a: "/rts-art/glyph-model-a.png",
  b: "/rts-art/glyph-model-b.png",
  c: "/rts-art/glyph-model-c.png",
};

/** Factions that have a painted outpost. Earlier entries win a tie. */
const OUTPOST_FACTIONS = ["cursor", "codex", "ohmypi"] as const;

export type PaintedFaction = (typeof OUTPOST_FACTIONS)[number];

/**
 * Silhouettes in the staged v2 unit pack.
 * A model maps onto one of these. The faction picks the body.
 */
export const UNIT_ROLES = [
  "scout",
  "worker",
  "drone",
  "tankette",
  "walker",
  "medic",
  "mirmi-small",
  "mirmi-armed",
  "skiff",
  "builder",
] as const;

export type UnitRole = (typeof UNIT_ROLES)[number];

export const BUILDING_KINDS = ["pad", "depot", "turret", "refinery", "barracks", "lab"] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

export const CAMP_STAGES = ["idea", "mvp", "active", "parked", "archive", "unknown"] as const;
export type CampStage = (typeof CAMP_STAGES)[number];

const STAGE_BUILDING_SET: Record<CampStage, BuildingKind[]> = {
  idea: ["pad"],
  mvp: ["pad", "depot", "turret"],
  active: ["pad", "depot", "turret", "refinery", "barracks", "lab"],
  parked: ["pad", "depot", "turret", "refinery", "barracks", "lab"],
  archive: ["pad", "depot", "turret", "refinery", "barracks", "lab"],
  unknown: ["pad", "depot", "turret", "refinery", "barracks", "lab"],
};

export const RESOURCE_KINDS = ["crystal", "biomass", "scrap"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

const ROLE_LABEL: Record<UnitRole, string> = {
  scout: "Scout",
  worker: "Worker",
  drone: "Drone",
  tankette: "Tankette",
  walker: "Walker",
  medic: "Medic",
  "mirmi-small": "Mirmi",
  "mirmi-armed": "Armed",
  skiff: "Skiff",
  builder: "Builder",
};

const BUILDING_LABEL: Record<BuildingKind, string> = {
  pad: "Pad",
  depot: "Depot",
  turret: "Turret",
  refinery: "Refinery",
  barracks: "Barracks",
  lab: "Lab",
};

const RESOURCE_LABEL: Record<ResourceKind, string> = {
  crystal: "Crystal",
  biomass: "Biomass",
  scrap: "Scrap",
};

/** Same model always picks the same silhouette, on any faction body. */
const ROLE_BY_MODEL: Record<string, UnitRole> = {
  astra: "scout",
  luna: "worker",
  terra: "drone",
  sol: "tankette",
  gemini: "medic",
  minimax: "mirmi-small",
  kimi: "mirmi-armed",
};

const ROLE_FILE: Record<UnitRole, string> = {
  scout: "scout-bot-01",
  worker: "worker-bot-02",
  "mirmi-small": "mirmi-small-03",
  "mirmi-armed": "mirmi-armed-04",
  drone: "drone-05",
  tankette: "tankette-06",
  walker: "walker-07",
  skiff: "skiff-08",
  medic: "medic-bot-09",
  builder: "builder-bot-10",
};

const BUILDING_FILE: Record<BuildingKind, string> = {
  pad: "pad-01",
  depot: "depot-02",
  turret: "turret-03",
  refinery: "refinery-04",
  barracks: "barracks-05",
  lab: "lab-06",
};

const RESOURCE_FILE: Record<ResourceKind, string> = {
  crystal: "crystal-node-01",
  biomass: "biomass-pod-02",
  scrap: "scrap-pile-03",
};

/** Longer phrases first so "mirmi-armed" wins over "mirmi". */
const ROLE_PHRASES: Array<[string, UnitRole]> = [
  ["mirmi-armed", "mirmi-armed"],
  ["mirmi armed", "mirmi-armed"],
  ["mirmi-small", "mirmi-small"],
  ["mirmi small", "mirmi-small"],
  ["tankette", "tankette"],
  ["builder", "builder"],
  ["worker", "worker"],
  ["walker", "walker"],
  ["medic", "medic"],
  ["skiff", "skiff"],
  ["drone", "drone"],
  ["scout", "scout"],
  ["mirmi", "mirmi-small"],
];

/** Neutral files that were not in the staged subset. */
const NEUTRAL_UNIT_GAP = new Set<UnitRole>(["mirmi-small", "mirmi-armed", "skiff"]);

export function roleLabel(role: UnitRole): string {
  return ROLE_LABEL[role];
}

export function buildingLabel(kind: BuildingKind): string {
  return BUILDING_LABEL[kind];
}

/** Normalizes an incoming stage string to a known camp stage. */
export function stageFromString(value: string | null | undefined): CampStage {
  const stage = (value ?? "").toLowerCase().trim();
  if (CAMP_STAGES.includes(stage as CampStage)) return stage as CampStage;
  return "unknown";
}

/** CSS class suffix for the camp stage, safe for `data-stage` attributes. */
export function stageClassName(stage: CampStage): string {
  return stage;
}

/** Which building kinds are drawn around the pad for this camp stage. */
export function buildingSetForStage(stage: CampStage | null | undefined): BuildingKind[] {
  const key = stageFromString(stage);
  return STAGE_BUILDING_SET[key];
}

export function resourceLabel(kind: ResourceKind): string {
  return RESOURCE_LABEL[kind];
}

export function paintedFaction(harness: string | null | undefined): PaintedFaction | null {
  const key = canonicalHarness(harness ?? "");
  if (key === "cursor" || key === "codex" || key === "ohmypi") return key;
  return null;
}

/**
 * Model → silhouette.
 * An exact known model wins. Otherwise a type word in the model string
 * ("Scout", "Mirmi-armed") picks that sprite. Grok* is the walker.
 */
export function unitRole(model: string): UnitRole | null {
  const compact = model.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const exact = ROLE_BY_MODEL[compact];
  if (exact) return exact;
  if (compact.includes("grok")) return "walker";
  const text = model.toLowerCase();
  for (const [phrase, role] of ROLE_PHRASES) {
    if (text.includes(phrase)) return role;
  }
  return null;
}

export function glyphId(model: string): GlyphId | null {
  return GLYPH_BY_KIND[unitKind(model)] ?? null;
}

export function heroSrc(harness: string): string | null {
  const faction = paintedFaction(harness);
  return faction ? (HERO_SRC[faction] ?? null) : null;
}

export function glyphSrc(model: string): string | null {
  const id = glyphId(model);
  return id ? GLYPH_SRC[id] : null;
}

/** v1 outpost, used when a faction has no v2 pad. */
export function outpostSrc(harness: string): string | null {
  const faction = paintedFaction(harness);
  return faction ? (OUTPOST_SRC[faction] ?? null) : null;
}

/**
 * v2 unit sprite for this harness and model.
 * Unknown harnesses, including Grok Bot, use the neutral body when that file was staged.
 * No grokbot-painted sheet exists. Grok* / Walker is `neutral-walker-07.png`
 * (same role map as MiniMax → mirmi). The map washes that body bone-white in CSS.
 * Returns null when nothing in v2 matches — caller falls back to the v1 hero.
 */
export function unitSrc(harness: string, model: string): string | null {
  const role = unitRole(model);
  if (!role) return null;
  const faction = paintedFaction(harness);
  if (faction) return `/rts-art-v2/units/${faction}-${ROLE_FILE[role]}.png`;
  if (NEUTRAL_UNIT_GAP.has(role)) return null;
  return `/rts-art-v2/units/neutral-${ROLE_FILE[role]}.png`;
}

/**
 * v2 building. Neutral pad was not staged, so a missing faction returns null
 * for the pad and the neutral sheet for the other kinds.
 */
export function buildingSrc(harness: string | null, kind: BuildingKind): string | null {
  const faction = paintedFaction(harness);
  if (!faction) {
    if (kind === "pad") return null;
    return `/rts-art-v2/buildings/neutral-${BUILDING_FILE[kind]}.png`;
  }
  return `/rts-art-v2/buildings/${faction}-${BUILDING_FILE[kind]}.png`;
}

export function resourceSrc(harness: string | null, kind: ResourceKind): string {
  const faction = paintedFaction(harness) ?? "neutral";
  return `/rts-art-v2/resources/${faction}-${RESOURCE_FILE[kind]}.png`;
}

export function markerSrc(harness: string, posture: "idle" | "working"): string {
  const faction = paintedFaction(harness) ?? "neutral";
  const file = posture === "working" ? "work-marker-02" : "idle-marker-01";
  return `/rts-art-v2/fx/${faction}-${file}.png`;
}

/**
 * Factions that can claim a camp's kit.
 * Grok Bot is last: it has no painted sheet, so a win still draws the neutral kit.
 * Ties break toward Cursor, then Codex, then OhMyPi, then Grok Bot.
 */
const CAMP_FACTIONS = ["cursor", "codex", "ohmypi", "grokbot"] as const;

function campFaction(harness: string | null | undefined): string | null {
  const painted = paintedFaction(harness);
  if (painted) return painted;
  if (canonicalHarness(harness ?? "") === "grokbot") return "grokbot";
  return null;
}

/**
 * Building art follows the faction with the most units on the repo.
 * Ties break toward Cursor, then Codex, then OhMyPi, then Grok Bot.
 * Returns null when the repo has no unit from a camp faction.
 * A Grok Bot win still uses the neutral sheet: no grokbot paint is staged.
 */
export function dominantFaction(units: Array<{ harness: string }>): string | null {
  const counts = new Map<string, number>();
  for (const unit of units) {
    const key = campFaction(unit.harness);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const faction of CAMP_FACTIONS) {
    const count = counts.get(faction) ?? 0;
    if (count > bestCount) {
      best = faction;
      bestCount = count;
    }
  }
  return best;
}
