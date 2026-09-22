/**
 * Write src/data/all-repos.json from a Developer scan, a camps array, or a live
 * ~/Developer directory. Invoked by scripts/refresh-developer-camps.sh.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCampCatalog,
  campsFromScanDocument,
  originOwnerName,
  type DeveloperCampInput,
} from "../src/developerCamps.ts";

const args = process.argv.slice(2);

function flag(name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

const inputPath = flag("--input");
const root = flag("--root");
const outPath = flag("--out");
const fetchedOn = flag("--fetched-on");
const detail = flag("--detail") ?? undefined;
if ((!inputPath && !root) || !outPath || !fetchedOn) {
  process.stderr.write(
    "usage: write-developer-catalog.ts (--input scan.json | --root ~/Developer) --out all-repos.json --fetched-on YYYY-MM-DD [--detail text]\n",
  );
  process.exit(1);
}

const camps = root ? campsFromDeveloperRoot(root) : readCamps(JSON.parse(readFileSync(inputPath ?? "", "utf8")) as unknown);
const catalog = buildCampCatalog(camps, { fetchedOn, detail });
writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
process.stdout.write(`${catalog.repos.length}\n`);

function campsFromDeveloperRoot(developerRoot: string): DeveloperCampInput[] {
  const camps: DeveloperCampInput[] = [];
  for (const entry of readdirSync(developerRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const dir = join(developerRoot, entry.name);
    const hasGit = existsSync(join(dir, ".git"));
    let remote: string | null = null;
    if (hasGit) {
      try {
        remote = execFileSync("git", ["-C", dir, "remote", "get-url", "origin"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch {
        remote = null;
      }
    }
    camps.push({ folder: entry.name, repo: originOwnerName(remote), hasGit });
  }
  return camps;
}

function readCamps(doc: unknown): DeveloperCampInput[] {
  if (Array.isArray(doc)) return doc.flatMap(readCamp);
  if (doc && typeof doc === "object" && Array.isArray((doc as { folders?: unknown }).folders)) {
    return ((doc as { folders: unknown[] }).folders).flatMap(readCamp);
  }
  return campsFromScanDocument(doc);
}

function readCamp(row: unknown): DeveloperCampInput[] {
  if (!row || typeof row !== "object") return [];
  const item = row as Record<string, unknown>;
  const folder = typeof item.folder === "string" ? item.folder : "";
  if (!folder.trim()) return [];
  const remote = typeof item.remote === "string" ? item.remote : null;
  const parsedRepo = originOwnerName(remote);
  const repo = parsedRepo ?? (typeof item.repo === "string" ? item.repo : null);
  return [{ folder, repo, hasGit: item.hasGit === true || item.has_git === true }];
}
