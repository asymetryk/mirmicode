import { NO_OP_PROJECT } from "../openProject";
import type { OpenProjectSummary } from "../types";

type OpenProjectBlockProps = {
  project: OpenProjectSummary | null;
  /** Name or the empty sentence, without the longer status block. */
  compact?: boolean;
};

export function OpenProjectBlock({ project, compact = false }: OpenProjectBlockProps) {
  if (!project) {
    return <p className="op-empty">{NO_OP_PROJECT}</p>;
  }
  const label = project.name ?? "OpenProject";
  if (compact) {
    return project.href ? (
      <a className="op-link" href={project.href} target="_blank" rel="noreferrer">
        {label}
      </a>
    ) : (
      <p className="op-name">{label}</p>
    );
  }
  return (
    <section className="op-block" aria-label="OpenProject">
      <p className="kicker">OpenProject</p>
      {project.href ? (
        <a className="op-link" href={project.href} target="_blank" rel="noreferrer">
          {label}
        </a>
      ) : (
        <p className="op-name">{label}</p>
      )}
      {project.status ? <p className="op-status">{project.status}</p> : null}
      {project.summary ? <p className="op-summary">{project.summary}</p> : null}
    </section>
  );
}
