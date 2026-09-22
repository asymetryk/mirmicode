export type MapSource = "fixture" | "working-set";

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
  /** annotation.status, then flat status. Operator triage such as open or done. Not lifecycle. */
  status: string | null;
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
  units: Unit[];
};

export type MapSnapshot = {
  source: MapSource;
  fetchedAt: string;
  bases: CampaignBase[];
  notice: string | null;
  /** True when snapshot.stale is boolean true. A banner only; units stay. */
  stale: boolean;
};

export type ViewState = {
  x: number;
  y: number;
  scale: number;
};
