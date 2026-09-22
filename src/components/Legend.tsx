import type { FormEvent } from "react";
import { CAHQ_WORKING_SET_ORIGIN, SAME_ORIGIN_WORKING_SET_PATH } from "../adapters/source";
import { FACTION_ORDER, canonicalHarness, factionName, legendFactions } from "../factions";
import { formatAbsolute, harnessSlug } from "../format";
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
  hideDetached: boolean;
  hideArchived: boolean;
  hiddenCount: number;
  onHideNoise: (value: boolean) => void;
  onHideDetached: (value: boolean) => void;
  onHideArchived: (value: boolean) => void;
  fetchedAt: string | null;
  sourceLabel: string;
  urlDraft: string;
  loading: boolean;
  onUrlDraft: (value: string) => void;
  onLoadUrl: (event: FormEvent<HTMLFormElement>) => void;
  onUseFixture: () => void;
};

export function Legend({
  bases,
  hideNoise,
  hideDetached,
  hideArchived,
  hiddenCount,
  onHideNoise,
  onHideDetached,
  onHideArchived,
  fetchedAt,
  sourceLabel,
  urlDraft,
  loading,
  onUrlDraft,
  onLoadUrl,
  onUseFixture,
}: LegendProps) {
  const harnesses = bases.flatMap((base) => base.units.map((unit) => unit.harness));
  const factions = legendFactions(harnesses);
  const extras = extraTypes(bases);

  return (
    <aside className="legend legend-rail" aria-label="Legend">
      <div className="legend-block">
        <span className="legend-kicker">Factions</span>
        <div className="legend-stack">
          {factions.map((harness) => (
            <span key={harness} className="legend-faction" data-faction={harnessSlug(harness)}>
              <UnitFigure harness={harness} model={legendFactionModel(harness)} status="idle" />
              <span>{factionName(harness)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="legend-block">
        <span className="legend-kicker">Types</span>
        <div className="legend-stack">
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
      </div>
      <div className="legend-block">
        <span className="legend-kicker">Field</span>
        <div className="legend-stack">
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
      </div>
      <div className="legend-block noise-filters">
        <span className="legend-kicker">Noise</span>
        <label>
          <input
            type="checkbox"
            checked={hideNoise}
            onChange={(event) => onHideNoise(event.target.checked)}
          />
          Hide not seen and operator-hidden
        </label>
        <label>
          <input
            type="checkbox"
            checked={hideArchived}
            onChange={(event) => onHideArchived(event.target.checked)}
          />
          Hide archived
        </label>
        <label>
          <input
            type="checkbox"
            checked={hideDetached}
            onChange={(event) => onHideDetached(event.target.checked)}
          />
          Hide detached
        </label>
        <span className="noise-count">{hiddenCount === 0 ? "Nothing hidden" : `${hiddenCount} hidden`}</span>
      </div>
      {extras.length > 0 ? (
        <div className="legend-block">
          <span className="legend-kicker">Other</span>
          <div className="legend-stack">
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
        </div>
      ) : null}
      <details className="source-panel">
        <summary>Data source</summary>
        <p className="source-now">{sourceLabel}</p>
        <form onSubmit={onLoadUrl}>
          <label htmlFor="working-set-url">Working Set URL</label>
          <input
            id="working-set-url"
            type="text"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            placeholder={SAME_ORIGIN_WORKING_SET_PATH}
            value={urlDraft}
            onChange={(event) => onUrlDraft(event.target.value)}
          />
          <p className="help">
            Unauthenticated GET of Working Set JSON. The deployed map uses{" "}
            <code>{SAME_ORIGIN_WORKING_SET_PATH}</code> on this origin. Caddy proxies that path to{" "}
            {CAHQ_WORKING_SET_ORIGIN}. If the request fails or the document has no bases, the map
            stays on the sample fixture and the banner names the reason.
          </p>
          <div className="actions">
            <button type="submit" disabled={loading || urlDraft.trim() === ""}>
              {loading ? "Loading…" : "Load"}
            </button>
            <button type="button" onClick={onUseFixture} disabled={loading}>
              Use fixture
            </button>
          </div>
        </form>
        {fetchedAt ? <p className="fetched">Snapshot {formatAbsolute(fetchedAt)}</p> : null}
      </details>
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

/** Grok Bot has no painted scout. The legend shows the walker, the Grok silhouette. */
function legendFactionModel(harness: string): string {
  return canonicalHarness(harness) === "grokbot" ? "Walker" : "Scout";
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
