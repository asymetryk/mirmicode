import type { CampaignBase } from "./types";

/** Repo name used when a nested Working Set item has no observed repo. */
export const UNASSIGNED_REPO = "Unassigned";

export type NoiseFilter = {
  /**
   * Hide presence `not_seen`, lifecycle `archived` or `detached`,
   * and Cursor units with lifecycle `unknown` and no repo.
   */
  hideNoise: boolean;
};

export const DEFAULT_NOISE_FILTER: NoiseFilter = {
  hideNoise: true,
};

export type NoiseReason = "not_seen" | "archived" | "detached" | "cursor_collector";

export type NoiseSubject = {
  presence: string | null;
  lifecycle: string | null;
  harness?: string | null;
};

export type FilteredBases = {
  bases: CampaignBase[];
  hiddenCount: number;
};

const NOT_SEEN = "not_seen";
const ARCHIVED = "archived";
const DETACHED = "detached";
const UNKNOWN = "unknown";
const CURSOR = "cursor";

export function isUnassignedRepo(repo: string): boolean {
  return repo.trim().toLowerCase() === UNASSIGNED_REPO.toLowerCase();
}

/** Assigned repos draw a token per visible unit. Unassigned is one outpost. */
export function drawsUnitTokens(repo: string): boolean {
  return !isUnassignedRepo(repo);
}

/**
 * Trimmed, lowercased field text.
 * Missing, blank, and non-string values are null so a hide rule can be skipped.
 * Live hide values are the exact strings `not_seen`, `archived`, `detached`, and `unknown`.
 * `not-seen`, `unseen`, `archive`, and `detach` stay distinct.
 */
export function exactToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  return token.length > 0 ? token : null;
}

/** Why this unit is hidden, or null when it stays on the map. */
export function noiseReason(unit: NoiseSubject, filter: NoiseFilter, repo = ""): NoiseReason | null {
  if (!filter.hideNoise) return null;
  const presence = exactToken(unit.presence);
  if (presence === NOT_SEEN) return "not_seen";
  const lifecycle = exactToken(unit.lifecycle);
  if (lifecycle === ARCHIVED) return "archived";
  if (lifecycle === DETACHED) return "detached";
  if (
    lifecycle === UNKNOWN &&
    exactToken(unit.harness) === CURSOR &&
    isUnassignedRepo(repo)
  ) {
    return "cursor_collector";
  }
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
      if (noiseReason(unit, filter, base.repo)) {
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
