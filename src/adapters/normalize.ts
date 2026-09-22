import { UNASSIGNED_REPO } from "../mapNoise";
import { scrubSensitivePath, shouldScrubPrompts } from "../publicMode";
import type { CampaignBase, Unit } from "../types";

const TEXT_LIMIT = 180;

export type NormalizedPayload = {
  bases: CampaignBase[];
  issues: string[];
  /** True only when snapshot.stale is boolean true. Never a hide signal. */
  stale: boolean;
};

/**
 * Maps a Working Set JSON payload into bases and the units on them.
 * A base is a repo. Each unit is one agent: harness = faction, model = unit type.
 * Flat and nested Working Set rows that share a repo collapse into one base.
 * Unknown fields are dropped. Transcript bodies are never read.
 */
export function normalizeWorkingSetPayload(payload: unknown): NormalizedPayload {
  const records = readRecords(payload);
  const stale = readSnapshotStale(payload);
  if (!records.ok) {
    return { bases: [], issues: [records.issue], stale };
  }

  const issues: string[] = [];
  const byRepo = new Map<string, MutableBase>();
  const order: string[] = [];
  const seenBaseIds = new Map<string, number>();
  const seenUnitIds = new Map<string, number>();

  records.value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(`Dropped record ${index + 1}: expected an object.`);
      return;
    }
    const record = entry as Record<string, unknown>;
    const repo = readRepo(record);
    if (!repo) {
      issues.push(`Dropped record ${index + 1}: missing repo/base.`);
      return;
    }

    const base = ensureBase(byRepo, order, seenBaseIds, repo, record);
    const nested = readUnitArray(record);
    if (nested) {
      nested.forEach((unitEntry, unitIndex) => {
        if (!unitEntry || typeof unitEntry !== "object" || Array.isArray(unitEntry)) {
          issues.push(`Dropped unit ${unitIndex + 1} in record ${index + 1}: expected an object.`);
          return;
        }
        base.units.push(readUnit(unitEntry as Record<string, unknown>, repo, seenUnitIds));
      });
      return;
    }

    base.units.push(readUnit(record, repo, seenUnitIds));
  });

  const bases = order.map((key) => {
    const base = byRepo.get(key);
    if (!base) {
      throw new Error("Missing normalized base.");
    }
    return {
      id: base.id,
      repo: base.repo,
      label: base.label,
      updatedAt: latestTimestamp(base.units.map((unit) => unit.updatedAt).concat(base.updatedAt)),
      place: base.place,
      units: base.units,
    };
  });

  return { bases, issues, stale };
}

/** Banner signal. Missing, false, and non-booleans stay false. */
export function readSnapshotStale(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const snapshot = readObject((payload as Record<string, unknown>).snapshot);
  return snapshot?.stale === true;
}

type MutableBase = {
  id: string;
  repo: string;
  label: string | null;
  updatedAt: string;
  place: { x: number; y: number } | null;
  units: Unit[];
};

function ensureBase(
  byRepo: Map<string, MutableBase>,
  order: string[],
  seenBaseIds: Map<string, number>,
  repo: string,
  record: Record<string, unknown>,
): MutableBase {
  const key = repo.toLowerCase();
  const existing = byRepo.get(key);
  if (existing) {
    if (readUnitArray(record) && !existing.label) existing.label = bound(readString(record.label));
    if (!existing.place) existing.place = readPlace(record);
    const touched = readUpdatedAt(record);
    if (touched !== "unknown") existing.updatedAt = latestTimestamp([existing.updatedAt, touched]);
    return existing;
  }

  const requestedId = readUnitArray(record) ? bound(readString(record.id)) : null;
  const id = uniqueId(requestedId ?? repoSlug(repo), seenBaseIds);
  const base: MutableBase = {
    id,
    repo: bound(repo) ?? repo,
    label: readUnitArray(record) ? bound(readString(record.label)) : null,
    updatedAt: readUpdatedAt(record),
    place: readPlace(record),
    units: [],
  };
  byRepo.set(key, base);
  order.push(key);
  return base;
}

function readUnitArray(record: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(record.units)) return record.units;
  if (Array.isArray(record.agents)) return record.agents;
  return null;
}

