import { describe, expect, it } from "vitest";
import campDossiers from "./data/camp-dossiers.json";
import { loadNativeFeedFixture } from "./adapters/nativeFeed";
import { resolveDossier } from "./dossier";
import type { CampaignBase, CampDossierCatalog } from "./types";

const catalog = campDossiers as CampDossierCatalog;

function camp(repo: string, label: string | null = null, id?: string): CampaignBase {
  return {
    id: id ?? `native-${repo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    repo,
    label,
    openProject: null,
    updatedAt: "unknown",
    place: null,
    stage: "active",
    oneLiner: null,
    units: [],
  };
}

describe("resolveDossier", () => {
  it("matches a native camp to its dossier by repo key (e.g. agentinfra)", () => {
    const dossier = resolveDossier(camp("asymetryk/agentinfra"), catalog);
    expect(dossier?.campId).toBe("agentinfra");
  });

  it("matches native id (native-aic-kiro) to dossier 'AIC Kiro'", () => {
    const dossier = resolveDossier(camp("asymetryk/aic-kiro", null, "native-aic-kiro"), catalog);
    expect(dossier?.campId).toBe("AIC Kiro");
  });

  it("matches native id (native-aickiro-live) to dossier 'aickiro-live'", () => {
    const dossier = resolveDossier(camp("asymetryk/aickiro-live", null, "native-aickiro-live"), catalog);
    expect(dossier?.campId).toBe("aickiro-live");
  });

  it("matches the legacy working-set id 'mirmicode' directly", () => {
    const dossier = resolveDossier(
      { ...camp("asymetryk/mirmicode", "Map MVP"), id: "mirmicode" },
      catalog,
    );
    expect(dossier?.campId).toBe("mirmicode");
  });

  it("matches via base.label when both id and repo miss", () => {
    const dossier = resolveDossier(
      { ...camp("asymetryk/proposal-generator", "Proposal Generator", "camp-proposal-generator") },
      catalog,
    );
    expect(dossier?.campId).toBe("Proposal Generator");
  });

  it("returns null for camps with no dossier entry (e.g. Unassigned)", () => {
    expect(resolveDossier(camp("Unassigned"), catalog)).toBeNull();
  });

  it("matches every one of the 19 native camps against the dossier catalog", async () => {
    const snapshot = await loadNativeFeedFixture();
    const repos = snapshot.bases.map((b) => b.repo).sort();
    expect(repos).toHaveLength(19);
    for (const base of snapshot.bases) {
      const dossier = resolveDossier(base, catalog);
      expect(dossier?.campId ?? null).not.toBeNull();
    }
  });
});
