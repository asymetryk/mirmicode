import { FACTION_ORDER, factionName, legendFactions } from "../factions";
import { harnessSlug } from "../format";
import {
  BUILDING_KINDS,
  RESOURCE_KINDS,
  UNIT_ROLES,
  buildingLabel,
  buildingSrc,
  resourceLabel,
  resourceSrc,
  roleLabel,
  unitRole,
} from "../rtsArt";
import type { CampaignBase } from "../types";
import { Cutout } from "./Cutout";
import { UnitFigure } from "./UnitFigure";

type LegendProps = {
  bases: CampaignBase[];
  hideNoise: boolean;
  hiddenCount: number;
  onHideNoise: (value: boolean) => void;
};

export function Legend({
  bases,
  hideNoise,
  hiddenCount,
  onHideNoise,
}: LegendProps) {
  const harnesses = bases.flatMap((base) => base.units.map((unit) => unit.harness));
  const factions = legendFactions(harnesses);
  const extras = extraTypes(bases);

  return (
    <aside className="legend" aria-label="Legend">
      <div className="legend-row">
        <span className="legend-kicker">Factions</span>
        {factions.map((harness) => (
          <span key={harness} className="legend-faction" data-faction={harnessSlug(harness)}>
            <UnitFigure harness={harness} model="Scout" status="idle" />
            <span>{factionName(harness)}</span>
          </span>
        ))}
      </div>
      <div className="legend-row">
        <span className="legend-kicker">Types</span>
        {UNIT_ROLES.map((role, index) => {
          const harness = FACTION_ORDER[index % FACTION_ORDER.length] ?? "cursor";
          return (
            <span key={role} className="legend-type" data-faction={harness}>
              <UnitFigure harness={harness} model={role} status="idle" />
              <span>{roleLabel(role)}</span>
            </span>
          );
        })}
      </div>
      <div className="legend-row">
        <span className="legend-kicker">Field</span>
        {BUILDING_KINDS.map((kind, index) => {
          const harness = FACTION_ORDER[index % FACTION_ORDER.length] ?? "cursor";
          const src = buildingSrc(harness, kind);
          if (!src) return null;
          return <Thumb key={kind} src={src} label={buildingLabel(kind)} />;
        })}
        {RESOURCE_KINDS.map((kind, index) => {
          const harness = FACTION_ORDER[index % FACTION_ORDER.length] ?? "cursor";
          return <Thumb key={kind} src={resourceSrc(harness, kind)} label={resourceLabel(kind)} />;
        })}
      </div>
      <div className="legend-row noise-filters">
        <span className="legend-kicker">Noise</span>
        <label>
          <input
            type="checkbox"
            checked={hideNoise}
            onChange={(event) => onHideNoise(event.target.checked)}
          />
          Hide not seen, archived, detached, and repo-less Cursor unknowns
        </label>
        <span className="noise-count">{hiddenCount === 0 ? "Nothing hidden" : `${hiddenCount} hidden`}</span>
      </div>
      {extras.length > 0 ? (
        <div className="legend-row">
          <span className="legend-kicker">Other</span>
          {extras.map((entry) => (
            <span
              key={`${entry.harness}:${entry.model}`}
              className="legend-type"
              data-faction={harnessSlug(entry.harness)}
            >
              <UnitFigure harness={entry.harness} model={entry.model} status="idle" />
              <span>{entry.model}</span>
            </span>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function Thumb({ src, label }: { src: string; label: string }) {
  return (
    <span className="legend-type">
      <span className="legend-thumb">
        <Cutout src={src} />
      </span>
      <span>{label}</span>
    </span>
  );
}

function extraTypes(bases: CampaignBase[]): Array<{ harness: string; model: string }> {
  const extras: Array<{ harness: string; model: string }> = [];
  const seen = new Set<string>();
  for (const base of bases) {
    for (const unit of base.units) {
      if (unitRole(unit.model)) continue;
      const key = `${unit.harness.toLowerCase()}:${unit.model.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      extras.push({ harness: unit.harness, model: unit.model });
    }
  }
  return extras;
}
