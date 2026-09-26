import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type FormEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeWorkingSetPayload } from "./adapters/normalize";
import { loadFixture } from "./adapters/source";
import { Legend } from "./components/Legend";
import { MapStage } from "./components/MapStage";
import { SelectionPopover } from "./components/SelectionPopover";
import { SideRail } from "./components/SideRail";
import { factionName } from "./factions";
import { harnessSlug, popoverSnippet } from "./format";
import { positionBases } from "./layout";
import { applyNoiseFilter, DEFAULT_NOISE_FILTER } from "./mapNoise";
import { setPublicModeForTests } from "./publicMode";
import { dominantFaction, heroSrc, unitSrc } from "./rtsArt";
import type { CampaignBase, Unit } from "./types";

afterEach(() => {
  setPublicModeForTests(null);
});

describe("Grok Bot faction label", () => {
  it("folds grokbot spellings onto the display name Grok Bot", () => {
    for (const token of ["grokbot", "grok-bot", "grok_bot", "Grok Bot", "GrokBot"]) {
      expect(factionName(token)).toBe("Grok Bot");
      expect(harnessSlug(token)).toBe("grokbot");
    }
    expect(factionName("ohmypi")).toBe("OhMyPi");
    expect(factionName("omp")).toBe("OhMyPi");
  });
});

describe("Grok Bot working set adapter", () => {
  it("reads grokbot from surface, harness, faction, or a known source", () => {
    const { bases } = normalizeWorkingSetPayload({
      items: [
        {
          item_id: "from-surface",
          observed: { repo: "asymetryk/mirmicode", surface: "grokbot", model: "Grok-4.6", lastUserPrompt: "Surface row" },
        },
        {
          item_id: "from-harness",
          observed: { repo: "example/charter", harness: "grok-bot", model: "Walker", last_user_prompt: "Harness row" },
        },
        {
          item_id: "from-faction",
          repo: "example/charter",
          faction: "Grok Bot",
          model: "Walker",
          last_prompt: "Faction row",
        },
        {
          item_id: "from-source",
          observed: { model: "Walker", source: "grokbot", lastUserPrompt: "No repo yet" },
        },
        {
          item_id: "surface-wins",
          observed: { repo: "example/charter", surface: "cursor", source: "grokbot", faction: "grokbot" },
          last_prompt: "Cursor stays cursor",
        },
        {
          item_id: "source-ignored",
          observed: { repo: "example/charter", source: "cahq-session" },
          last_prompt: "A session source is not a faction",
        },
        {
          item_id: "empty-shell",
          observed: { repo: "asymetryk/mirmicode", surface: "grokbot", model: "Walker" },
          annotation: { label: "Label only" },
        },
      ],
    });

    const byId = Object.fromEntries(
      bases.flatMap((base) => base.units.map((unit) => [unit.id, { repo: base.repo, unit }])),
    );
    expect(byId["from-surface"]).toMatchObject({
      repo: "asymetryk/mirmicode",
      unit: { harness: "grokbot", model: "Grok-4.6", hasContextSnippet: true, lastPrompt: "Surface row" },
    });
    expect(byId["from-harness"]?.unit.harness).toBe("grokbot");
    expect(byId["from-harness"]?.repo).toBe("example/charter");
    expect(byId["from-faction"]?.unit.harness).toBe("grokbot");
    expect(factionName(byId["from-faction"]!.unit.harness)).toBe("Grok Bot");
    expect(byId["from-source"]).toMatchObject({
      repo: "Unassigned",
      unit: { harness: "grokbot", lastPrompt: "No repo yet" },
    });
    expect(byId["surface-wins"]?.unit.harness).toBe("cursor");
    expect(byId["source-ignored"]?.unit.harness).toBe("unknown");

    const filtered = applyNoiseFilter(bases, DEFAULT_NOISE_FILTER);
    const visible = filtered.bases.flatMap((base) => base.units.map((unit) => unit.id));
    expect(visible).toContain("from-surface");
    expect(visible).toContain("from-source");
    expect(visible).not.toContain("empty-shell");
  });

  it("scrubs Grok Bot prompt text in public mode and still keeps the unit", () => {
    setPublicModeForTests({ publicMode: true });
    const { bases } = normalizeWorkingSetPayload({
      items: [
        {
          item_id: "public-grok",
          observed: {
            repo: "asymetryk/mirmicode",
            surface: "grokbot",
            model: "Grok-4.6",
            lastUserPrompt: "Secret Grok Bot prompt",
          },
          annotation: { label: "Grok thread" },
        },
      ],
    });
    const unit = bases[0]?.units[0];
    expect(unit?.harness).toBe("grokbot");
    expect(unit?.lastPrompt).toBeNull();
    expect(unit?.hasContextSnippet).toBe(true);
    expect(popoverSnippet(unit!)).toBeNull();

    const filtered = applyNoiseFilter(bases, DEFAULT_NOISE_FILTER);
    expect(filtered.bases[0]?.units.map((entry) => entry.id)).toEqual(["public-grok"]);
    const html = renderPopover(bases[0]!, unit!);
    expect(html).toContain("Grok Bot");
    expect(html).not.toContain("Secret Grok Bot prompt");
  });
});

