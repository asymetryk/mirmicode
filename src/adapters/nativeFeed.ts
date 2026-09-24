import feedV0Snapshot from "../../fixtures/feed-v0-snapshot.json";
import { repoKey as canonicalRepoKey } from "../repos";
import { stageFromString } from "../rtsArt";
import type { BuildingKind, CampAppearance, CampLinks, CampaignBase, LatestThread, LinkProvenance, MapSnapshot, OpenProjectSummary, TaskOutcome, TaskTokenUsage, Unit, UnitAppearance, UnitRole } from "../types";

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

/** Parsed snapshot bundled into the build (no runtime fetch). */
export const NATIVE_FEED_FIXTURE_PAYLOAD = feedV0Snapshot;

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
  appearance?: { color?: unknown; building_set?: unknown };
  links?: {
    github_url?: string | null;
    openproject_url?: string | null;
    buzz_url?: string | null;
  };
  link_provenance?: {
    github_url?: "manual" | "observation" | "none";
    openproject_url?: "manual" | "observation" | "none";
    buzz_url?: "manual" | "observation" | "none";
  };
  latest_thread?: {
    id?: string;
    title?: string | null;
    url?: string;
    updated_at?: string;
  } | null;
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
  prompt_tldr?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  token_usage?: Partial<TaskTokenUsage> | null;
  outcome?: Partial<TaskOutcome> | null;
  destination?: NativeFeedDestination;
  updated_at?: string;
  parent_id?: string | null;
  native_url?: string | null;
  appearance?: { color?: unknown; unit_role?: unknown };
};

export type NativeFeedSnapshot = {
  fetched_at?: string;
  source?: string;
  camps?: NativeFeedCamp[];
  units?: NativeFeedUnit[];
  stale?: boolean;
  notice?: string | null;
  metadata_revision?: number;
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
      // Keep the source's canonical key for writes; `repo` is a display identity.
      repoKey: typeof camp.repo_key === "string" && camp.repo_key.trim() ? camp.repo_key.trim() : key,
      repo,
      label: labelFromCamp(camp),
      openProject: openProjectFromCamp(camp),
      updatedAt: latestUpdatedAt(bucket),
      place: null,
      stage: stageFromString(camp.stage ?? null),
      oneLiner: oneLinerFromCamp(camp),
      appearance: campAppearanceFrom(camp.appearance),
      links: linksFromCamp(camp),
      linkProvenance: linkProvenanceFrom(camp.link_provenance),
      latestThread: latestThreadFrom(camp.latest_thread),
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
      notice: typeof (payload as NativeFeedSnapshot).notice === "string" ? (payload as NativeFeedSnapshot).notice! : null,
      stale: (payload as NativeFeedSnapshot).stale === true,
      metadataRevision: typeof (payload as NativeFeedSnapshot).metadata_revision === "number"
        ? (payload as NativeFeedSnapshot).metadata_revision
        : undefined,
    },
    rejected: parsed.rejected,
  };
}

/** Same-origin Mirmicode API, used by the standalone deployment. */
export async function loadNativeFeedServer(fetchImpl: typeof fetch = fetch): Promise<MapSnapshot> {
  const response = await fetchImpl("/api/v1/snapshot", { cache: "no-store" });
  if (!response.ok) throw new Error(`Mirmicode feed returned HTTP ${response.status}.`);
  return { ...loadNativeFeed(await response.json()).snapshot, source: "mirmicode" };
}

/** Module-baked fixture used by App when VITE_FEED_SOURCE=native. */
export async function loadNativeFeedFixture(
  _fetchImpl?: typeof fetch,
  now: Date = new Date(),
): Promise<MapSnapshot> {
  return loadNativeFeed(NATIVE_FEED_FIXTURE_PAYLOAD, now).snapshot;
}

function normalizeRepoKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? canonicalRepoKey(trimmed) : null;
}

