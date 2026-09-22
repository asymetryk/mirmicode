/**
 * Primary camp selection for Howard's ~/Developer tree.
 *
 * The map bakes the result into src/data/all-repos.json. The browser never
 * calls GitHub. A private credential bake of that account failed (GET /user
 * 403), so this list replaces the old 10-public-repo catalog.
 *
 * Skip clones and checkouts that are not their own product, then collapse
 * spelling duplicates onto one camp. Origin owner/name wins when the scan
 * recorded a remote. A folder with no remote still becomes a camp.
 */

export const RETIRED_PUBLIC_GITHUB_CAMP_COUNT = 10;

/** Date and note for the scan committed with this bake. A later Mac run replaces both. */
export const ATTACHED_SCAN_FETCHED_ON = "2026-09-22";
export const ATTACHED_SCAN_DETAIL =
  "Input scan src/data/developer-camps.scan.json from /Users/howard/Developer at 2026-09-22T15:41:44.896865+00:00 (61 camps after a preliminary light filter; 53 folders already excluded).";

/**
 * Product roots that share a hyphen prefix with a shorter camp and still stay.
 * homelab-atlas sits beside homelab. agentworkforce-runtime is its own root:
 * the scan's agentworkforce-runtime-worktrees sibling is the worktree pile,
 * and the other agentworkforce-* folders are work packets.
 */
const SEPARATE_PRODUCTS = new Set(["homelab-atlas", "agentworkforce-runtime"]);

export type DeveloperCampInput = {
  folder: string;
  /** Parsed origin `owner/name`, when the remote URL had one. */
  repo?: string | null;
  hasGit?: boolean;
};

export type SelectedCamp = {
  id: string;
  folder: string;
  repo: string | null;
};

export type CampCatalogFile = {
  owner: null;
  fetchedOn: string;
  source: string;
  repos: string[];
};

/** Stable note stored on the baked catalog. */
export function catalogSourceNote(fetchedOn: string, detail?: string): string {
  const parts = [
    `Howard ~/Developer camp scan, baked ${fetchedOn}.`,
    "Source of truth is that local Developer tree, not a GitHub user listing.",
    "Each camp id is the origin owner/name when the scan recorded a remote; otherwise it is the folder name, so a local-only checkout still shows as an empty camp.",
    `This replaces the public GitHub bake of ${RETIRED_PUBLIC_GITHUB_CAMP_COUNT} repos for user asymetryk.`,
    "A private GitHub credential bake failed: GET /user returned 403, and gh repo list with no owner only saw asymetryk/mirmicode.",
    "Regenerate on the Mac with scripts/refresh-developer-camps.sh.",
    "The browser never calls GitHub; the map merges this file at load.",
  ];
  if (detail?.trim()) parts.push(detail.trim());
  return parts.join(" ");
}

export function buildCampCatalog(
  camps: readonly DeveloperCampInput[],
  options: { fetchedOn: string; detail?: string },
): CampCatalogFile {
  return {
    owner: null,
    fetchedOn: options.fetchedOn,
    source: catalogSourceNote(options.fetchedOn, options.detail),
    repos: selectDeveloperCamps(camps).map((camp) => camp.id),
  };
}

/** Why a folder is not a primary camp, or null when it can stay. */
export function skipReason(folder: string): string | null {
  const name = folder.trim();
  if (!name) return "blank";
  if (name.startsWith("_")) return "underscore-prefix";
  const key = normalizeKey(name);
  if (!key) return "blank";
  if (key.endsWith("-worktrees") || key.includes("-worktrees-")) return "worktrees";
  if (key.includes("stale")) return "stale";
  if (key.includes("partial")) return "partial";
  if (key.endsWith("-upstream")) return "upstream";
  if (/(^|-)pr($|-)/.test(key)) return "pull-request-clone";
  if (/(^|-)wp-?\d+/.test(key)) return "work-packet-clone";
  if (/-releases?-\d/.test(key) || /\d+\.\d+\.\d+/.test(key)) return "release-snapshot";
  if (key !== "agentinfra" && key.startsWith("agentinfra-")) return "agentinfra-clone";
  if (key !== "agentos" && key.startsWith("agentos-")) return "agentos-clone";
  if (key !== "dtr-app" && key.startsWith("dtr-app-")) return "dtr-app-clone";
  if (key !== "mirmicode" && key.startsWith("mirmicode-")) return "mirmicode-clone";
  if (key !== "shi-presentation-builder" && key.startsWith("shi-presentation-builder-")) {
    return "shi-presentation-builder-extra";
  }
  return null;
}

