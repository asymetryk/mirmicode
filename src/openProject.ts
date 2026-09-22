import { repoKey } from "./repos";
import type { OpenProjectSummary } from "./types";

/** Shown when a base has no OpenProject association. Not a link. */
export const NO_OP_PROJECT = "no OP project linked";

/**
 * Read `associations.openproject` (object or list) from a Working Set record.
 * A repo name alone is not an association. Non-http URLs are dropped so the UI
 * cannot render a dead or scripted link.
 */
export function readOpenProjectAssociations(value: unknown): OpenProjectSummary[] {
  if (Array.isArray(value)) return value.flatMap((entry) => readOpenProjectAssociations(entry));
  const one = readOne(value);
  return one ? [one] : [];
}

/**
 * Prefer the project most units share. A tie keeps the first non-null association.
 */
export function aggregateOpenProject(projects: readonly OpenProjectSummary[]): OpenProjectSummary | null {
  let best: { count: number; first: number; project: OpenProjectSummary } | null = null;
  const counts = new Map<string, { count: number; first: number; project: OpenProjectSummary }>();
  projects.forEach((project, index) => {
    const key = projectKey(project);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    counts.set(key, { count: 1, first: index, project });
  });
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.first < best.first)) {
      best = entry;
    }
  }
  return best?.project ?? null;
}

/**
 * Repo → OpenProject map already on the payload. Used only when a base has no
 * per-item association. Does not call OpenProject.
 */
export function readRepoOpenProjectMap(payload: unknown): Map<string, OpenProjectSummary> {
  const map = new Map<string, OpenProjectSummary>();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return map;
  const record = payload as Record<string, unknown>;
  collectMap(record, map);
  const snapshot = record.snapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    collectMap(snapshot as Record<string, unknown>, map);
  }
  return map;
}

function collectMap(record: Record<string, unknown>, map: Map<string, OpenProjectSummary>): void {
  for (const key of ["openproject", "repo_openproject", "openproject_by_repo"] as const) {
    const value = record[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [repo, assoc] of Object.entries(value as Record<string, unknown>)) {
      const parsed = readOpenProjectAssociations(assoc)[0];
      if (!parsed) continue;
      const id = repoKey(repo);
      if (!id || map.has(id)) continue;
      map.set(id, parsed);
    }
  }
}

function readOne(value: unknown): OpenProjectSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const nested = record.project;
  const project =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : null;
  const href = httpUrl(
    firstString(
      record.href,
      record.url,
      record.html_url,
      record.htmlUrl,
      record.project_url,
      record.projectUrl,
      record.link,
      project?.href,
      project?.url,
      project?.html_url,
    ),
  );
  const name = bound(
    firstString(
      record.name,
      record.title,
      record.project_name,
      record.projectName,
      project?.name,
      project?.title,
      record.identifier,
      project?.identifier,
    ),
  );
  const status = bound(
    firstString(record.status, record.phase, record.project_status, project?.status, project?.phase),
  );
  const summary = bound(
    firstString(
      record.description,
      record.summary,
      record.next_update,
      record.status_explanation,
      project?.description,
      project?.summary,
      record.updated_at,
      record.updatedAt,
      project?.updated_at,
    ),
  );
  if (!href && !name && !status && !summary) return null;
  return { href, name, status, summary };
}

function projectKey(project: OpenProjectSummary): string {
  if (project.href) return `href:${project.href}`;
  if (project.name) return `name:${project.name.trim().toLowerCase()}`;
  return `text:${project.status ?? ""}:${project.summary ?? ""}`;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function bound(value: string | null): string | null {
  if (value === null) return null;
  if (value.length <= 180) return value;
  return `${value.slice(0, 179)}…`;
}

function httpUrl(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.toString();
}
