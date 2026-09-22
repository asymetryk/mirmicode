import { repoKey as canonicalRepoKey } from "../repos";
import { stageFromString } from "../rtsArt";
import type { CampaignBase, MapSnapshot, OpenProjectSummary, Unit } from "../types";

/**
 * mirmicode-native feed adapter (contract v0).
 *
 * Loads a baked snapshot that follows `docs/feed-contract-v0.md`. CAHQ /
 * agentinfra Working Set is intentionally not used here — this is the clean,
 * first-party path. The feed contract only trusts `destination.kind` of
 * `repo` or `path`; `label` units are dropped, and units without a `repo_key`
 * are dropped (the map has no honest way to place them).
 */

export const NATIVE_FEED_SOURCE = "native-feed" as const;

/** Path resolved relative to the adapter module by Vite at build. */
export const NATIVE_FEED_FIXTURE_PATH = "../../fixtures/feed-v0-snapshot.json" as const;

export type NativeFeedCamp = {
  repo_key?: string;
  repo_label?: string;
  github_url?: string;
  stage?: string;
  open_project?: {
    id?: number;
    key?: string;
    name?: string;
    url?: string;
    status?: string;
  } | null;
  one_liner?: string;
  aliases?: string[];
};

export type NativeFeedDestination = {
  kind: string;
  value?: string;
};

export type NativeFeedUnit = {
  id?: string;
  repo_key?: string;
  harness?: string;
  model?: string;
  thread_name?: string;
  status?: string;
  destination?: NativeFeedDestination;
  updated_at?: string;
};

export type NativeFeedSnapshot = {
  fetched_at?: string;
  source?: string;
  camps?: NativeFeedCamp[];
  units?: NativeFeedUnit[];
};

export type NativeFeedRejection = {
  reason: "missing-repo-key" | "label-destination" | "unknown-camp" | "missing-id";
  id: string;
};

export type NativeFeedParseResult = {
  bases: CampaignBase[];
  rejected: NativeFeedRejection[];
};

class NativeFeedError extends Error {}

const PLACEHOLDER = "unknown";
const ACCEPTED_KINDS = new Set<string>(["repo", "path"]);

/**
 * Parse a native feed snapshot into bases + units. Drop rules:
 *  - units missing `repo_key`
 *  - units whose `destination.kind` is not `repo` or `path` (label is rejected)
 *  - units whose `repo_key` does not match a camp in this snapshot
 *  - camps with no `repo_key`
 */
export function parseNativeFeedSnapshot(snapshot: unknown): NativeFeedParseResult {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new NativeFeedError("Native feed payload is not an object.");
  }
  const root = snapshot as NativeFeedSnapshot;
  const camps = Array.isArray(root.camps) ? root.camps : [];
  const units = Array.isArray(root.units) ? root.units : [];

  // Dynamic keys: inserted from the payload, not a static lookup table.
  const campByKey = new Map<string, { camp: NativeFeedCamp; repo: string }>();
  for (const camp of camps) {
    if (!camp || typeof camp !== "object") continue;
    const key = normalizeRepoKey(camp.repo_key);
    if (!key) continue;
    const repo = repoFromCamp(camp) ?? key;
    campByKey.set(key, { camp, repo });
  }

  const rejected: NativeFeedRejection[] = [];
  // Bucket per camp repo_key — assembled dynamically.
  const unitsByCamp = new Map<string, Unit[]>();
  for (const raw of units) {
    if (!raw || typeof raw !== "object") continue;
    const unit = raw as NativeFeedUnit;
    const id = typeof unit.id === "string" && unit.id ? unit.id : null;
    if (!id) {
      rejected.push({ reason: "missing-id", id: String(unit.id ?? "") });
      continue;
    }
    const repoKeyValue = normalizeRepoKey(unit.repo_key);
    if (!repoKeyValue) {
      rejected.push({ reason: "missing-repo-key", id });
      continue;
    }
    const destination = unit.destination;
    if (!destination || typeof destination !== "object" || !ACCEPTED_KINDS.has(destination.kind)) {
      rejected.push({ reason: "label-destination", id });
      continue;
    }
    if (!campByKey.has(repoKeyValue)) {
      rejected.push({ reason: "unknown-camp", id });
      continue;
    }
    const bucket = unitsByCamp.get(repoKeyValue) ?? [];
    bucket.push(toUnit(unit));
    unitsByCamp.set(repoKeyValue, bucket);
  }

  const bases: CampaignBase[] = [];
  for (const [key, { camp, repo }] of campByKey) {
    const bucket = unitsByCamp.get(key) ?? [];
    bases.push({
      id: campIdFor(repo),
      repo,
      label: labelFromCamp(camp),
      openProject: openProjectFromCamp(camp),
      updatedAt: latestUpdatedAt(bucket),
      place: null,
      stage: stageFromString(camp.stage ?? null),
      units: bucket,
    });
  }

  return { bases, rejected };
}

