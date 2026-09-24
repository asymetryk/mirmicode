import { factionName, postureLabel, postureSignal } from "../factions";
import { formatAbsolute, formatLastTouched, harnessSlug, popoverSnippet, unitContext } from "../format";
import { isUnassignedRepo, unitEmphasis } from "../mapNoise";
import { roleLabel, unitRole } from "../rtsArt";
import type { CampaignBase, Unit } from "../types";
import { OpenProjectBlock } from "./OpenProjectBlock";
import { SharedMapSettings } from "./SharedMapSettings";
import { UnitFigure, visualPosture } from "./UnitFigure";

type SelectionPopoverProps = {
  base: CampaignBase | null;
  unit: Unit | null;
  attached: boolean;
  now: number;
  metadataRevision: number | null;
  canEditMetadata: boolean;
  onRefreshSnapshot: () => void;
  onToggleAttach: () => void;
  onClose: () => void;
  onSelectUnit: (baseId: string, unitId: string) => void;
};

export function SelectionPopover({
  base,
  unit,
  attached,
  now,
  metadataRevision,
  canEditMetadata,
  onRefreshSnapshot,
  onToggleAttach,
  onClose,
  onSelectUnit,
}: SelectionPopoverProps) {
  if (!base) return null;

  const touched = unit?.updatedAt ?? base.updatedAt;
  const absolute = touched ? formatAbsolute(touched) : null;
  const role = unit ? unit.appearance?.unitRole ?? unitRole(unit.model) : null;
  const unassigned = isUnassignedRepo(base.repo);
  const empty = base.units.length === 0;
  const posture = unit ? postureSignal(unit.status, unit.lifecycle) : null;
  const visualState = unit ? visualPosture(posture) : "unknown";
  const snippet = unit ? popoverSnippet(unit) : null;

  return (
    <div className="selection-popover" role="dialog" aria-label="Selection">
      <div className="selection-popover-head">
        <p className="kicker">
          {unit
            ? `${factionName(unit.harness)} unit`
            : unassigned
              ? "Unassigned"
              : empty
                ? "Camp"
                : "Base"}
        </p>
        <button type="button" className="popover-close" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>
      <h2>
        {unit ? unit.model : unassigned ? `${base.units.length} units` : base.repo}
      </h2>
      <OpenProjectBlock project={base.openProject} />
      {unit ? (
        <>
          {snippet ? (
            <p className="snippet-hero" title={snippet}>
              {snippet}
            </p>
          ) : null}
          <div
            className="hud-figure"
            data-faction={harnessSlug(unit.harness)}
            data-posture={visualState}
          >
            <UnitFigure
              harness={unit.harness}
              model={unit.model}
              status={posture}
              appearanceRole={unit.appearance?.unitRole}
              accentColor={unit.appearance?.color}
              selected
              showMarker
            />
            <p>{visualState === "unknown" ? "Unknown" : postureLabel(visualState)}</p>
          </div>
          <dl className="facts">
            <Fact label="Harness" value={factionName(unit.harness)} />
            <Fact label="Model" value={unit.model} />
            {role ? <Fact label="Type" value={roleLabel(role)} /> : null}
            <Fact label="Thread" value={unit.threadName ?? "—"} />
            {unit.parentId ? <Fact label="Parent task" value={unit.parentId.slice(0, 8)} /> : null}
            <Fact label="Status" value={unit.status ?? "—"} />
            <Fact label="Lifecycle" value={unit.lifecycle ?? "—"} />
            <Fact label="Presence" value={unit.presence ?? "—"} />
            <Fact label="Freshness" value={unit.freshness ?? "—"} />
            <Fact label="Base" value={unassigned ? "Unassigned" : base.repo} />
            <Fact label="Last touched" value={formatLastTouched(unit.updatedAt, now)} detail={absolute} />
          </dl>
          {unit.nativeUrl ? <p><a href={unit.nativeUrl} target="_blank" rel="noreferrer">Open this task</a></p> : null}
          {harnessSlug(unit.harness) === "codex" ? (
            <WorkerGroupInspector
              base={base}
              selected={unit}
              now={now}
              onSelectUnit={onSelectUnit}
            />
          ) : null}
        </>
      ) : (
        <>
          {empty ? (
            <p className="lede">Camp with no army. This repo has no Working Set units on the map.</p>
          ) : unassigned ? (
            <p className="lede">
              These units have no repo. They stay in this list. The map shows one outpost and the
              count, not a token for each unit.
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
      <ProjectDestinations base={base} />
      <LatestThreadLink base={base} now={now} />
      <SharedMapSettings
        base={base}
        unit={unit}
        revision={metadataRevision}
        enabled={canEditMetadata}
        onSaved={onRefreshSnapshot}
      />
      {base.units.length > 0 ? (
        <ul className="roster">
          {base.units.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={entry.id === unit?.id ? "roster-unit is-selected" : "roster-unit"}
                data-faction={harnessSlug(entry.harness)}
                data-emphasis={unitEmphasis(entry, base.repo)}
                data-posture={visualPosture(postureSignal(entry.status, entry.lifecycle))}
                aria-pressed={entry.id === unit?.id}
                title={unitContext(entry) ?? undefined}
                onClick={() => onSelectUnit(base.id, entry.id)}
              >
                <UnitFigure
                  harness={entry.harness}
                  model={entry.model}
                  status={postureSignal(entry.status, entry.lifecycle)}
                  appearanceRole={entry.appearance?.unitRole}
                  accentColor={entry.appearance?.color}
                />
                <span>
                  <strong>{entry.model}</strong>
                  <span className="roster-meta">
                    {factionName(entry.harness)}
                    {entry.status ? ` · ${entry.status}` : ""}
                    {entry.lifecycle ? ` · ${entry.lifecycle}` : ""}
                  </span>
                  {(() => {
                    const snippet = popoverSnippet(entry, true);
                    const context = unitContext(entry, true);
                    if (snippet) {
                      return (
                        <span className="roster-meta" title={popoverSnippet(entry) ?? undefined}>
                          {snippet}
                        </span>
                      );
                    }
                    if (context) {
                      return (
                        <span className="roster-meta" title={unitContext(entry) ?? undefined}>
                          {context}
                        </span>
                      );
                    }
                    return null;
                  })()}
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
    </div>
  );
}

function ProjectDestinations({ base }: { base: CampaignBase }) {
  const destinations = [
    { label: "Repository", url: base.links?.githubUrl, provenance: base.linkProvenance?.githubUrl ?? "none" },
    {
      label: "OpenProject",
      url: base.links?.openProjectUrl ?? (base.linkProvenance?.openProjectUrl === "manual" ? null : base.openProject?.href ?? null),
      provenance: base.linkProvenance?.openProjectUrl ?? (base.openProject?.href ? "observation" : "none"),
    },
    { label: "Hive channel", url: base.links?.buzzUrl, provenance: base.linkProvenance?.buzzUrl ?? "none" },
  ];
  return (
    <section className="project-destinations" aria-label="Project destinations">
      <h3>Project links</h3>
      <ul>
        {destinations.map(({ label, url, provenance }) => (
          <li key={label}>
            <span>{label}</span>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer">Open <span className="link-provenance">{provenance === "manual" ? "manual · unverified" : "source link"}</span></a>
            ) : <span className="link-provenance">Not linked</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LatestThreadLink({ base, now }: { base: CampaignBase; now: number }) {
  return (
    <section className="latest-thread" aria-label="Latest thread">
      <h3>Latest thread</h3>
      {base.latestThread ? (
        <>
          <a href={base.latestThread.url} target="_blank" rel="noreferrer">
            {base.latestThread.title?.trim() || "Open latest verified thread"}
          </a>
          <p>Updated {formatLastTouched(base.latestThread.updatedAt, now)}</p>
        </>
      ) : (
        <>
          <button type="button" disabled aria-describedby={`thread-unavailable-${base.id}`}>Open latest verified thread</button>
          <p id={`thread-unavailable-${base.id}`}>No source-verified thread URL is available for this camp.</p>
        </>
      )}
    </section>
  );
}

type WorkerGroupEntry = { unit: Unit; depth: number };

function WorkerGroupInspector({
  base,
  selected,
  now,
  onSelectUnit,
}: {
  base: CampaignBase;
  selected: Unit;
  now: number;
  onSelectUnit: (baseId: string, unitId: string) => void;
}) {
  const byId = new Map(base.units.map((entry) => [entry.id, entry]));
  let root = selected;
  const ancestorPath = new Set([selected.id]);
  let missingParent = false;
  let cyclicParent = false;

  while (root.parentId?.trim()) {
    const parent = byId.get(root.parentId.trim());
    if (!parent) {
      missingParent = true;
      break;
    }
    if (ancestorPath.has(parent.id)) {
      cyclicParent = true;
      break;
    }
    ancestorPath.add(parent.id);
    root = parent;
  }

  const children = new Map<string, Unit[]>();
  for (const entry of base.units) {
    const parentId = entry.parentId?.trim();
    if (!parentId || !byId.has(parentId)) continue;
    const siblings = children.get(parentId) ?? [];
    siblings.push(entry);
    children.set(parentId, siblings);
  }

  const entries: WorkerGroupEntry[] = [];
  const visited = new Set<string>();
  function visit(entry: Unit, depth: number) {
    if (visited.has(entry.id)) return;
    visited.add(entry.id);
    entries.push({ unit: entry, depth });
    for (const child of children.get(entry.id) ?? []) visit(child, depth + 1);
  }
  visit(root, 0);

  const subagentCount = entries.length - 1;
  const summary = missingParent
    ? `Orphaned / ungrouped · ${subagentCount} linked descendants`
    : cyclicParent
      ? `Unresolved parent cycle · ${subagentCount} linked descendants`
      : subagentCount === 0
        ? "No linked subagents"
        : `${subagentCount} linked subagents`;

  return (
    <details className="worker-group">
      <summary>Codex worker group · {summary}</summary>
      {missingParent ? <p className="help">The selected worker references a parent that is not present in this camp snapshot.</p> : null}
      {cyclicParent ? <p className="help">Parent references form a cycle; showing only the resolvable linked units.</p> : null}
      <ul className="roster" aria-label="Linked workers">
        {entries.map(({ unit: entry, depth }) => {
          const level = depth === 0 ? (missingParent ? "Orphaned / ungrouped" : "Group root") : depth === 1 ? "Direct subagent" : `Descendant subagent · level ${depth}`;
          const state = [
            entry.status?.trim() ? `Status ${entry.status.trim()}` : null,
            entry.lifecycle?.trim() ? `Lifecycle ${entry.lifecycle.trim()}` : null,
          ].filter(Boolean).join(" · ") || "State unknown";
          const lastSeen = formatLastTouched(entry.updatedAt, now);
          const selectedEntry = entry.id === selected.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                className={selectedEntry ? "roster-unit is-selected" : "roster-unit"}
                data-faction={harnessSlug(entry.harness)}
                data-posture={visualPosture(postureSignal(entry.status, entry.lifecycle))}
                data-worker-id={entry.id}
                aria-pressed={selectedEntry}
                aria-label={`${level}: ${entry.model}; ${state}; last seen ${lastSeen}`}
                onClick={() => onSelectUnit(base.id, entry.id)}
              >
                <span>
                  <strong>{entry.model}</strong>
                  <span className="roster-meta">{level} · {state} · Last seen {lastSeen}</span>
                </span>
              </button>
              {!selectedEntry && entry.nativeUrl ? <p><a href={entry.nativeUrl} target="_blank" rel="noreferrer">Open task</a></p> : null}
            </li>
          );
        })}
      </ul>
    </details>
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
