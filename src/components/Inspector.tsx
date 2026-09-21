import type { FormEvent } from "react";
import { factionName } from "../factions";
import { formatAbsolute, formatLastTouched, harnessSlug } from "../format";
import type { CampaignBase, Unit } from "../types";
import { UnitMark } from "./UnitMark";

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

  return (
    <aside className="inspector" aria-label="Unit">
      <div className="inspector-body">
        <p className="kicker">
          {unit ? `${factionName(unit.harness)} unit` : base ? "Base" : "Nothing selected"}
        </p>
        <h2>{unit ? unit.model : base ? base.repo : "Select a unit"}</h2>
        {unit && base ? (
          <dl className="facts">
            <Fact label="Harness" value={factionName(unit.harness)} />
            <Fact label="Model" value={unit.model} />
            <Fact label="Thread" value={unit.threadName ?? "—"} />
            <Fact label="Status" value={unit.status ?? "—"} />
            <Fact label="Base" value={base.repo} />
            <Fact label="Last touched" value={formatLastTouched(unit.updatedAt, now)} detail={absolute} />
          </dl>
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
                  aria-pressed={entry.id === unit?.id}
                  onClick={() => onSelectUnit(base.id, entry.id)}
                >
                  <UnitMark model={entry.model} />
                  <span>
                    <strong>{entry.model}</strong>
                    <span className="roster-meta">
                      {factionName(entry.harness)}
                      {entry.status ? ` · ${entry.status}` : ""}
                    </span>
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
            type="url"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            placeholder="https://…/bases.json"
            value={urlDraft}
            onChange={(event) => onUrlDraft(event.target.value)}
          />
          <p className="help">
            GET a JSON document matching the README contract. An unauthenticated request only.
            If it fails, the map stays on the sample fixture.
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