/** Adapter entry point: parse + assemble a `MapSnapshot` with `source = "native-feed"`. */
export function loadNativeFeed(
  payload: unknown,
  now: Date = new Date(),
): { snapshot: MapSnapshot; rejected: NativeFeedRejection[] } {
  const parsed = parseNativeFeedSnapshot(payload);
  const fetchedAt =
    typeof (payload as { fetched_at?: unknown } | null)?.fetched_at === "string" &&
    (payload as { fetched_at?: string }).fetched_at
      ? (payload as { fetched_at: string }).fetched_at
      : now.toISOString();
  return {
    snapshot: {
      source: NATIVE_FEED_SOURCE,
      fetchedAt,
      bases: parsed.bases,
      notice: null,
      stale: false,
    },
    rejected: parsed.rejected,
  };
}

/** Module-baked fixture used by App when VITE_FEED_SOURCE=native. */
export async function loadNativeFeedFixture(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<MapSnapshot> {
  const url = new URL(NATIVE_FEED_FIXTURE_PATH, import.meta.url).toString();
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) {
    throw new NativeFeedError(`Native feed fixture responded ${response.status}.`);
  }
  const payload = (await response.json()) as unknown;
  return loadNativeFeed(payload, now).snapshot;
}

function normalizeRepoKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? canonicalRepoKey(trimmed) : null;
}

function repoFromCamp(camp: NativeFeedCamp): string | null {
  const url = typeof camp.github_url === "string" ? camp.github_url : "";
  const trimmed = url.trim();
  if (trimmed) {
    const ownerRepo = trimmed
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "");
    if (ownerRepo.includes("/")) {
      const [owner, name] = ownerRepo.split("/", 2);
      if (owner && name) return `${owner}/${name}`;
    }
  }
  return normalizeRepoKey(camp.repo_key);
}

function labelFromCamp(camp: NativeFeedCamp): string | null {
  if (typeof camp.repo_label === "string" && camp.repo_label.trim().length > 0) {
    return camp.repo_label.trim();
  }
  return null;
}

function openProjectFromCamp(camp: NativeFeedCamp): OpenProjectSummary | null {
  const op = camp.open_project;
  if (!op || typeof op !== "object") return null;
  const href = typeof op.url === "string" && op.url.trim() ? op.url.trim() : null;
  const name = typeof op.name === "string" && op.name.trim() ? op.name.trim() : null;
  const status = typeof op.status === "string" && op.status.trim() ? op.status.trim() : null;
  if (!href && !name && !status) return null;
  return { href, name, status, summary: null };
}

function toUnit(raw: NativeFeedUnit): Unit {
  const harness = typeof raw.harness === "string" && raw.harness.trim() ? raw.harness.trim() : PLACEHOLDER;
  const model = typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : PLACEHOLDER;
  const threadName = typeof raw.thread_name === "string" && raw.thread_name.trim() ? raw.thread_name.trim() : null;
  const status = typeof raw.status === "string" && raw.status.trim() ? raw.status.trim() : null;
  const updatedAt = typeof raw.updated_at === "string" && raw.updated_at ? raw.updated_at : PLACEHOLDER;
  // The native feed never carries prompt bodies. lastPrompt stays null so the
  // public-mode scrubber is a no-op for this source.
  return {
    id: raw.id ?? PLACEHOLDER,
    harness,
    model,
    threadName,
    label: null,
    lastPrompt: null,
    hasContextSnippet: false,
    status,
    lifecycle: null,
    presence: null,
    freshness: null,
    hidden: false,
    updatedAt,
  };
}

function latestUpdatedAt(units: Unit[]): string {
  let latest = "";
  for (const unit of units) {
    if (unit.updatedAt && unit.updatedAt !== PLACEHOLDER && unit.updatedAt > latest) {
      latest = unit.updatedAt;
    }
  }
  return latest || PLACEHOLDER;
}

function campIdFor(repo: string): string {
  const slug = canonicalRepoKey(repo).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "camp";
  return `native-${slug}`;
}
