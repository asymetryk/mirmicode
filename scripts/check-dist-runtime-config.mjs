import { readFileSync } from "node:fs";

const path = "dist/runtime-config.js";
const src = readFileSync(path, "utf8");
const stub = "window.__MIRMICODE__ = window.__MIRMICODE__ || {};";
if (!src.includes(stub)) {
  console.error(`${path} is missing the default stub (${stub})`);
  process.exit(1);
}
console.log(`${path} stub ok`);
