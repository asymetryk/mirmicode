import type { TaskTokenUsage, Unit } from "../types";

type TaskCardProps = {
  unit: Unit;
  now: number;
};

const STATUS_LABELS: Record<string, string> = {
  working: "Working",
  completed: "Finished",
  "needs-attention": "Needs attention",
  unknown: "Unknown",
};

const OUTCOME_LABELS: Record<string, string> = {
  achieved: "Achieved",
  partial: "Partially achieved",
  "needs-help": "Needs help",
  failed: "Failed",
  unassessed: "Unassessed",
};

export function TaskCard({ unit, now }: TaskCardProps) {
  const state = unit.activityStatus ?? "unknown";
  const stateLabel = STATUS_LABELS[state] ?? "Unknown";
  const elapsedMs = getElapsedMs(unit, now);
  const outcome = unit.outcome;

  return (
    <section className="task-card" aria-labelledby="task-card-title">
      <div className="task-card-head">
        <h3 id="task-card-title">Current task</h3>
        <span className="task-state" data-state={state} aria-label={`Task status: ${stateLabel}`}>
          {stateLabel}
        </span>
      </div>
      <div className="task-summary">
        <p className="task-label">Latest request keywords</p>
        <p className={unit.promptTldr ? "task-prompt" : "task-prompt is-empty"}>
          {unit.promptTldr ?? "Sign in to view request keywords, when available."}
        </p>
        {unit.promptTldr ? (
          <p className="task-provenance">Keyword sketch from the task source; prompt text is not shown.</p>
        ) : null}
      </div>
      <dl className="task-metrics">
        <div>
          <dt>Elapsed</dt>
          <dd>{elapsedMs === null ? "Unknown" : formatDuration(elapsedMs)}</dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>{outcome ? formatOutcomeState(outcome.state) : "Unknown / unassessed"}</dd>
        </div>
      </dl>
      {outcome?.summary ? <p className="task-outcome-summary">{outcome.summary}</p> : null}
      {outcome?.evidence?.length ? (
        <ul className="task-evidence" aria-label="Outcome evidence">
          {outcome.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
        </ul>
      ) : null}
      {unit.tokenUsage ? <TokenUsage usage={unit.tokenUsage} /> : null}
    </section>
  );
}

function TokenUsage({ usage }: { usage: TaskTokenUsage }) {
  const entries: Array<[string, number | null]> = [
    ["Input", usage.input_tokens],
    ["Output", usage.output_tokens],
    ["Cached input", usage.cached_input_tokens],
    ["Reasoning", usage.reasoning_output_tokens],
    ["Total", usage.total_tokens],
  ];
  const available = entries.filter((entry): entry is [string, number] => entry[1] !== null);
  if (available.length === 0) return null;

  return (
    <div className="task-token-section">
      <p className="task-token-heading">Session tokens</p>
      <dl className="task-token-usage" aria-label="Session tokens">
        {available.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function getElapsedMs(unit: Unit, now: number): number | null {
  if (unit.taskDurationMs !== null && unit.taskDurationMs !== undefined) return unit.taskDurationMs;
  if (!unit.taskStartedAt) return null;
  const startedAt = Date.parse(unit.taskStartedAt);
  if (!Number.isFinite(startedAt)) return null;
  if (unit.taskFinishedAt) {
    const finishedAt = Date.parse(unit.taskFinishedAt);
    return Number.isFinite(finishedAt) ? Math.max(0, finishedAt - startedAt) : null;
  }
  return unit.activityStatus === "working" ? Math.max(0, now - startedAt) : null;
}

function formatOutcomeState(value: string | null): string {
  if (!value) return "Unassessed";
  return OUTCOME_LABELS[value] ?? value;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
