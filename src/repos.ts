import type { CampaignBase } from "./types";

/** Case-insensitive owner/name key. `Asymetryk/Mirmicode` matches `asymetryk/mirmicode`. */
export function repoKey(repo: string): string {
  return repo.trim().toLowerCase();
}

/**
 * Working Set bases keep their units. Catalog repos with no matching base
 * become camps with an empty army. Duplicate catalog names collapse.
 * Unassigned is not a GitHub repo and is left alone.
 */
export function mergeRepoCatalog(bases: CampaignBase[], catalog: readonly string[]): CampaignBase[] {
  const seenIds = new Set(bases.map((base) => base.id));
  const present = new Set(bases.map((base) => repoKey(base.repo)));
  const added = new Set<string>();
  const extras = [...catalog]
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .sort((a, b) => repoKey(a).localeCompare(repoKey(b)));
  const next = [...bases];
  for (const name of extras) {
    const key = repoKey(name);
    if (!key || key === "unassigned" || present.has(key) || added.has(key)) continue;
    added.add(key);
    const id = uniqueCampId(name, seenIds);
    next.push({
      id,
      repo: name,
      label: null,
      openProject: null,
      updatedAt: "unknown",
      place: null,
      stage: "unknown",
      oneLiner: null,
      units: [],
    });
  }
  return next;
}

function uniqueCampId(repo: string, seen: Set<string>): string {
  const slug = repo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "repo";
  let id = `camp-${slug}`;
  let n = 2;
  while (seen.has(id)) {
    id = `camp-${slug}-${n}`;
    n += 1;
  }
  seen.add(id);
  return id;
}
