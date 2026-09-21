export type MapSource = "fixture" | "working-set";

/** One project/repo on the campaign map. Metadata only. */
export type CampaignBase = {
  id: string;
  repo: string;
  label: string | null;
  threadName: string | null;
  harness: string;
  model: string;
  /** ISO-8601 timestamp, or "unknown" when the payload omitted it. */
  updatedAt: string;
  /**
   * Optional map placement in the 0–1 range.
   * Presentation only. Working Set records do not need it.
   */
  place: { x: number; y: number } | null;
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