function repoFromCamp(camp: NativeFeedCamp): string | null {
  if (typeof camp.repo_key === "string" && camp.repo_key.startsWith("local:sha256:") &&
      typeof camp.repo_label === "string" && camp.repo_label.trim()) {
    return camp.repo_label.trim();
  }
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
  const sourceStatus = typeof raw.status === "string" && raw.status.trim() ? raw.status.trim() : null;
  const activityStatus = sourceStatus && ["working", "completed", "needs-attention", "unknown"].includes(sourceStatus)
    ? sourceStatus
    : null;
  // Preserve the preexisting map posture input; the task card consumes the
  // additional activityStatus field without changing current map behavior.
  const status = sourceStatus;
  const updatedAt = typeof raw.updated_at === "string" && raw.updated_at ? raw.updated_at : PLACEHOLDER;
  // The native feed never carries prompt bodies. lastPrompt stays null so the
  // public-mode scrubber is a no-op for this source. snippetExempt lets the
  // map hard-filter keep these units without lying about hasContextSnippet.
  return {
    id: raw.id ?? PLACEHOLDER,
    harness,
    model,
    threadName,
    label: null,
    lastPrompt: null,
    hasContextSnippet: false,
    snippetExempt: true,
    status,
    activityStatus,
    // Public snapshots are redacted by the API; an included value means the
    // server verified the private editor session for this request.
    promptTldr: readNullableString(raw.prompt_tldr),
    taskStartedAt: readNullableString(raw.started_at),
    taskFinishedAt: readNullableString(raw.finished_at),
    taskDurationMs: readNullableNumber(raw.duration_ms),
    tokenUsage: normalizeTokenUsage(raw.token_usage),
    outcome: normalizeOutcome(raw.outcome),
    lifecycle: null,
    presence: null,
    freshness: null,
    hidden: false,
    updatedAt,
    parentId: typeof raw.parent_id === "string" ? raw.parent_id : null,
    nativeUrl: typeof raw.native_url === "string" && /^https:\/\/|^codex:\/\//.test(raw.native_url) ? raw.native_url : null,
    appearance: unitAppearanceFrom(raw.appearance),
  };
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeTokenUsage(value: unknown): TaskTokenUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<TaskTokenUsage>;
  const normalized = {
    input_tokens: readNullableNumber(raw.input_tokens),
    output_tokens: readNullableNumber(raw.output_tokens),
    cached_input_tokens: readNullableNumber(raw.cached_input_tokens),
    reasoning_output_tokens: readNullableNumber(raw.reasoning_output_tokens),
    total_tokens: readNullableNumber(raw.total_tokens),
  };
  return Object.values(normalized).some((count) => count !== null) ? normalized : null;
}

function normalizeOutcome(value: unknown): TaskOutcome | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<TaskOutcome>;
  const state = readNullableString(raw.state);
  const summary = readNullableString(raw.summary);
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : null;
  return state || summary || evidence?.length ? { state, summary, evidence: evidence?.length ? evidence : null } : null;
}

const BUILDING_KINDS = new Set<BuildingKind>(["pad", "depot", "turret", "refinery", "barracks", "lab"]);
const UNIT_ROLES = new Set<UnitRole>([
  "scout", "worker", "drone", "tankette", "walker", "medic", "mirmi-small", "mirmi-armed", "skiff", "builder",
]);

function validColor(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

function campAppearanceFrom(value: unknown): CampAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { color: null, buildingSet: null };
  const source = value as Record<string, unknown>;
  const buildingSet = Array.isArray(source.building_set) &&
    source.building_set.every((kind) => typeof kind === "string" && BUILDING_KINDS.has(kind as BuildingKind))
    ? [...new Set(source.building_set as BuildingKind[])] : null;
  return { color: validColor(source.color), buildingSet };
}

function unitAppearanceFrom(value: unknown): UnitAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { color: null, unitRole: null };
  const source = value as Record<string, unknown>;
  const unitRole = typeof source.unit_role === "string" && UNIT_ROLES.has(source.unit_role as UnitRole)
    ? source.unit_role as UnitRole : null;
  return { color: validColor(source.color), unitRole };
}

function linksFromCamp(camp: NativeFeedCamp): CampLinks {
  const links = camp.links;
  const github = links && Object.prototype.hasOwnProperty.call(links, "github_url") ? links.github_url : camp.github_url;
  const openProject = links && Object.prototype.hasOwnProperty.call(links, "openproject_url")
    ? links.openproject_url : openProjectFromCamp(camp)?.href ?? null;
  const buzz = links && Object.prototype.hasOwnProperty.call(links, "buzz_url") ? links.buzz_url : null;
  return {
    githubUrl: safeHttps(github),
    openProjectUrl: safeHttps(openProject),
    buzzUrl: safeHttps(buzz),
  };
}

function safeHttps(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function latestThreadFrom(value: NativeFeedCamp["latest_thread"]): LatestThread | null {
  if (!value || typeof value !== "object" || typeof value.id !== "string" ||
      typeof value.updated_at !== "string") return null;
  const url = typeof value.url === "string" && /^(https:\/\/|codex:\/\/)/.test(value.url)
    ? value.url : null;
  if (!url) return null;
  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : null,
    url,
    updatedAt: value.updated_at,
  };
}

function linkProvenanceFrom(value: NativeFeedCamp["link_provenance"]): LinkProvenance {
  const allowed = new Set(["manual", "observation", "none"]);
  const read = (item: unknown): "manual" | "observation" | "none" =>
    typeof item === "string" && allowed.has(item) ? item as "manual" | "observation" | "none" : "none";
  return {
    githubUrl: read(value?.github_url),
    openProjectUrl: read(value?.openproject_url),
    buzzUrl: read(value?.buzz_url),
  };
}

function oneLinerFromCamp(camp: NativeFeedCamp): string | null {
  const text = typeof camp.one_liner === "string" ? camp.one_liner.trim() : "";
  return text.length > 0 ? text : null;
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
