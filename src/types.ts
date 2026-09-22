export type MapSource = "fixture" | "working-set";

/** One agent on a base. The harness is its faction. The model is its unit type. */
export type Unit = {
  id: string;
  harness: string;
  model: string;
  threadName: string | null;
  label: string | null;
  status: string | null;
  /** ISO-8601 timestamp, or "unknown" when the payload omitted it. */
  updatedAt: string;
};

/** One project/repo on the campaign map. */
export type CampaignBase = {
  id: string;
  repo: string;
  label: string | null;
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
};

export type ViewState = {
  x: number;
  y: number;
  scale: number;
};
