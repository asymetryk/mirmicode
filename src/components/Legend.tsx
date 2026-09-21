import { factionName, legendFactions, legendModels } from "../factions";
import { harnessSlug } from "../format";
import type { CampaignBase } from "../types";
import { UnitMark } from "./UnitMark";

export function Legend({ bases }: { bases: CampaignBase[] }) {
  const harnesses = bases.flatMap((base) => base.units.map((unit) => unit.harness));
  const models = bases.flatMap((base) => base.units.map((unit) => unit.model));
  const factions = legendFactions(harnesses);
  const types = legendModels(models);

  return (
    <aside className="legend" aria-label="Legend">
      <div className="legend-row">
        <span className="legend-kicker">Factions</span>
        {factions.map((harness) => (
          <span key={harness} className="legend-faction">
            <i data-faction={harnessSlug(harness)} />
            <span>{factionName(harness)}</span>
          </span>
        ))}
      </div>
      <div className="legend-row">
        <span className="legend-kicker">Unit types</span>
        {types.map((model) => (
          <span key={model} className="legend-type">
            <UnitMark model={model} />
            <span>{model}</span>
          </span>
        ))}
      </div>
    </aside>
  );
}
