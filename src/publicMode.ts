/**
 * Public / read-only BIP mode.
 *
 * When on, agent prompts stay off the map UI (popover, tooltips, roster).
 * Private/tailnet builds leave this off so lastUserPrompt still shows.
 *
 * Precedence: runtime `window.__MIRMICODE__` (pod env) overrides bake-time
 * `VITE_PUBLIC_MODE` / `VITE_PUBLIC_FULL_LIVE`. An explicit full-live override
 * keeps prompts even when public mode is on.
 */

export type MirmicodeRuntimeConfig = {
  publicMode?: boolean | string | null;
  fullLive?: boolean | string | null;
};

declare global {
  interface Window {
    __MIRMICODE__?: MirmicodeRuntimeConfig;
  }
}

type TestOverride = {
  publicMode?: boolean;
  fullLive?: boolean;
};

let testOverride: TestOverride | null = null;

/** Vitest only. Pass null to clear. */
export function setPublicModeForTests(value: TestOverride | null): void {
  testOverride = value;
}

export function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function runtimeConfig(): MirmicodeRuntimeConfig | null {
  if (typeof window === "undefined") return null;
  const config = window.__MIRMICODE__;
  return config && typeof config === "object" ? config : null;
}

/** True when this build/deploy is the public BIP surface. */
export function isPublicMode(): boolean {
  if (testOverride?.publicMode != null) return testOverride.publicMode;
  const runtime = runtimeConfig();
  if (runtime && "publicMode" in runtime && runtime.publicMode != null) {
    return isTruthyFlag(runtime.publicMode);
  }
  return isTruthyFlag(import.meta.env.VITE_PUBLIC_MODE);
}

/** Explicit escape hatch: show prompts even on a public build. */
export function isFullLiveOverride(): boolean {
  if (testOverride?.fullLive != null) return testOverride.fullLive;
  const runtime = runtimeConfig();
  if (runtime && "fullLive" in runtime && runtime.fullLive != null) {
    return isTruthyFlag(runtime.fullLive);
  }
  return isTruthyFlag(import.meta.env.VITE_PUBLIC_FULL_LIVE);
}

/**
 * Scrub lastUserPrompt / prompt aliases / annotation.note from public UI.
 * Private mode and full-live override leave prompts alone.
 */
export function shouldScrubPrompts(): boolean {
  return isPublicMode() && !isFullLiveOverride();
}

/**
 * Best-effort redaction of absolute local paths and jsonl transcript paths.
 * Only used when public scrubbing is on; never invents content.
 */
export function scrubSensitivePath(value: string | null): string | null {
  if (value === null || !shouldScrubPrompts()) return value;
  if (
    /(?:^|[\s"'])(?:~\/|\/(?:Users|home|private|var\/folders)\/|[A-Za-z]:\\)/.test(value) ||
    /\.jsonl\b/i.test(value)
  ) {
    return "[path redacted]";
  }
  return value;
}