function readUnit(
  record: Record<string, unknown>,
  repo: string,
  seenUnitIds: Map<string, number>,
): Unit {
  const observed = readObject(record.observed);
  const annotation = readObject(record.annotation);
  const harness = bound(readHarness(record)) ?? "unknown";
  const model = bound(readModel(record)) ?? "unknown";
  const threadName = scrubSensitivePath(
    bound(readString(record.thread_name) ?? readString(record.threadName)),
  );
  const rawId =
    bound(readString(record.item_id) ?? readString(record.id)) ??
    fallbackUnitId(repo, harness, model, threadName);
  const label = scrubSensitivePath(
    bound(readString(annotation?.label) ?? readString(record.label) ?? threadName),
  );
  // Same order as Last prompt / hard-filter snippet. Public BIP drops the text but keeps existence.
  const resolvedPrompt =
    readString(observed?.lastUserPrompt) ??
    readString(observed?.last_user_prompt) ??
    readString(record.last_prompt) ??
    readString(record.lastPrompt) ??
    readString(record.last_user_message) ??
    readString(record.lastUserMessage) ??
    readString(record.user_prompt) ??
    readString(record.userPrompt) ??
    readString(record.prompt) ??
    readString(record.input) ??
    readString(annotation?.note);
  const hasContextSnippet = resolvedPrompt !== null;
  const lastPrompt = shouldScrubPrompts() ? null : resolvedPrompt;
  return {
    id: uniqueId(rawId, seenUnitIds),
    harness,
    model,
    threadName,
    label,
    lastPrompt,
    hasContextSnippet,
    status: bound(readString(annotation?.status) ?? readString(record.status)),
    lifecycle: bound(
      readString(observed?.lifecycle) ??
        readString(record.lifecycle) ??
        readString(annotation?.lifecycle),
    ),
    presence: bound(
      readString(observed?.presence) ??
        readString(record.presence) ??
        readString(annotation?.presence),
    ),
    freshness: bound(readString(observed?.freshness) ?? readString(record.freshness)),
    hidden: annotation?.hidden === true || record.hidden === true,
    updatedAt: readUpdatedAt(record),
  };
}

function readRecords(
  payload: unknown,
): { ok: true; value: unknown[] } | { ok: false; issue: string } {
  if (Array.isArray(payload)) return { ok: true, value: payload };
  if (!payload || typeof payload !== "object") {
    return { ok: false, issue: "Payload was not a JSON object or array." };
  }
  const record = payload as Record<string, unknown>;
  for (const key of ["bases", "items", "records", "agents", "units"] as const) {
    const value = record[key];
    if (Array.isArray(value)) return { ok: true, value };
  }
  const snapshot = readObject(record.snapshot);
  if (snapshot) {
    for (const key of ["items", "bases", "records", "agents", "units"] as const) {
      const value = snapshot[key];
      if (Array.isArray(value)) return { ok: true, value };
    }
  }
  return { ok: false, issue: "Payload had no bases, items, records, agents, or units array." };
}

function readRepo(record: Record<string, unknown>): string | null {
  if ("observed" in record || "annotation" in record) {
    const observed = readObject(record.observed);
    return readString(observed?.repo_name) ?? readString(observed?.repo) ?? UNASSIGNED_REPO;
  }
  for (const key of ["repo_name", "repo", "repository", "project", "full_name"] as const) {
    const value = readString(record[key]);
    if (value) return value;
  }
  const base = record.base;
  if (typeof base === "string") return readString(base);
  if (base && typeof base === "object" && !Array.isArray(base)) {
    const nested = base as Record<string, unknown>;
    for (const key of ["repo", "repository", "full_name", "name"] as const) {
      const value = readString(nested[key]);
      if (value) return value;
    }
  }
  return null;
}

function readHarness(record: Record<string, unknown>): string {
  const observed = readObject(record.observed);
  const value =
    readString(observed?.surface) ??
    readString(observed?.harness) ??
    readString(record.harness) ??
    readString(record.surface);
  return value ? canonicalHarness(value) : "unknown";
}

/** Fold spelling variants onto the painted faction ids. Unknown harnesses stay lowercase. */
function canonicalHarness(value: string): string {
  const compact = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (compact === "cursor") return "cursor";
  if (compact === "codex") return "codex";
  if (compact === "ohmypi") return "ohmypi";
  if (compact === "opencode") return "opencode";
  return value.toLowerCase();
}

function readModel(record: Record<string, unknown>): string {
  const observed = readObject(record.observed);
  const value = readString(observed?.model) ?? readString(record.model);
  if (!value || value.toLowerCase() === "unknown") return "unknown";
  return value;
}

function readUpdatedAt(record: Record<string, unknown>): string {
  const observed = readObject(record.observed);
  const annotation = readObject(record.annotation);
  return (
    readString(annotation?.updated_at) ??
    readString(observed?.updated_at) ??
    readString(record.updated_at) ??
    readString(record.updatedAt) ??
    readString(record.last_touched) ??
    readString(record.lastTouched) ??
    "unknown"
  );
}

function readPlace(record: Record<string, unknown>): { x: number; y: number } | null {
  const x = record.x;
  const y = record.y;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function bound(value: string | null): string | null {
  if (value === null) return null;
  if (value.length <= TEXT_LIMIT) return value;
  return `${value.slice(0, TEXT_LIMIT - 1)}…`;
}

function fallbackUnitId(
  repo: string,
  harness: string,
  model: string,
  threadName: string | null,
): string {
  return [repo, harness, model, threadName ?? ""].join("::").toLowerCase();
}

function repoSlug(repo: string): string {
  return repo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "base";
}

function uniqueId(id: string, seen: Map<string, number>): string {
  const count = seen.get(id) ?? 0;
  seen.set(id, count + 1);
  return count === 0 ? id : `${id}-${count + 1}`;
}

function latestTimestamp(values: string[]): string {
  let best = "unknown";
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = value;
    }
  }
  return best;
}
