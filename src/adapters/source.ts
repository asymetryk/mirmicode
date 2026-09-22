import sampleBases from "../data/sample-bases.json";
import type { MapSnapshot } from "../types";
import { normalizeWorkingSetPayload } from "./normalize";

/**
 * CAHQ Working Set adapter.
 *
 * Live bases and units are an unauthenticated GET of a JSON document:
 * `VITE_WORKING_SET_URL` at startup, or a URL pasted in the data-source panel.
 * The tailnet host below is the intended target. This module never fabricates
 * a live snapshot. DNS, HTTP, JSON, and empty-payload failures return the
 * committed sample fixture plus a fallback reason.
 */
export const CAHQ_WORKING_SET_ORIGIN = "https://cahq.tail21f530.ts.net";

export const WORKING_SET_URL_KEY = "mirmicode.workingSetUrl";
export const WORKING_SET_SOURCE_KEY = "mirmicode.dataSource";


/** Only adapter-owned diagnostics may be displayed; fetch errors can contain secrets. */
class WorkingSetError extends Error {}
export type ResolveResult = {
  snapshot: MapSnapshot;
  fallbackReason: string | null;
};

/**
 * Startup URL precedence: a saved “use fixture” choice, then a URL saved in
 * this browser, then `VITE_WORKING_SET_URL`, then empty (fixture, no fetch).
 */
export function readStartupWorkingSetUrl(
  envUrl: string | null | undefined,
  storage: Pick<Storage, "getItem"> | null,
): string {
  const fromEnv = envUrl?.trim() ?? "";
  if (!storage) return fromEnv;
  try {
    if (storage.getItem(WORKING_SET_SOURCE_KEY) === "fixture") return "";
    const stored = storage.getItem(WORKING_SET_URL_KEY)?.trim() ?? "";
    return stored || fromEnv;
  } catch {
    return fromEnv;
  }
}

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
    cache: "no-store",
  });
  if (!response.ok) {
    throw new WorkingSetError(`Working Set responded ${response.status}.`);
  }
  const text = await response.text();
  if (text.length > 1_000_000) {
    throw new WorkingSetError("Working Set response is too large.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new WorkingSetError("Working Set response was not JSON.");
  }
  const normalized = normalizeWorkingSetPayload(body);
  if (normalized.bases.length === 0) {
    throw new WorkingSetError(normalized.issues[0] ?? "Working Set payload had no bases.");
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
    return {
      snapshot: loadFixture(now),
      fallbackReason: fallbackReasonFor(error, trimmed),
    };
  }
}

function fallbackReasonFor(error: unknown, url: string): string {
  const detail = readableReason(error).replace(/\.+$/, "");
  const host = hostnameOf(url);
  const where = host ? ` at ${host}` : "";
  return `Fixture fallback. ${detail}${where}.`;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function readableReason(error: unknown): string {
  if (error instanceof WorkingSetError) return error.message;
  return "Working Set could not be reached (network, DNS, TLS, or CORS failure).";
}

export function parseWorkingSetUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WorkingSetError("Working Set URL is not a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WorkingSetError("Working Set URL must be http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new WorkingSetError("Working Set URL must not include credentials.");
  }
  if (parsed.pathname === "/" && !parsed.search) {
    parsed.pathname = "/api/v1/working-set";
  }
  parsed.hash = "";
  return parsed;
}
