import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UnitFigure } from "./components/UnitFigure";

describe("unit status markers", () => {
  it("renders CSS ground rings instead of the opaque working and idle FX images", () => {
    const markup = renderToStaticMarkup(createElement(UnitFigure, {
      harness: "codex",
      model: "Luna",
      status: "working",
      showMarker: true,
    }));
    const idleMarkup = renderToStaticMarkup(createElement(UnitFigure, {
      harness: "codex",
      model: "Luna",
      status: "idle",
      showMarker: true,
    }));

    expect(markup).toContain('data-posture="working"');
    expect(markup).toContain("working-ground");
    expect(markup).not.toContain("fx-marker");
    expect(idleMarkup).toContain('data-posture="idle"');
    expect(idleMarkup).toContain("idle-ground");
    expect(idleMarkup).not.toContain("fx-marker");
  });

  it("keeps completed and blocked indicators distinct", () => {
    const completed = renderToStaticMarkup(createElement(UnitFigure, {
      harness: "codex",
      model: "Luna",
      status: "completed",
    }));
    const blocked = renderToStaticMarkup(createElement(UnitFigure, {
      harness: "codex",
      model: "Luna",
      status: "blocked",
    }));

    expect(completed).toContain('data-posture="completed"');
    expect(completed).toContain("complete-mark");
    expect(blocked).toContain('data-posture="blocked"');
    expect(blocked).toContain("block-slash");
  });
});
