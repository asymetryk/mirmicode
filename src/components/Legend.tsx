import { FACTION_ORDER, factionName, legendFactions } from "../factions";
import { harnessSlug } from "../format";
import type { CampaignBase } from "../types";
import { UnitFigure } from "./UnitFigure";

const FACTION_SAMPLE: Record<string, string> = {
  cursor: "Grok-4.6",
  codex: "Luna",
  ohmypi: "MiniMax",
};

const FACTION_TYPES: Record<string, readonly string[]> = {
  cursor: ["Grok-4.6", "Gemini"],
  codex: ["Astra", "Luna", "Terra", "Sol"],
  ohmypi: ["Astra", "Sol", "MiniMax", "Kimi"],
};

export function Legend({ bases }: { bases: CampaignBase[] }) {
  const harnesses = bases.flatMap((base) => base.units.map((unit) => unit.harness));
  const factions = legendFactions(harnesses);
  const extras = extraTypes(bases);

  return (
    <aside className="legend" aria-label="Legend">
      <div className="legend-row">
        <span className="legend-kicker">Factions</span>
        {factions.map((harness) => (
          <span key={harness} className="legend-faction" data-faction={harnessSlug(harness)}>
            <UnitFigure
              harness={harness}
              model={FACTION_SAMPLE[harness] ?? "unknown"}
              status="idle"
            />
            <span>{factionName(harness)}</span>
          </span>
        ))}
      </div>
      {FACTION_ORDER.map((harness) => (
        <div key={harness} className="legend-row">
          <span className="legend-kicker">{factionName(harness)}</span>
          {(FACTION_TYPES[harness] ?? []).map((model) => (
            <span key={model} className="legend-type" data-faction={harness}>
              <UnitFigure harness={harness} model={model} status="idle" />
              <span>{model}</span>
            </span>
          ))}
        </div>
      ))}
      {extras.length > 0 ? (
        <div className="legend-row">
          <span className="legend-kicker">Other</span>
          {extras.map((entry) => (
            <span key={`${entry.harness}:${entry.model}`} className="legend-type" data-faction={harnessSlug(entry.harness)}>
              <UnitFigure harness={entry.harness} model={entry.model} status="idle" />
              <span>{entry.model}</span>
            </span>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function extraTypes(bases: CampaignBase[]): Array<{ harness: string; model: string }> {
  const known = new Set(
    FACTION_ORDER.flatMap((harness) =>
      (FACTION_TYPES[harness] ?? []).map((model) => `${harness}:${model.toLowerCase()}`),
    ),
  );
  const extras: Array<{ harness: string; model: string }> = [];
  const seen = new Set<string>();
  for (const base of bases) {
    for (const unit of base.units) {
      const key = `${unit.harness.toLowerCase()}:${unit.model.toLowerCase()}`;
      if (known.has(key) || seen.has(key)) continue;
      seen.add(key);
      extras.push({ harness: unit.harness, model: unit.model });
    }
  }
  return extras;
}
