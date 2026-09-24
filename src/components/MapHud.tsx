import type { CampaignBase, Unit } from "../types";

type MapHudProps = {
  bases: CampaignBase[];
  sourceLabel: string;
  observedAt: string | null;
  now: number;
};

type Signal = "working" | "completed" | "attention" | "unknown";

export function MapHud({ bases, sourceLabel, observedAt, now }: MapHudProps) {
  const counts: Record<Signal, number> = { working: 0, completed: 0, attention: 0, unknown: 0 };
  for (const base of bases) {
    for (const unit of base.units) counts[signalFor(unit, now)] += 1;
  }

  return (
    <section className="map-hud" aria-label="Agent activity summary">
      <div className="hud-signals">
        <HudSignal label="Working" count={counts.working} signal="working" />
        <HudSignal label="Done · 24h" count={counts.completed} signal="completed" />
        <HudSignal label="Needs attention" count={counts.attention} signal="attention" />
        <HudSignal label="Unknown" count={counts.unknown} signal="unknown" />
      </div>
      <div className="hud-observation">
        <span>{sourceLabel}</span>
        <span>{observedAt ? `Observed ${relativeTime(observedAt, now)}` : "Waiting for snapshot"}</span>
      </div>
    </section>
  );
}

function HudSignal({ label, count, signal }: { label: string; count: number; signal: Signal }) {
  return (
    <div className="hud-signal" data-signal={signal}>
      <span className="hud-signal-mark" aria-hidden="true" />
      <span className="hud-signal-label">{label}</span>
      <strong>{count}</strong>
    </div>
  );
}

function signalFor(unit: Unit, now: number): Signal {
  const values = [unit.status, unit.lifecycle].map((value) => (value ?? "").trim().toLowerCase());
  if (values.some((value) => ["blocked", "stuck", "error", "needs attention", "attention"].includes(value))) {
    return "attention";
  }
  if (values.some((value) => ["working", "active", "busy"].includes(value))) return "working";
  if (values.some((value) => ["done", "complete", "completed"].includes(value))) {
    const updated = Date.parse(unit.updatedAt);
    return Number.isFinite(updated) && updated <= now && now - updated <= 24 * 60 * 60 * 1000
      ? "completed"
      : "unknown";
  }
  return "unknown";
}

function relativeTime(value: string, now: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "time unknown";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
