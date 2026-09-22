import { isPublicMode } from "../publicMode";
import type { CampaignBase, CampDossier } from "../types";

type CampDossierPanelProps = {
  base: CampaignBase | null;
  dossier: CampDossier | null;
  onClose: () => void;
};

export function CampDossierPanel({ base, dossier, onClose }: CampDossierPanelProps) {
  if (!base) return null;

  const publicMode = isPublicMode();
  const heading = dossier?.campId ?? base.label ?? base.repo;

  return (
    <div className="camp-dossier-panel" role="complementary" aria-label="Camp dossier">
      <div className="camp-dossier-head">
        <p className="kicker">Camp dossier</p>
        <button type="button" className="popover-close" onClick={onClose} aria-label="Close dossier">
          Close
        </button>
      </div>
      <h2>{heading}</h2>
      {dossier ? (
        <DossierBody dossier={dossier} publicMode={publicMode} />
      ) : (
        <DossierFallback base={base} publicMode={publicMode} />
      )}
    </div>
  );
}

function DossierFallback({ base, publicMode }: { base: CampaignBase; publicMode: boolean }) {
  const openProjectHref = base.openProject?.href ?? null;
  const repoHref = repoLinkFromBase(base);
  return (
    <>
      {base.oneLiner ? <p className="lede">{base.oneLiner}</p> : null}
      <p className="lede">No dossier entry for this camp yet.</p>
      <section className="camp-dossier-section">
        <h3>Links</h3>
        <ul className="camp-dossier-links">
          {repoHref ? (
            <li>
              <a href={repoHref} target="_blank" rel="noreferrer">
                Repository
              </a>
            </li>
          ) : null}
          {openProjectHref && !publicMode ? (
            <li>
              <a href={openProjectHref} target="_blank" rel="noreferrer">
                OpenProject
              </a>
            </li>
          ) : null}
          {!repoHref && !openProjectHref ? (
            <li className="is-empty">No public links recorded.</li>
          ) : null}
        </ul>
      </section>
    </>
  );
}

function repoLinkFromBase(base: CampaignBase): string | null {
  const repo = base.repo.trim();
  if (!repo || repo.toLowerCase() === "unassigned") return null;
  if (repo.includes("github.com")) return repo;
  if (/^[\w.-]+\/[\w.-]+$/.test(repo)) return `https://github.com/${repo}`;
  return null;
}

function DossierBody({ dossier, publicMode }: { dossier: CampDossier; publicMode: boolean }) {
  const topItems = dossier.backlog.topItems.slice(0, 5);
  const nextActions = dossier.nextActions.slice(0, 3);

  return (
    <>
      <p className="lede">{dossier.oneLiner}</p>
      <div className="camp-dossier-badges">
        <span className="badge" data-badge={dossier.stage}>{dossier.stage}</span>
        <span className="badge" data-health={dossier.health.level}>{dossier.health.level}</span>
      </div>
      <p className="camp-dossier-reason">{dossier.health.reason}</p>

      {nextActions.length > 0 ? (
        <section className="camp-dossier-section">
          <h3>Next actions</h3>
          <ul className="camp-dossier-list">
            {nextActions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {topItems.length > 0 ? (
        <section className="camp-dossier-section">
          <h3>Top backlog items</h3>
          <ul className="camp-dossier-backlog">
            {topItems.map((item) => (
              <li key={item.id}>
                <span className="backlog-subject">{item.subject}</span>
                <span className="backlog-meta">
                  {item.status}
                  {item.priority ? ` \u00b7 ${item.priority}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="camp-dossier-section">
        <h3>Links</h3>
        <ul className="camp-dossier-links">
          {dossier.links.repo ? (
            <li>
              <a href={dossier.links.repo} target="_blank" rel="noreferrer">
                Repository
              </a>
            </li>
          ) : null}
          {dossier.links.openProject && !publicMode ? (
            <li>
              <a href={dossier.links.openProject} target="_blank" rel="noreferrer">
                OpenProject
              </a>
            </li>
          ) : null}
          {dossier.links.buzz && !publicMode ? (
            <li>
              <a href={dossier.links.buzz} target="_blank" rel="noreferrer">
                Buzz
              </a>
            </li>
          ) : null}
          {publicMode && !dossier.links.repo ? (
            <li className="is-empty">No public links recorded.</li>
          ) : null}
        </ul>
      </section>
    </>
  );
}
