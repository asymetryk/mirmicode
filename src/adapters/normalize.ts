import type { CampaignBase } from "../types";

const TEXT_LIMIT = 180;

export type NormalizedPayload = {
  bases: CampaignBase[];
  issues: string[];
};

/**
 * Maps a Working Set JSON payload into campaign bases.
 * Accepted shape is documented in the README.
 * Unknown fields are dropped. Transcript bodies are never read.
 */
export function normalizeWorkingSetPayload(payload: unknown): NormalizedPayload {
  const records = readRecords(payload);
  if (!records.ok) {
    return { bases: [], issues: [records.issue] };
  }

  const issues: string[] = [];
  const seen = new Map<string, number>();
  const bases: CampaignBase[] = [];

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

    const label = bound(readString(record.label));
    const threadName = bound(
      readString(record.thread_name) ?? readString(record.threadName),
    );
    const rawId = bound(readString(record.id)) ?? fallbackId(repo, label, threadName);
    const id = uniqueId(rawId, seen);

    bases.push({
      id,
      repo: bound(repo) ?? repo,
      label,
      threadName,
      harness: bound(readHarness(record)) ?? "unknown",
      model: bound(readModel(record)) ?? "unknown",
      updatedAt: readUpdatedAt(record),
      place: readPlace(record),
    });
  });

  return { bases, issues };
}

function readRecords(
  payload: unknown,
): { ok: true; value: unknown[] } | { ok: false; issue: string } {
  if (Array.isArray(payload)) return { ok: true, value: payload };
  if (!payload || typeof payload !== "object") {
    return { ok: false, issue: "Payload was not a JSON object or array." };
  }
  const record = payload as Record<string, unknown>;
  for (const key of ["bases", "items", "records"] as const) {
    const value = record[key];
    if (Array.isArray(value)) return { ok: true, value };
  }
  return { ok: false, issue: "Payload had no bases, items, or records array." };
}

function readRepo(record: Record<string, unknown>): string | null {
  for (const key of ["repo", "repository", "project"] as const) {
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
  const value = readString(record.harness) ?? readString(record.surface);
  return value ? value.toLowerCase() : "unknown";
}

function readModel(record: Record<string, unknown>): string {
  const value = readString(record.model);
  if (!value || value.toLowerCase() === "unknown") return "unknown";
  return value;
}

function readUpdatedAt(record: Record<string, unknown>): string {
  return (
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

function fallbackId(
  repo: string,
  label: string | null,
  threadName: string | null,
): string {
  return [repo, label ?? "", threadName ?? ""].join("::").toLowerCase();
}

function uniqueId(id: string, seen: Map<string, number>): string {
  const count = seen.get(id) ?? 0;
  seen.set(id, count + 1);
  return count === 0 ? id : `${id}-${count + 1}`;
}
