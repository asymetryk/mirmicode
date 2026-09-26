import { describe, expect, it } from "vitest";
import { hasLiveMapActivity } from "./App";
import type { CampaignBase, Unit } from "./types";

describe("live-work map scope", () => {
  it("keeps current work and recent completions while leaving all other camps for All camps", () => {
    const now = Date.parse("2026-09-23T12:00:00Z");
    const camps = [
      camp("working", [unit("working", "working", "unknown")]),
      camp("attention", [unit("attention", "blocked", "idle")]),
      camp("recent-done", [unit("recent-done", "done", "idle", "2026-09-22T12:00:00Z")]),
      camp("old-done", [unit("old-done", "completed", "idle", "2026-09-22T11:59:59Z")]),
      camp("future-done", [unit("future-done", "completed", "idle", "2026-09-23T12:00:01Z")]),
      camp("unknown", [unit("unknown", null, "unknown")]),
      ...Array.from({ length: 25 }, (_, index) => camp(`idle-${index}`, [unit(`idle-${index}`, null, "idle")])),
    ];

    expect(camps).toHaveLength(31);
    expect(camps.filter((entry) => hasLiveMapActivity(entry, now)).map((entry) => entry.id))
      .toEqual(["working", "attention", "recent-done"]);
  });
});

function camp(id: string, units: Unit[]): CampaignBase {
  return {
    id,
    repo: `example/${id}`,
    label: null,
    openProject: null,
    updatedAt: "unknown",
    place: null,
    stage: "active",
    oneLiner: null,
    units,
  };
}

function unit(id: string, status: string | null, lifecycle: string | null, updatedAt = "2026-09-23T11:30:00Z"): Unit {
  return {
    id,
    harness: "codex",
    model: "GPT-6-Luna",
    threadName: null,
    label: null,
    lastPrompt: null,
    hasContextSnippet: false,
    status,
    lifecycle,
    presence: "present",
    freshness: null,
    hidden: false,
    updatedAt,
  };
}
