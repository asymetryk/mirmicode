import { unitKind, type UnitKind } from "./factions";

/** Crest shared by models. Same model always wears the same glyph, on any faction body. */
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

export function glyphId(model: string): GlyphId | null {
  return GLYPH_BY_KIND[unitKind(model)] ?? null;
}

export function heroSrc(harness: string): string | null {
  return HERO_SRC[harness.toLowerCase()] ?? null;
}

export function glyphSrc(model: string): string | null {
  const id = glyphId(model);
  return id ? GLYPH_SRC[id] : null;
}

export function outpostSrc(harness: string): string | null {
  return OUTPOST_SRC[harness.toLowerCase()] ?? null;
}

/**
 * Building art follows the faction with the most units on the repo.
 * Ties break toward Cursor, then Codex, then OhMyPi.
 * Returns null when the repo has no unit from a painted faction.
 */
export function dominantFaction(units: Array<{ harness: string }>): string | null {
  const counts = new Map<string, number>();
  for (const unit of units) {
    const key = unit.harness.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const faction of OUTPOST_FACTIONS) {
    const count = counts.get(faction) ?? 0;
    if (count > bestCount) {
      best = faction;
      bestCount = count;
    }
  }
  return best;
}
