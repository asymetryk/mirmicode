export const FACTION_ORDER = ["cursor", "codex", "ohmypi"] as const;

/**
 * Painted faction id.
 * `omp`, `oh-my-pi`, and `OhMyPi` fold onto `ohmypi` so sprites stay on that body.
 * The display name is always OhMyPi; callers must not show the raw `omp` token.
 */
export function canonicalHarness(value: string): string {
  const compact = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (compact === "cursor") return "cursor";
  if (compact === "codex") return "codex";
  if (compact === "ohmypi" || compact === "omp") return "ohmypi";
  if (compact === "opencode") return "opencode";
  if (compact === "unknown") return "unknown";
  return value.trim().toLowerCase();
}

export const UNIT_TYPES = [
  "Astra",
  "Luna",
  "Terra",
  "Sol",
  "Grok-4.6",
  "Gemini",
  "MiniMax",
  "Kimi",
] as const;

export type UnitKind =
  | "astra"
  | "luna"
  | "terra"
  | "sol"
  | "grok"
  | "gemini"
  | "minimax"
  | "kimi"
  | "other";

export function factionName(harness: string): string {
  switch (canonicalHarness(harness)) {
    case "cursor":
      return "Cursor";
    case "codex":
      return "Codex";
    case "ohmypi":
      return "OhMyPi";
    case "opencode":
      return "OpenCode";
    case "unknown":
      return "Unknown";
    default:
      return harness.trim() || harness;
  }
}

export type Posture = "idle" | "working" | "blocked";

const TRIAGE_STATUS = new Set(["open", "done"]);

/**
 * Glow follows a posture word on status, such as working or blocked.
 * annotation.status open and done are operator triage, so they do not replace lifecycle.
 */
export function postureSignal(status: string | null, lifecycle: string | null): string | null {
  const statusText = status?.trim() ?? "";
  if (statusText && !TRIAGE_STATUS.has(statusText.toLowerCase())) return statusText;
  const life = lifecycle?.trim() ?? "";
  if (life) return life;
  return statusText || null;
}

export function postureOf(status: string | null): Posture {
  const key = (status ?? "").toLowerCase();
  if (key === "working" || key === "active" || key === "busy") return "working";
  if (key === "blocked" || key === "queued" || key === "stuck" || key === "error") return "blocked";
  return "idle";
}

export function postureLabel(posture: Posture): string {
  if (posture === "working") return "Working";
  if (posture === "blocked") return "Blocked";
  return "Idle";
}

export function unitKind(model: string): UnitKind {
  const key = model.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (key.includes("grok")) return "grok";
  if (key.includes("gemini")) return "gemini";
  if (key.includes("minimax")) return "minimax";
  if (key.includes("kimi")) return "kimi";
  if (key === "astra") return "astra";
  if (key === "luna") return "luna";
  if (key === "terra") return "terra";
  if (key === "sol") return "sol";
  return "other";
}

export function legendFactions(harnesses: string[]): string[] {
  const extras: string[] = [];
  const known = new Set<string>(FACTION_ORDER);
  for (const harness of harnesses) {
    const key = canonicalHarness(harness);
    if (!key || known.has(key)) continue;
    known.add(key);
    extras.push(key);
  }
  return [...FACTION_ORDER, ...extras];
}

export function legendModels(models: string[]): string[] {
  const known = new Set(UNIT_TYPES.map((model) => model.toLowerCase()));
  const extras: string[] = [];
  for (const model of models) {
    const key = model.toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    extras.push(model);
  }
  return [...UNIT_TYPES, ...extras];
}
