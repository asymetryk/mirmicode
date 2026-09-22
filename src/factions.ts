export const FACTION_ORDER = ["cursor", "codex", "ohmypi"] as const;

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
  switch (harness.toLowerCase()) {
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
      return harness;
  }
}

export type Posture = "idle" | "working" | "blocked";

/**
 * Glow and the blocked slash follow annotation/flat status when that field is set.
 * Lifecycle is used only when status is missing, so a live item still has a posture.
 */
export function postureSignal(status: string | null, lifecycle: string | null): string | null {
  if (status && status.trim()) return status;
  if (lifecycle && lifecycle.trim()) return lifecycle;
  return null;
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
    const key = harness.toLowerCase();
    if (known.has(key)) continue;
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
