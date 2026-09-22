import { repoKey } from "./repos";
import type { CampaignBase, CampDossier, CampDossierCatalog } from "./types";

/**
 * Resolves a `CampaignBase` to a `CampDossier` using multiple key fallbacks.
 *
 * Native feed camps ship with `id = "native-<slug>"`. Their dossier entries
 * in `camp-dossiers.json` are keyed by the human-readable repo name
 * (`agentinfra`, `AIC Kiro`, `Proposal Generator`). The resolver tries a
 * sequence of normalized keys so a click on any active native camp surfaces
 * a real dossier instead of "No dossier entry".
 */
export function resolveDossier(
  base: CampaignBase,
  catalog: CampDossierCatalog,
): CampDossier | null {
  const byId = new Map<string, CampDossier>();
  for (const dossier of catalog.camps) {
    byId.set(dossier.campId, dossier);
    byId.set(slugifyKey(dossier.campId), dossier);
  }
  for (const candidate of dossierKeysFor(base)) {
    const dossier = byId.get(candidate);
    if (dossier) return dossier;
  }
  return null;
}

export function dossierKeysFor(base: CampaignBase): string[] {
  const seen: Record<string, true> = {};
  const next: string[] = [];
  const push = (value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const slug = slugifyKey(trimmed);
    if (seen[slug]) return;
    seen[slug] = true;
    next.push(trimmed);
    next.push(slug);
  };
  push(base.id);
  push(base.id.startsWith("native-") ? base.id.slice("native-".length) : null);
  push(base.repo);
  const segments = base.repo.split("/").filter((part) => part.length > 0);
  push(segments.length > 0 ? segments[segments.length - 1] ?? null : null);
  push(base.label);
  return next;
}

function slugifyKey(value: string): string {
  return repoKey(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
