import sampleBases from "../data/sample-bases.json";
import type { MapSnapshot } from "../types";
import { normalizeWorkingSetPayload } from "./normalize";

export type ResolveResult = {
  snapshot: MapSnapshot;
  fallbackReason: string | null;
};

export function loadFixture(now = new Date()): MapSnapshot {
  const normalized = normalizeWorkingSetPayload(sampleBases);
  const notice = normalized.issues.length > 0 ? normalized.issues.join(" ") : null;
  return {
    source: "fixture",
    fetchedAt: now.toISOString(),
    bases: normalized.bases,
    notice,
  };
}

export async function loadWorkingSet(
  url: string,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<MapSnapshot> {
  const parsed = parseWorkingSetUrl(url);
  const response = await fetchImpl(parsed.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    referrerPolicy: "no-referrer",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`Working Set responded ${response.status}.`);
  }
  const text = await response.text();
  if (text.length > 1_000_000) {
    throw new Error("Working Set response is too large.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Working Set response was not JSON.");
  }
  const normalized = normalizeWorkingSetPayload(body);
  if (normalized.bases.length === 0) {
    throw new Error(normalized.issues[0] ?? "Working Set payload had no bases.");
  }
  return {
    source: "working-set",
    fetchedAt: now.toISOString(),
    bases: normalized.bases,
    notice: normalized.issues.length > 0 ? normalized.issues.join(" ") : null,
  };
}

export async function resolveSnapshot(
  url: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<ResolveResult> {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) {
    return { snapshot: loadFixture(now), fallbackReason: null };
  }
  try {
    const snapshot = await loadWorkingSet(trimmed, fetchImpl, now);
    return { snapshot, fallbackReason: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Working Set request failed.";
    return {
      snapshot: loadFixture(now),
      fallbackReason: `${reason} Showing the local fixture.`,
    };
  }
}

export function parseWorkingSetUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Working Set URL is not a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Working Set URL must be http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Working Set URL must not include credentials.");
  }
  return parsed;
}
