import { factionName, postureLabel, postureOf, postureSignal } from "../factions";
import { formatAbsolute, formatLastTouched, harnessSlug, unitContext } from "../format";
import { isUnassignedRepo, unitEmphasis } from "../mapNoise";
import { roleLabel, unitRole } from "../rtsArt";
import type { CampaignBase, Unit } from "../types";
import { OpenProjectBlock } from "./OpenProjectBlock";
import { UnitFigure } from "./UnitFigure";

type UnitPopoverProps = {
  base: CampaignBase;
  unit: Unit | null;
  attached: boolean;
  now: number;
  fetchedAt: string | null;
  onToggleAttach: () => void;
  onClose: () => void;
  onSelectUnit: (baseId: string, unitId: string) => void;
};

export function UnitPopover({
  base,
  unit,
  attached,
  now,
  fetchedAt,
  onToggleAttach,
  onClose,
  onSelectUnit,
}: UnitPopoverProps) {
  const touched = unit?.updatedAt ?? base.updatedAt;
  const absolute = touched ? formatAbsolute(touched) : null;
  const role = unit ? unitRole(unit.model) : null;
  const unassigned = isUnassignedRepo(base.repo);
  const empty = base.units.length === 0;
  const posture = unit ? postureSignal(unit.status, unit.lifecycle) : null;
  const title = unit ? unit.model : unassigned ? `${base.units.length} units` : base.repo;

  return (
    <aside className="unit-popover" role="dialog" aria-label={unit ? "Unit" : "Base"}>
      <div className="popover-head">
        <p className="kicker">
          {unit ? `${factionName(unit.harness)} unit` : unassigned ? "Unassigned" : empty ? "Camp" : "Base"}
        </p>
        <button type="button" className="popover-close" onClick={onClose}>
          Close
        </button>
      </div>
      <h2>{title}</h2>
      <OpenProjectBlock project={base.openProject} />
      {unit ? (
        <>
          <div
            className="hud-figure"
            data-faction={harnessSlug(unit.harness)}
            data-posture={postureOf(posture)}
          >
            <UnitFigure
              harness={unit.harness}
              model={unit.model}
              status={posture}
              selected
              showMarker
            />
            <p>{postureLabel(postureOf(posture))}</p>
          </div>
          {unitContext(unit) ? (
            <p className="unit-context" title={unitContext(unit) ?? undefined}>
              {unitContext(unit, true)}
            </p>
          ) : null}
          <dl className="facts">
            <Fact label="Harness" value={factionName(unit.harness)} />
            <Fact label="Model" value={unit.model} />
            {role ? <Fact label="Type" value={roleLabel(role)} /> : null}
            <Fact label="Thread" value={unit.threadName ?? "—"} />
            <Fact label="Status" value={unit.status ?? "—"} />
            <Fact label="Lifecycle" value={unit.lifecycle ?? "—"} />
            <Fact label="Presence" value={unit.presence ?? "—"} />
            <Fact label="Freshness" value={unit.freshness ?? "—"} />
            <Fact label="Base" value={unassigned ? "Unassigned" : base.repo} />
            <Fact label="Last touched" value={formatLastTouched(unit.updatedAt, now)} detail={absolute} />
          </dl>
        </>
      ) : (
        <>
          {empty ? (
            <p className="lede">Camp with no army. This repo has no Working Set units on the map.</p>
          ) : unassigned ? (
            <p className="lede">
              These units have no repo. They stay in this list. The map shows one outpost and the count,
              not a token for each unit.
            </p>
          ) : null}
          <dl className="facts">
            <Fact label="Repo" value={unassigned ? "Unassigned" : base.repo} />
            <Fact label="Label" value={base.label ?? "—"} />
            <Fact label="Last touched" value={formatLastTouched(base.updatedAt, now)} detail={absolute} />
            <Fact label="Units" value={empty ? "0" : String(base.units.length)} />
          </dl>
        </>
      )}
      {base.units.length > 0 ? (
        <ul className="roster">
          {base.units.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={entry.id === unit?.id ? "roster-unit is-selected" : "roster-unit"}
                data-faction={harnessSlug(entry.harness)}
                data-emphasis={unitEmphasis(entry, base.repo)}
                data-posture={postureOf(postureSignal(entry.status, entry.lifecycle))}
                aria-pressed={entry.id === unit?.id}
                title={unitContext(entry) ?? undefined}
                onClick={() => onSelectUnit(base.id, entry.id)}
              >
                <UnitFigure
                  harness={entry.harness}
                  model={entry.model}
                  status={postureSignal(entry.status, entry.lifecycle)}
                />
                <span>
                  <strong>{entry.model}</strong>
                  <span className="roster-meta">
                    {factionName(entry.harness)}
                    {entry.status ? ` · ${entry.status}` : ""}
                    {entry.lifecycle ? ` · ${entry.lifecycle}` : ""}
                  </span>
                  {unitContext(entry) ? (
                    <span className="roster-meta" title={unitContext(entry) ?? undefined}>
                      {unitContext(entry, true)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="actions">
        <button type="button" onClick={onToggleAttach} aria-pressed={attached}>
          {attached ? "Detach view" : "Attach view"}
        </button>
      </div>
      {fetchedAt ? <p className="fetched">Snapshot {formatAbsolute(fetchedAt)}</p> : null}
    </aside>
  );
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div data-fact={label}>
      <dt>{label}</dt>
      <dd>
        <span className={value === "unknown" || value === "—" ? "is-empty" : undefined}>{value}</span>
        {detail ? <span className="fact-detail">{detail}</span> : null}
      </dd>
    </div>
  );
}
