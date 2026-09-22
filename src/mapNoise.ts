import type { CampaignBase } from "./types";

/** Repo name used when a nested Working Set item has no observed repo. */
export const UNASSIGNED_REPO = "Unassigned";

export type NoiseFilter = {
  /** Hide presence `not_seen` and annotation.hidden true. */
  hideNoise: boolean;
  /** Optional. Detached stays dimmed when this is off. */
  hideDetached: boolean;
  /** Optional. Archived stays dimmed when this is off. */
  hideArchived: boolean;
};

export const DEFAULT_NOISE_FILTER: NoiseFilter = {
  hideNoise: true,
  hideDetached: false,
  hideArchived: false,
};

export type NoiseReason = "not_seen" | "archived" | "hidden" | "detached";

export type Emphasis = "normal" | "dim" | "collector";

export type NoiseSubject = {
  presence: string | null;
  lifecycle: string | null;
  harness?: string | null;
  hidden?: boolean;
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
 * Live strings include `not_seen`, `archived`, `detached`, and `unknown`.
 * `not-seen`, `unseen`, `archive`, and `detach` stay distinct.
 */
export function exactToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  return token.length > 0 ? token : null;
}

/**
 * Hard-hide reasons. Archived, detached, and unknown stay visible unless their optional switch is on.
 * snapshot.stale is not a hide signal.
 */
export function noiseReason(unit: NoiseSubject, filter: NoiseFilter): NoiseReason | null {
  if (filter.hideNoise) {
    if (unit.hidden === true) return "hidden";
    if (exactToken(unit.presence) === NOT_SEEN) return "not_seen";
  }
  if (filter.hideArchived && exactToken(unit.lifecycle) === ARCHIVED) return "archived";
  if (filter.hideDetached && exactToken(unit.lifecycle) === DETACHED) return "detached";
  return null;
}

/**
 * Archived, detached, and unknown are cold, not dead.
 * A Cursor unit with lifecycle unknown and no repo is dimmed further.
 */
export function unitEmphasis(unit: NoiseSubject, repo = ""): Emphasis {
  const lifecycle = exactToken(unit.lifecycle);
  if (lifecycle === UNKNOWN && exactToken(unit.harness) === CURSOR && isUnassignedRepo(repo)) {
    return "collector";
  }
  if (lifecycle === ARCHIVED || lifecycle === DETACHED || lifecycle === UNKNOWN) return "dim";
  return "normal";
}

function emphasisRank(emphasis: Emphasis): number {
  if (emphasis === "collector") return 2;
  if (emphasis === "dim") return 1;
  return 0;
}

/**
 * Drops hidden units. A base with nothing left is omitted.
 * Unassigned stays one base; callers must not fan its units out as tokens.
 */
export function applyNoiseFilter(bases: CampaignBase[], filter: NoiseFilter): FilteredBases {
  let hiddenCount = 0;
  const next: CampaignBase[] = [];
  for (const base of bases) {
    const visible = base.units.filter((unit) => {
      if (noiseReason(unit, filter)) {
        hiddenCount += 1;
        return false;
      }
      return true;
    });
    const units = isUnassignedRepo(base.repo)
      ? [...visible].sort(
          (a, b) => emphasisRank(unitEmphasis(a, base.repo)) - emphasisRank(unitEmphasis(b, base.repo)),
        )
      : visible;
    if (units.length === 0) continue;
    const changed = units.length !== base.units.length || isUnassignedRepo(base.repo);
    next.push(changed ? { ...base, units } : base);
  }
  return { bases: next, hiddenCount };
}
