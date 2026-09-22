import { describe, expect, it } from "vitest";
import { loadFixture } from "./adapters/source";
import { positionBases } from "./layout";
import { DEFAULT_NOISE_FILTER, applyNoiseFilter } from "./mapNoise";
import { mergeRepoCatalog, repoKey } from "./repos";
import type { CampaignBase, Unit } from "./types";

const unit: Unit = {
  id: "u1",
  harness: "ohmypi",
  model: "Kimi",
  threadName: null,
  label: null,
  lastPrompt: "hello",
  status: null,
  lifecycle: "detached",
  presence: "present",
  freshness: null,
  hidden: false,
  hasContextSnippet: true,
  updatedAt: "unknown",
};

function camp(repo: string, units: Unit[] = []): CampaignBase {
  return {
    id: repoKey(repo).replace(/[^a-z0-9]+/g, "-") || "base",
    repo,
    label: null,
    openProject: null,
    updatedAt: "unknown",
    place: null,
    units,
  };
}

describe("mergeRepoCatalog", () => {
  it("attaches working set units to the matching repo and keeps empty camps", () => {
    const merged = mergeRepoCatalog(
      [camp("Asymetryk/Mirmicode", [unit]), camp("Unassigned", [unit])],
      ["asymetryk/mirmicode", "asymetryk/buzz", "ASYMETRYK/Buzz", "asymetryk/kept"],
    );
    const mirmicode = merged.filter((base) => repoKey(base.repo) === "asymetryk/mirmicode");
    expect(mirmicode).toHaveLength(1);
    expect(mirmicode[0]?.repo).toBe("Asymetryk/Mirmicode");
    expect(mirmicode[0]?.units).toHaveLength(1);
    const buzz = merged.filter((base) => repoKey(base.repo) === "asymetryk/buzz");
    expect(buzz).toHaveLength(1);
    expect(buzz[0]?.units).toEqual([]);
    expect(merged.filter((base) => repoKey(base.repo) === "unassigned")).toHaveLength(1);

    const filtered = applyNoiseFilter(merged, DEFAULT_NOISE_FILTER);
    const empty = filtered.bases.find((base) => repoKey(base.repo) === "asymetryk/buzz");
    expect(empty?.units).toEqual([]);
    const placed = positionBases(filtered.bases).find((base) => repoKey(base.repo) === "asymetryk/buzz");
    expect(placed && placed.x).toBeGreaterThan(0);
    expect(placed && placed.y).toBeGreaterThan(0);
  });

  it("drops a base whose units were all filtered and still draws a camp that started empty", () => {
    const hidden: Unit = { ...unit, id: "gone", hidden: true, harness: "cursor", lifecycle: "idle" };
    const filtered = applyNoiseFilter(
      [camp("example/gone", [hidden]), camp("asymetryk/buzz")],
      DEFAULT_NOISE_FILTER,
    );
    expect(filtered.bases.map((base) => base.repo)).toEqual(["asymetryk/buzz"]);
    expect(filtered.hiddenCount).toBe(1);
  });

  it("merges the baked catalog into the fixture without cloning mirmicode", () => {
    const snapshot = loadFixture();
    const buzz = snapshot.bases.find((base) => repoKey(base.repo) === "asymetryk/buzz");
    expect(buzz?.units).toEqual([]);
    const mirmicode = snapshot.bases.filter((base) => repoKey(base.repo) === "asymetryk/mirmicode");
    expect(mirmicode).toHaveLength(1);
    expect((mirmicode[0]?.units.length ?? 0) > 0).toBe(true);
    expect(snapshot.bases.some((base) => base.units.length === 0)).toBe(true);
  });
});
