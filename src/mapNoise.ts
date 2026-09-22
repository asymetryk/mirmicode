import type { CampaignBase, Unit } from "./types";

/** Repo name used when a nested Working Set item has no observed repo. */
export const UNASSIGNED_REPO = "Unassigned";

export type NoiseFilter = {
  /** Hide `presence` not_seen and `lifecycle` archived or detached. */
  hideNoise: boolean;
  /** Hide units whose status field is the string unknown. */
  hideUnknownStatus: boolean;
};

export const DEFAULT_NOISE_FILTER: NoiseFilter = {
  hideNoise: true,
  hideUnknownStatus: true,
};

export type NoiseReason = "not_seen" | "archived" | "detached" | "unknown";

export type FilteredBases = {
  bases: CampaignBase[];
  hiddenCount: number;
};

const NOT_SEEN = "notseen";
const ARCHIVED = "archived";
const DETACHED = "detached";
const UNKNOWN = "unknown";

export function isUnassignedRepo(repo: string): boolean {
  return repo.trim().toLowerCase() === UNASSIGNED_REPO.toLowerCase();
}

/** Assigned repos draw a token per visible unit. Unassigned is one outpost. */
export function drawsUnitTokens(repo: string): boolean {
  return !isUnassignedRepo(repo);
}

/**
 * Letters and digits only, lowercased.
 * Missing, blank, and non-string values are null so a hide rule can be skipped.
 * `not_seen`, `not-seen`, and `not seen` all become `notseen`.
 * `offline`, `unseen`, `archive`, and `detach` stay distinct.
 */
export function compactField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact.length > 0 ? compact : null;
}

/** Why this unit is hidden, or null when it stays on the map. */
export function noiseReason(unit: Pick<Unit, "presence" | "lifecycle" | "status">, filter: NoiseFilter): NoiseReason | null {
  if (filter.hideNoise) {
    const presence = compactField(unit.presence);
    if (presence === NOT_SEEN) return "not_seen";
    const lifecycle = compactField(unit.lifecycle);
    if (lifecycle === ARCHIVED) return "archived";
    if (lifecycle === DETACHED) return "detached";
  }
  if (filter.hideUnknownStatus && compactField(unit.status) === UNKNOWN) return "unknown";
  return null;
}

/**
 * Drops hidden units. A base with nothing left is omitted.
 * Unassigned stays one base; callers must not fan its units out as tokens.
 */
export function applyNoiseFilter(bases: CampaignBase[], filter: NoiseFilter): FilteredBases {
  let hiddenCount = 0;
  const next: CampaignBase[] = [];
  for (const base of bases) {
    const units = base.units.filter((unit) => {
      if (noiseReason(unit, filter)) {
        hiddenCount += 1;
        return false;
      }
      return true;
    });
    if (units.length === 0) continue;
    next.push(units.length === base.units.length ? base : { ...base, units });
  }
  return { bases: next, hiddenCount };
}
