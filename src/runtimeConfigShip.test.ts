import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stub = "window.__MIRMICODE__ = window.__MIRMICODE__ || {};";

describe("runtime-config.js stub", () => {
  it("ships a harmless default that Vite copies into dist", () => {
    const src = readFileSync(new URL("../public/runtime-config.js", import.meta.url), "utf8");
    expect(src).toContain(stub);
    expect(src).not.toMatch(/publicMode:\s*true/);
  });
});

describe("Caddyfile /runtime-config.js", () => {
  const caddy = readFileSync(
    new URL("../deploy/k3s/mirmicode/Caddyfile.template", import.meta.url),
    "utf8",
  );

  it("serves the script without SPA fallback and marks it no-store", () => {
    const start = caddy.indexOf("handle /runtime-config.js");
    const end = caddy.indexOf("handle {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = caddy.slice(start, end);
    expect(block).toContain('Cache-Control "no-store"');
    expect(block).toContain('Content-Type "application/javascript; charset=utf-8"');
    expect(block).toContain("file_server");
    expect(block).not.toContain("try_files");
  });

  it("keeps the private Working Set TLS proxy in the template", () => {
    expect(caddy).toContain("reverse_proxy https://{$FORWARD_LISTEN}");
    expect(caddy).toContain("try_files {path} /index.html");
  });
});
