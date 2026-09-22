import { describe, expect, it } from "vitest";
import { normalizeWorkingSetPayload } from "./adapters/normalize";
import { loadFixture } from "./adapters/source";
import { NO_OP_PROJECT, aggregateOpenProject, readOpenProjectAssociations } from "./openProject";
import { repoKey } from "./repos";

const alpha = {
  name: "Alpha",
  status: "on track",
  description: "Map the campaign.",
  href: "https://op.example/projects/alpha",
};

describe("OpenProject associations", () => {
  it("reads a link, status, and summary from associations.openproject", () => {
    const { bases } = normalizeWorkingSetPayload({
      items: [
        {
          item_id: "one",
          observed: { repo: "example/demo", surface: "cursor" },
          associations: { openproject: alpha },
        },
      ],
    });
    expect(bases[0]?.openProject).toEqual({
      href: "https://op.example/projects/alpha",
      name: "Alpha",
      status: "on track",
      summary: "Map the campaign.",
    });
    expect(NO_OP_PROJECT).toBe("no OP project linked");
  });

  it("uses the common project and keeps the first when the base is mixed", () => {
    const beta = {
      name: "Beta",
      phase: "paused",
      summary: "Other board.",
      url: "https://op.example/projects/beta",
    };
    const shared = normalizeWorkingSetPayload({
      items: [
        { repo: "example/demo", associations: { openproject: alpha } },
        { repo: "example/demo", associations: { openproject: alpha } },
        { repo: "example/demo", associations: { openproject: beta } },
      ],
    });
    expect(shared.bases[0]?.openProject?.name).toBe("Alpha");

    const tied = normalizeWorkingSetPayload({
      items: [
        { repo: "example/demo", associations: { openproject: alpha } },
        { repo: "example/demo", associations: { openproject: beta } },
      ],
    });
    expect(tied.bases[0]?.openProject?.name).toBe("Alpha");
    expect(aggregateOpenProject([])).toBeNull();
  });

  it("leaves a null association as no project and does not invent a link from the repo", () => {
    const { bases } = normalizeWorkingSetPayload({
      items: [
        {
          repo: "example/demo",
          associations: { openproject: null },
        },
      ],
    });
    expect(bases[0]?.openProject).toBeNull();
    expect(readOpenProjectAssociations("example/demo")).toEqual([]);
    expect(readOpenProjectAssociations({ href: "javascript:alert(1)", name: "Nope" })).toEqual([
      { href: null, name: "Nope", status: null, summary: null },
    ]);
  });

  it("fills a base from a repo map on the payload only when the item has no association", () => {
    const { bases } = normalizeWorkingSetPayload({
      openproject: {
        "Example/Demo": { name: "From map", html_url: "https://op.example/projects/demo", status: "active" },
        "example/other": alpha,
      },
      items: [
        { repo: "example/demo", surface: "codex" },
        {
          repo: "example/other",
          associations: {
            openproject: { name: "On the item", href: "https://op.example/projects/item", description: "Item wins." },
          },
        },
      ],
    });
    const demo = bases.find((base) => repoKey(base.repo) === "example/demo");
    const other = bases.find((base) => repoKey(base.repo) === "example/other");
    expect(demo?.openProject).toEqual({
      href: "https://op.example/projects/demo",
      name: "From map",
      status: "active",
      summary: null,
    });
    expect(other?.openProject?.name).toBe("On the item");
    expect(other?.openProject?.summary).toBe("Item wins.");
  });

  it("shows the fixture project on mirmicode and none on an empty camp", () => {
    const snapshot = loadFixture();
    const mirmicode = snapshot.bases.find((base) => repoKey(base.repo) === "asymetryk/mirmicode");
    const empty = snapshot.bases.find((base) => base.units.length === 0);
    expect(mirmicode?.openProject).toMatchObject({
      name: "Mirmicode",
      status: "on track",
      href: "https://example.com/openproject/projects/mirmicode",
    });
    expect(empty?.units).toEqual([]);
    expect(empty?.openProject).toBeNull();
  });
});