/** Lowercase hyphen form. Strips a trailing `.git` and turns spaces into hyphens. */
export function normalizeKey(name: string): string {
  let text = name.trim();
  if (text.toLowerCase().endsWith(".git")) text = text.slice(0, -4).trim();
  return text
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Spelling-insensitive key: `Policy Sentinel.git` matches `policy-sentinel`. */
export function compactKey(name: string): string {
  return normalizeKey(name).replace(/[-._]/g, "");
}

/** `git@github.com:owner/name.git` and https remotes. Other hosts use the last two path parts. */
export function originOwnerName(url: string | null | undefined): string | null {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return null;
  const github = trimmed.match(/github\.com[:/]([^/:]+)\/([^/#?]+?)(?:\.git)?\/?$/i);
  const generic = trimmed.match(/[:/]([^/:]+)\/([^/#?]+?)(?:\.git)?\/?$/);
  const match = github ?? generic;
  const owner = match?.[1];
  const repo = match?.[2];
  if (!owner || !repo) return null;
  if (owner.includes("@") || repo.includes("@")) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return `${owner}/${repo}`;
}

export function campId(camp: DeveloperCampInput): string {
  const repo = camp.repo?.trim() ?? "";
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return repo;
  return camp.folder.trim();
}

export function selectDeveloperCamps(camps: readonly DeveloperCampInput[]): SelectedCamp[] {
  const eligible = camps.filter((camp) => camp.folder.trim() && !skipReason(camp.folder));
  const collapsed = dropBranchClones(collapseSpelling(collapseFamilies(eligible)));
  const byId = new Map<string, DeveloperCampInput[]>();
  for (const camp of collapsed) {
    const key = campId(camp).toLowerCase();
    const group = byId.get(key) ?? [];
    group.push(camp);
    byId.set(key, group);
  }
  const selected: SelectedCamp[] = [];
  for (const group of byId.values()) {
    const winner = bestCamp(group);
    const repo = winner.repo?.trim() || null;
    selected.push({ id: campId(winner), folder: winner.folder, repo });
  }
  selected.sort((a, b) => a.id.localeCompare(b.id, "en", { sensitivity: "base" }));
  return selected;
}

export function campsFromScanDocument(doc: unknown): DeveloperCampInput[] {
  if (!doc || typeof doc !== "object") return [];
  const record = doc as Record<string, unknown>;
  const rows = Array.isArray(record.camps)
    ? record.camps
    : Array.isArray(record.repos)
      ? record.repos
      : [];
  const camps: DeveloperCampInput[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const folder = typeof item.folder === "string" ? item.folder : typeof item.name === "string" ? item.name : "";
    if (!folder.trim()) continue;
    const rawRepo = typeof item.repo === "string" ? item.repo : null;
    camps.push({
      folder,
      repo: rawRepo,
      hasGit: item.has_git === true || item.hasGit === true,
    });
  }
  return camps;
}

function collapseFamilies(camps: readonly DeveloperCampInput[]): DeveloperCampInput[] {
  const proposal: DeveloperCampInput[] = [];
  const dtrSite: DeveloperCampInput[] = [];
  const rest: DeveloperCampInput[] = [];
  for (const camp of camps) {
    const key = normalizeKey(camp.folder);
    if (key === "proposal-generator" || key.startsWith("proposal-generator-")) proposal.push(camp);
    else if (key === "dtr-site" || key.startsWith("dtr-site-")) dtrSite.push(camp);
    else rest.push(camp);
  }
  const next = [...rest];
  const proposalWinner = pickFamily(proposal, "proposal-generator");
  if (proposalWinner) next.push(proposalWinner);
  const dtrWinner = pickFamily(dtrSite, "dtr-site");
  if (dtrWinner) next.push(dtrWinner);
  return next;
}

/** Prefer the bare product name. If that folder is absent, keep one variant. */
function pickFamily(camps: readonly DeveloperCampInput[], bareKey: string): DeveloperCampInput | null {
  if (camps.length === 0) return null;
  const bare = camps.filter((camp) => normalizeKey(camp.folder) === bareKey);
  return bestCamp(bare.length > 0 ? bare : camps);
}

function collapseSpelling(camps: readonly DeveloperCampInput[]): DeveloperCampInput[] {
  const groups = new Map<string, DeveloperCampInput[]>();
  for (const camp of camps) {
    const key = compactKey(camp.folder);
    const group = groups.get(key) ?? [];
    group.push(camp);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => bestCamp(group));
}

function dropBranchClones(camps: readonly DeveloperCampInput[]): DeveloperCampInput[] {
  const keys = new Set(camps.map((camp) => normalizeKey(camp.folder)));
  return camps.filter((camp) => {
    const key = normalizeKey(camp.folder);
    if (SEPARATE_PRODUCTS.has(key)) return true;
    for (const other of keys) {
      if (other !== key && key.startsWith(`${other}-`)) return false;
    }
    return true;
  });
}

function bestCamp(camps: readonly DeveloperCampInput[]): DeveloperCampInput {
  const ranked = [...camps].sort(compareCamp);
  const winner = ranked[0];
  if (!winner) throw new Error("Cannot rank an empty camp group.");
  return winner;
}

function compareCamp(a: DeveloperCampInput, b: DeveloperCampInput): number {
  const delta = score(a)
    .map((value, index) => value - (score(b)[index] ?? 0))
    .find((value) => value !== 0);
  if (delta) return delta;
  return a.folder.localeCompare(b.folder, "en", { sensitivity: "base" });
}

function score(camp: DeveloperCampInput): number[] {
  const key = normalizeKey(camp.folder);
  const folder = camp.folder.trim();
  const kebab = folder.toLowerCase() === key;
  const gitDir = folder.toLowerCase().endsWith(".git");
  const hasOrigin = campId(camp).includes("/");
  return [hasOrigin ? 0 : 1, camp.hasGit ? 0 : 1, kebab && !gitDir ? 0 : 1, gitDir ? 1 : 0, folder.length];
}