describe("Grok Bot fixture", () => {
  it("places three snippet units on a repo or Unassigned and renders the label", () => {
    const snapshot = loadFixture();
    const placed = snapshot.bases.flatMap((base) =>
      base.units
        .filter((unit) => unit.harness === "grokbot")
        .map((unit) => ({ repo: base.repo, id: unit.id, model: unit.model, prompt: unit.lastPrompt })),
    );
    expect(placed).toEqual([
      {
        repo: "asymetryk/mirmicode",
        id: "mirmicode-grokbot",
        model: "Grok-4.6",
        prompt: "Hold the Grok Bot camp on mirmicode with a real context snippet.",
      },
      {
        repo: "example/charter",
        id: "charter-grokbot",
        model: "Walker",
        prompt: "Keep this Grok Bot walker on the charter repo.",
      },
      {
        repo: "Unassigned",
        id: "unassigned-grokbot",
        model: "Walker",
        prompt: "Park this Grok Bot on the Unassigned outpost until a repo is known.",
      },
    ]);
    const grokUnits = snapshot.bases.flatMap((base) => base.units.filter((unit) => unit.harness === "grokbot"));
    expect(grokUnits.map((unit) => factionName(unit.harness))).toEqual(["Grok Bot", "Grok Bot", "Grok Bot"]);

    expect(unitSrc("grokbot", "Grok-4.6")).toBe("/rts-art-v2/units/neutral-walker-07.png");
    expect(unitSrc("grok-bot", "Walker")).toBe("/rts-art-v2/units/neutral-walker-07.png");
    expect(existsSync(resolve("public/rts-art-v2/units/neutral-walker-07.png"))).toBe(true);
    expect(heroSrc("grokbot")).toBeNull();
    expect(dominantFaction([{ harness: "grokbot" }])).toBe("grokbot");

    const filtered = applyNoiseFilter(snapshot.bases, DEFAULT_NOISE_FILTER);
    const visible = new Set(filtered.bases.flatMap((base) => base.units.map((unit) => unit.id)));
    expect(visible.has("mirmicode-grokbot")).toBe(true);
    expect(visible.has("charter-grokbot")).toBe(true);
    expect(visible.has("unassigned-grokbot")).toBe(true);

    const rail = renderToStaticMarkup(
      createElement(SideRail, {
        bases: filtered.bases,
        selectedBaseId: null,
        selectedUnitId: null,
        hideNoise: true,
        hideDetached: false,
        hideArchived: false,
        hiddenCount: filtered.hiddenCount,
        fetchedAt: snapshot.fetchedAt,
        sourceLabel: "Fixture · sample data",
        urlDraft: "",
        loading: false,
        onHideNoise: noop,
        onHideDetached: noop,
        onHideArchived: noop,
        onCollapse: noop,
        onSelectBase: noop,
        onSelectUnit: noop,
        onUrlDraft: noop,
        onLoadUrl: ignoreSubmit,
        onUseFixture: noop,
      }),
    );
    expect(rail).toContain(">Grok Bot<");
    expect(rail).toContain("Hold the Grok Bot camp on mirmicode with a real context snippet.");

    const legend = renderToStaticMarkup(
      createElement(Legend, {
        bases: filtered.bases,
        hideNoise: true,
        hideDetached: false,
        hideArchived: false,
        hiddenCount: filtered.hiddenCount,
        onHideNoise: noop,
        onHideDetached: noop,
        onHideArchived: noop,
        fetchedAt: snapshot.fetchedAt,
        sourceLabel: "Fixture · sample data",
        urlDraft: "",
        loading: false,
        onUrlDraft: noop,
        onLoadUrl: ignoreSubmit,
        onUseFixture: noop,
      }),
    );
    expect(legend).toContain(">Grok Bot<");
    expect(legend).toContain('data-faction="grokbot"');

    const home = filtered.bases.find((base) => base.repo === "asymetryk/mirmicode");
    const homeUnit = home?.units.find((unit) => unit.id === "mirmicode-grokbot");
    if (!home || !homeUnit) throw new Error("Missing fixture Grok Bot on mirmicode");
    const hud = renderPopover(home, homeUnit);
    expect(hud).toContain("Grok Bot unit");
    expect(hud).toContain(">Grok Bot<");
    expect(hud).toContain("Hold the Grok Bot camp on mirmicode with a real context snippet.");

    const hq = filtered.bases.find((base) => base.repo === "Unassigned");
    const hqUnit = hq?.units.find((unit) => unit.id === "unassigned-grokbot");
    if (!hq || !hqUnit) throw new Error("Missing Unassigned Grok Bot");
    const hqHud = renderPopover(hq, hqUnit);
    expect(hqHud).toContain("Grok Bot");
    expect(hqHud).toContain("Park this Grok Bot on the Unassigned outpost until a repo is known.");

    const map = renderToStaticMarkup(
      createElement(MapStage, {
        bases: positionBases(filtered.bases),
        selectedBaseId: home.id,
        selectedUnitId: homeUnit.id,
        attached: false,
        onSelectBase: noop,
        onSelectUnit: noop,
        onClearSelection: noop,
      }),
    );
    expect(map).toContain("Grok Bot Walker (Grok-4.6)");
    expect(map).not.toContain("Label only");
  });
});

function renderPopover(base: CampaignBase, unit: Unit): string {
  return renderToStaticMarkup(
    createElement(SelectionPopover, {
      base,
      unit,
      attached: false,
      now: Date.parse("2026-09-22T12:00:00Z"),
      metadataRevision: null,
      canEditMetadata: false,
      onRefreshSnapshot: noop,
      onToggleAttach: noop,
      onClose: noop,
      onSelectUnit: noop,
    }),
  );
}

function noop(): void {}

function ignoreSubmit(event: FormEvent<HTMLFormElement>): void {
  event.preventDefault();
}
