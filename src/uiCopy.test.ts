import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readTsx(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return [readTsx(path)];
      if (!entry.name.endsWith(".tsx")) return [];
      return [readFileSync(path, "utf8")];
    })
    .join("\n");
}

describe("ui copy", () => {
  const ui = [readTsx("src/components"), readFileSync("src/App.tsx", "utf8")].join("\n");

  it("does not render branch labels", () => {
    expect(ui).not.toMatch(/\bbranch\b/i);
  });

  it("does not show the bare omp token as text", () => {
    expect(ui).not.toMatch(/>\s*omp\s*</i);
  });
});
