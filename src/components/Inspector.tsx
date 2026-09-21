import type { FormEvent } from "react";
import { formatAbsolute, formatLastTouched } from "../format";
import type { CampaignBase } from "../types";

type InspectorProps = {
  base: CampaignBase | null;
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
};

export function Inspector({
  base,
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
}: InspectorProps) {
  const absolute = base ? formatAbsolute(base.updatedAt) : null;

  return (
    <aside className="inspector" aria-label="Selected base">
      <div className="inspector-body">
        <p className="kicker">{base ? "Selected" : "Nothing selected"}</p>
        <h2>{base ? base.repo : "Select a base"}</h2>
        {base ? (
          <dl className="facts">
            <Fact label="Last touched" value={formatLastTouched(base.updatedAt, now)} detail={absolute} />
            <Fact label="Harness" value={base.harness} />
            <Fact label="Model" value={base.model} />
            <Fact label="Thread" value={base.threadName ?? "—"} />
            <Fact label="Label" value={base.label ?? "—"} />
          </dl>
        ) : (
          <p className="lede">
            Select a base to read when it was last touched, which harness was on it, which model,
            and the thread name or human label.
          </p>
        )}
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
