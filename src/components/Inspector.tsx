import type { FormEvent } from "react";
import { CAHQ_WORKING_SET_ORIGIN, SAME_ORIGIN_WORKING_SET_PATH } from "../adapters/source";
import { factionName, postureLabel, postureOf } from "../factions";
import { formatAbsolute, formatLastTouched, harnessSlug, unitContext } from "../format";
import { roleLabel, unitRole } from "../rtsArt";
import type { CampaignBase, Unit } from "../types";
import { UnitFigure } from "./UnitFigure";

type InspectorProps = {
  base: CampaignBase | null;
  unit: Unit | null;
  attached: boolean;
  now: number;
  fetchedAt: string | null;
  sourceLabel: string;
  urlDraft: string;
  loading: boolean;
  onUrlDraft: (value: string) => void;
  onLoadUrl: (event: FormEvent<HTMLFormElement>) => void;
  onUseFixture: () => void;
  onToggleAttach: () => void;
  onSelectUnit: (baseId: string, unitId: string) => void;
};

export function Inspector({
  base,
  unit,
  attached,
  now,
  fetchedAt,
  sourceLabel,
  urlDraft,
  loading,
  onUrlDraft,
  onLoadUrl,
  onUseFixture,
  onToggleAttach,
  onSelectUnit,
}: InspectorProps) {
  const touched = unit?.updatedAt ?? base?.updatedAt ?? null;
  const absolute = touched ? formatAbsolute(touched) : null;
  const role = unit ? unitRole(unit.model) : null;

  return (
    <aside className="inspector" aria-label="Unit">
      <div className="inspector-body">
        <p className="kicker">
          {unit ? `${factionName(unit.harness)} unit` : base ? "Base" : "Nothing selected"}
        </p>
        <h2>{unit ? unit.model : base ? base.repo : "Select a unit"}</h2>
        {unit && base ? (
          <>
            <div
              className="hud-figure"
              data-faction={harnessSlug(unit.harness)}
              data-posture={postureOf(unit.status)}
            >
              <UnitFigure
                harness={unit.harness}
                model={unit.model}
                status={unit.status}
                selected
                showMarker
              />
              <p>{postureLabel(postureOf(unit.status))}</p>
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
              <Fact label="Base" value={base.repo} />
              <Fact label="Last touched" value={formatLastTouched(unit.updatedAt, now)} detail={absolute} />
            </dl>
          </>
        ) : base ? (
          <dl className="facts">
            <Fact label="Repo" value={base.repo} />
            <Fact label="Label" value={base.label ?? "—"} />
            <Fact label="Last touched" value={formatLastTouched(base.updatedAt, now)} detail={absolute} />
            <Fact label="Units" value={String(base.units.length)} />
          </dl>
        ) : (
          <p className="lede">
            Select a unit on a base. A base is a repo. A faction is a harness. The model is the unit
            type.
          </p>
        )}
        {base && base.units.length > 0 ? (
          <ul className="roster">
            {base.units.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={entry.id === unit?.id ? "roster-unit is-selected" : "roster-unit"}
                  data-faction={harnessSlug(entry.harness)}
                  data-posture={postureOf(entry.status)}
                  aria-pressed={entry.id === unit?.id}
                  title={unitContext(entry) ?? undefined}
                  onClick={() => onSelectUnit(base.id, entry.id)}
                >
                  <UnitFigure harness={entry.harness} model={entry.model} status={entry.status} />
                  <span>
                    <strong>{entry.model}</strong>
                    <span className="roster-meta">
                      {factionName(entry.harness)}
                      {entry.status ? ` · ${entry.status}` : ""}
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
          <button type="button" onClick={onToggleAttach} disabled={!base || loading} aria-pressed={attached}>
            {attached ? "Detach view" : "Attach view"}
          </button>
        </div>
        {fetchedAt ? <p className="fetched">Snapshot {formatAbsolute(fetchedAt)}</p> : null}
      </div>
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
            <code>{SAME_ORIGIN_WORKING_SET_PATH}</code> on this origin. Caddy proxies that
            path to {CAHQ_WORKING_SET_ORIGIN}. If the request fails or the document has no
            bases, the map stays on the sample fixture and the banner names the reason.
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
      </details>
    </aside>
  );
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className={value === "unknown" || value === "—" ? "is-empty" : undefined}>{value}</span>
        {detail ? <span className="fact-detail">{detail}</span> : null}
      </dd>
    </div>
  );
}
