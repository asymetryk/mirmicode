export type MapSource = "fixture" | "working-set" | "native-feed" | "mirmicode";

/** Camp lifecycle stage from the camp dossier. */
export type CampStage = "idea" | "mvp" | "active" | "parked" | "archive" | "unknown";

export type TaskTokenUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  reasoning_output_tokens: number | null;
  total_tokens: number | null;
};

export type TaskOutcome = {
  state: string | null;
  summary: string | null;
  evidence: string[] | null;
};

/** One agent on a base. The harness is its faction. The model is its unit type. */
export type Unit = {
  id: string;
  harness: string;
  model: string;
  threadName: string | null;
  label: string | null;
  /**
   * observed.lastUserPrompt, then observed.last_user_prompt, then prompt aliases or annotation.note.
   * Never a task label. Null in public BIP mode (prompts scrubbed) unless full live is on.
   */
  lastPrompt: string | null;
  /**
   * True when a usable Last-prompt snippet existed in the payload (same resolution as lastPrompt).
   * Survives public scrubbing so the map hard filter can keep units that have context without showing text.
   */
  hasContextSnippet: boolean;
  /**
   * Native-feed only: the source never carries prompt bodies, so the
   * "usable snippet" hard filter does not apply. Set by the adapter; the
   * noise filter lets these units stay without lying about `hasContextSnippet`.
   */
  snippetExempt?: boolean;
  /** annotation.status, then flat status. Operator triage such as open or done. Not lifecycle. */
  status: string | null;
  /** Captured task lifecycle, separate from the legacy operator triage status above. */
  activityStatus?: string | null;
  /** Compact last-prompt summary supplied by the task source; never a prompt body. */
  promptTldr?: string | null;
  taskStartedAt?: string | null;
  taskFinishedAt?: string | null;
  taskDurationMs?: number | null;
  tokenUsage?: TaskTokenUsage | null;
  /** Explicit source assessment only; lifecycle completion does not imply an outcome. */
  outcome?: TaskOutcome | null;
  /** observed.lifecycle. Live values: idle, detached, archived, unknown. Null when absent. */
  lifecycle: string | null;
  /** observed.presence. Live values: present, not_seen. Null when absent. */
  presence: string | null;
  /** observed.freshness, a relative string. The literal "unknown" is kept. Null when absent. */
  freshness: string | null;
  /** True only when annotation.hidden is boolean true. */
  hidden: boolean;
  /** ISO-8601 timestamp, or "unknown" when the payload omitted it. */
  updatedAt: string;
  /** Parent Codex task for a subagent; null for top-level or unknown. */
  parentId?: string | null;
  /** Verified native destination only; never synthesized from a session ID. */
  nativeUrl?: string | null;
  /** User-controlled map presentation, separate from source observations. */
  appearance?: UnitAppearance;
};

export type BuildingKind = "pad" | "depot" | "turret" | "refinery" | "barracks" | "lab";
export type UnitRole =
  | "scout" | "worker" | "drone" | "tankette" | "walker" | "medic"
  | "mirmi-small" | "mirmi-armed" | "skiff" | "builder";

export type CampAppearance = {
  color: string | null;
  buildingSet: BuildingKind[] | null;
};

export type UnitAppearance = {
  color: string | null;
  unitRole: UnitRole | null;
};

export type CampLinks = {
  githubUrl: string | null;
  openProjectUrl: string | null;
  buzzUrl: string | null;
};

export type LinkProvenance = {
  githubUrl: "manual" | "observation" | "none";
  openProjectUrl: "manual" | "observation" | "none";
  buzzUrl: "manual" | "observation" | "none";
};

export type LatestThread = {
  id: string;
  title: string | null;
  url: string;
  updatedAt: string;
};

/** OpenProject project copied from Working Set associations. Null means none linked. */
export type OpenProjectSummary = {
  href: string | null;
  name: string | null;
  status: string | null;
  summary: string | null;
};

/** One project/repo on the campaign map. */
export type CampaignBase = {
  id: string;
  /** Stable canonical source key, used for shared metadata writes. */
  repoKey?: string;
  repo: string;
  label: string | null;
  /** Aggregated from unit associations, else a repo map already on the payload. */
  openProject: OpenProjectSummary | null;
  /** Latest unit touch, or "unknown". */
  updatedAt: string;
  /**
   * Optional map placement in the 0–1 range.
   * Presentation only. Working Set records do not need it.
   */
  place: { x: number; y: number } | null;
  /** Camp lifecycle stage. Defaults to "unknown" when missing or invalid. */
  stage: CampStage;
  /**
   * Native-feed camp `one_liner`. Used by the dossier panel as a fallback
   * when no dossier entry exists for this base. Null for other feeds.
   */
  oneLiner: string | null;
  units: Unit[];
  /** Shared operator-editable display overrides. */
  appearance?: CampAppearance;
  /** Shared operator-editable destinations, overriding observed links. */
  links?: CampLinks;
  /** Manual edits are not equivalent to provider-verified destinations. */
  linkProvenance?: LinkProvenance;
  /** Most recent source-provided thread URL; null when no verified URL exists. */
  latestThread?: LatestThread | null;
};

export type MapSnapshot = {
  source: MapSource;
  fetchedAt: string;
  bases: CampaignBase[];
  notice: string | null;
  /** True when snapshot.stale is boolean true. A banner only; units stay. */
  stale: boolean;
  /** Revision for optimistic concurrency on shared metadata edits. */
  metadataRevision?: number;
};

export type ViewState = {
  x: number;
  y: number;
  scale: number;
};

export type CampBacklogItem = {
  id: number;
  subject: string;
  status: string;
  priority: string;
};

export type CampDossier = {
  campId: string;
  oneLiner: string;
  stage: string;
  health: {
    level: string;
    reason: string;
  };
  backlog: {
    byStatus: Record<string, number | undefined>;
    topItems: CampBacklogItem[];
    openTotal?: number;
    note?: string;
    opIdentifier?: string;
    opUpdatedAt?: string;
    milestones?: unknown;
  };
  nextActions: string[];
  links: {
    repo: string | null;
    openProject: string | null;
    buzz: string | null;
  };
};

export type CampDossierCatalog = {
  source: string;
  enrichedAt?: string;
  campCount: number;
  camps: CampDossier[];
};
