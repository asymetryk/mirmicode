import type { Unit } from "./types";

/** Shared honest context; preserve full text for native title tooltips. */
export function unitContext(unit: Unit, truncate = false): string | null {
  const text = unit.lastPrompt ?? unit.label ?? unit.threadName;
  if (!text) return null;
  const prefix = unit.lastPrompt ? "Last prompt" : "Thread";
  const oneLine = text.replace(/\s+/g, " ");
  const value = truncate && oneLine.length > 140 ? `${oneLine.slice(0, 139)}…` : oneLine;
  return `${prefix}: ${value}`;
}

export function formatLastTouched(iso: string, now = Date.now()): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return iso || "unknown";
  const minutes = Math.round((now - timestamp) / 60_000);
  const abs = Math.abs(minutes);
  const suffix = minutes >= 0 ? "ago" : "ahead";
  if (abs < 1) return "just now";
  if (abs < 60) return `${abs}m ${suffix}`;
  const hours = Math.round(abs / 60);
  if (hours < 36) return `${hours}h ${suffix}`;
  const days = Math.round(hours / 24);
  if (days < 21) return `${days}d ${suffix}`;
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function formatAbsolute(iso: string): string | null {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return null;
  return `${new Date(timestamp).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export function harnessSlug(harness: string): string {
  const key = harness.toLowerCase();
  if (key === "cursor" || key === "codex" || key === "ohmypi" || key === "opencode") {
    return key;
  }
  return "other";
}
