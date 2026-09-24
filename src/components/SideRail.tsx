import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { canonicalHarness, factionName, legendFactions, postureSignal } from "../factions";
import { harnessSlug, unitContext } from "../format";
import { isUnassignedRepo, unitEmphasis, type Emphasis } from "../mapNoise";
import type { CampaignBase, Unit } from "../types";
import { Legend } from "./Legend";
import { OpenProjectBlock } from "./OpenProjectBlock";
import { UnitFigure } from "./UnitFigure";

type SideRailProps = {
  inspector?: ReactNode;
  bases: CampaignBase[];
  selectedBaseId: string | null;
  selectedUnitId: string | null;
  hideNoise: boolean;
  hideDetached: boolean;
  hideArchived: boolean;
  hiddenCount: number;
  fetchedAt: string | null;
  sourceLabel: string;
  urlDraft: string;
  loading: boolean;
  onHideNoise: (value: boolean) => void;
  onHideDetached: (value: boolean) => void;
  onHideArchived: (value: boolean) => void;
  onCollapse: () => void;
  onSelectBase: (id: string) => void;
  onSelectUnit: (baseId: string, unitId: string) => void;
  onUrlDraft: (value: string) => void;
  onLoadUrl: (event: FormEvent<HTMLFormElement>) => void;
  onUseFixture: () => void;
};

export function SideRail({
  inspector,
  bases,
  selectedBaseId,
  selectedUnitId,
  hideNoise,
  hideDetached,
  hideArchived,
  hiddenCount,
  fetchedAt,
  sourceLabel,
  urlDraft,
  loading,
  onHideNoise,
  onHideDetached,
  onHideArchived,
  onCollapse,
  onSelectBase,
  onSelectUnit,
  onUrlDraft,
  onLoadUrl,
  onUseFixture,
}: SideRailProps) {
  const groups = factionGroups(bases);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedBaseId) scrollRef.current?.scrollTo({ top: 0 });
  }, [selectedBaseId, selectedUnitId]);

  return (
    <aside className="side-rail" aria-label="Forces">
      <div className="rail-head">
        <h2>Forces</h2>
        <button type="button" className="rail-toggle" aria-expanded={true} onClick={onCollapse}>
          Hide
        </button>
      </div>
      <div className="rail-scroll" ref={scrollRef}>
        {inspector ? <div className="rail-inspector">{inspector}</div> : null}
        <section className="rail-section" aria-label="Camps">
          <h3>Camps</h3>
          <ul className="camp-list">
            {bases.map((base) => {
              const unassigned = isUnassignedRepo(base.repo);
              const empty = base.units.length === 0;
              const selected = base.id === selectedBaseId && selectedUnitId === null;
              const name = unassigned ? "Unassigned" : base.repo;
              return (
                <li key={base.id}>
                  <button
                    type="button"
                    className={selected ? "camp-row is-selected" : "camp-row"}
                    aria-pressed={selected}
                    onClick={() => onSelectBase(base.id)}
                  >
                    <span className="camp-name">{name}</span>
                    <span className="camp-meta">{empty ? "No army" : `${base.units.length} units`}</span>
                  </button>
                  <OpenProjectBlock project={base.openProject} compact />
                </li>
              );
            })}
          </ul>
        </section>
        <section className="rail-section" aria-label="Factions">
          <h3>Factions</h3>
          {groups.length === 0 ? <p className="lede">No units in this view.</p> : null}
          {groups.map((group) => (
            <details key={group.harness} className="faction-group" open>
              <summary data-faction={harnessSlug(group.harness)}>
                <span>{factionName(group.harness)}</span>
                <span className="faction-count">{group.units.length}</span>
              </summary>
              <ul className="roster">
                {group.units.map((entry) => (
                  <li key={entry.unit.id}>
                    <button
                      type="button"
                      className={entry.unit.id === selectedUnitId ? "roster-unit is-selected" : "roster-unit"}
                      data-faction={harnessSlug(entry.unit.harness)}
                      data-emphasis={entry.emphasis}
                      aria-pressed={entry.unit.id === selectedUnitId}
                      title={unitContext(entry.unit) ?? undefined}
                      onClick={() => onSelectUnit(entry.baseId, entry.unit.id)}
                    >
                      <UnitFigure
                        harness={entry.unit.harness}
                        model={entry.unit.model}
                        status={postureSignal(entry.unit.status, entry.unit.lifecycle)}
                        appearanceRole={entry.unit.appearance?.unitRole}
                        accentColor={entry.unit.appearance?.color}
                      />
                      <span>
                        <strong>{entry.unit.model}</strong>
                        <span className="roster-meta">
                          {entry.repo}
                          {entry.unit.lifecycle ? ` · ${entry.unit.lifecycle}` : ""}
                        </span>
                        {unitContext(entry.unit) ? (
                          <span className="roster-meta">{unitContext(entry.unit, true)}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
        <Legend
          bases={bases}
          hideNoise={hideNoise}
          hideDetached={hideDetached}
          hideArchived={hideArchived}
          hiddenCount={hiddenCount}
          onHideNoise={onHideNoise}
          onHideDetached={onHideDetached}
          onHideArchived={onHideArchived}
          fetchedAt={fetchedAt}
          sourceLabel={sourceLabel}
          urlDraft={urlDraft}
          loading={loading}
          onUrlDraft={onUrlDraft}
          onLoadUrl={onLoadUrl}
          onUseFixture={onUseFixture}
        />
      </div>
    </aside>
  );
}

type RailUnit = {
  baseId: string;
  repo: string;
  unit: Unit;
  emphasis: Emphasis;
};

function factionGroups(bases: CampaignBase[]): Array<{ harness: string; units: RailUnit[] }> {
  const rows: RailUnit[] = [];
  for (const base of bases) {
    const repo = isUnassignedRepo(base.repo) ? "Unassigned" : base.repo;
    for (const unit of base.units) {
      rows.push({
        baseId: base.id,
        repo,
        unit,
        emphasis: unitEmphasis(unit, base.repo),
      });
    }
  }
  const byHarness = new Map<string, RailUnit[]>();
  for (const row of rows) {
    const key = canonicalHarness(row.unit.harness);
    const list = byHarness.get(key) ?? [];
    list.push(row);
    byHarness.set(key, list);
  }
  return legendFactions(rows.map((row) => row.unit.harness))
    .filter((harness) => (byHarness.get(harness)?.length ?? 0) > 0)
    .map((harness) => ({
      harness,
      units: [...(byHarness.get(harness) ?? [])].sort(compareUnits),
    }));
}

function compareUnits(a: RailUnit, b: RailUnit): number {
  const rank = emphasisRank(a.emphasis) - emphasisRank(b.emphasis);
  if (rank !== 0) return rank;
  return a.unit.model.localeCompare(b.unit.model) || a.repo.localeCompare(b.repo);
}

function emphasisRank(emphasis: Emphasis): number {
  if (emphasis === "collector") return 2;
  if (emphasis === "dim") return 1;
  return 0;
}
