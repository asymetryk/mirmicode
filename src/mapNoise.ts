import { canonicalHarness } from "./factions";
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
  /** Live last-user prompt. Thread labels do not count. */
  lastPrompt?: string | null;
  /** Payload flag. True when a prompt exists even if public scrub cleared the text. */
  hasContextSnippet?: boolean;
  /**
   * Adapter-set flag. Native feed units have no prompt bodies but should
   * still be drawn; the snippet hard-filter lets them through.
   */
  snippetExempt?: boolean;
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
 * A usable last-user prompt. Blank strings are not a snippet.
 * This does not hide a unit. Empty shells simply have no Last prompt line.
 */
export function hasContextSnippet(unit: { lastPrompt?: string | null }): boolean {
  return typeof unit.lastPrompt === "string" && unit.lastPrompt.trim().length > 0;
}

function isOhMyPi(harness: string | null | undefined): boolean {
  return canonicalHarness(harness ?? "") === "ohmypi";
}

/**
 * OhMyPi stays full strength when detached if it is present or still has a prompt.
 * Archived and unknown stay dim. Other harnesses still dim when detached.
 */
function ohMyPiDetachedStaysBright(unit: NoiseSubject): boolean {
  if (!isOhMyPi(unit.harness)) return false;
  if (exactToken(unit.presence) === "present") return true;
  return hasUsableContextSnippet(unit);
}

/**
 * Archived, detached, and unknown are cold, not dead.
 * A Cursor unit with lifecycle unknown and no repo is dimmed further.
 * OhMyPi is not dimmed for detached alone when it is present or has a prompt.
 */
export function unitEmphasis(unit: NoiseSubject, repo = ""): Emphasis {
  const lifecycle = exactToken(unit.lifecycle);
  if (lifecycle === UNKNOWN && exactToken(unit.harness) === CURSOR && isUnassignedRepo(repo)) {
    return "collector";
  }
  if (lifecycle === DETACHED && ohMyPiDetachedStaysBright(unit)) return "normal";
  if (lifecycle === ARCHIVED || lifecycle === DETACHED || lifecycle === UNKNOWN) return "dim";
  return "normal";
}

function emphasisRank(emphasis: Emphasis): number {
  if (emphasis === "collector") return 2;
  if (emphasis === "dim") return 1;
  return 0;
}

/** Last-prompt / note chain only. Thread labels alone are not a usable snippet. */
export function hasUsableContextSnippet(
  unit: {
    hasContextSnippet?: boolean;
    snippetExempt?: boolean;
    lastPrompt?: string | null;
  },
): boolean {
  if (unit.snippetExempt === true) return true;
  if (unit.hasContextSnippet === true) return true;
  if (typeof unit.lastPrompt === "string" && unit.lastPrompt.trim().length > 0) return true;
  return false;
}

/**
 * Drops hidden units and units with no usable context snippet.
 * A base with nothing left is omitted. Snippet hard filter wins over noise soft-keep.
 * Unassigned stays one base; callers must not fan its units out as tokens.
 */
export function applyNoiseFilter(bases: CampaignBase[], filter: NoiseFilter): FilteredBases {
  let hiddenCount = 0;
  const next: CampaignBase[] = [];
  for (const base of bases) {
    const visible = base.units.filter((unit) => {
      if (!hasUsableContextSnippet(unit)) {
        hiddenCount += 1;
        return false;
      }
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
    if (units.length === 0) {
      // A camp with no army stays. A base whose units were all filtered does not.
      if (base.units.length === 0) next.push(base);
      continue;
    }
    const changed = units.length !== base.units.length || isUnassignedRepo(base.repo);
    next.push(changed ? { ...base, units } : base);
  }
  return { bases: next, hiddenCount };
}
