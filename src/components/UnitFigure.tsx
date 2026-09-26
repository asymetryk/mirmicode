import { harnessSlug } from "../format";
import { glyphSrc, heroSrc, unitSrc } from "../rtsArt";
import type { CSSProperties } from "react";
import { Cutout } from "./Cutout";

type UnitFigureProps = {
  harness: string;
  model: string;
  status: string | null;
  selected?: boolean;
  appearanceRole?: string | null;
  accentColor?: string | null;
  /** Ground idle/work marker. Off in the legend and roster so those stay compact. */
  showMarker?: boolean;
};

export function UnitFigure({
  harness,
  model,
  status,
  selected = false,
  appearanceRole,
  accentColor,
  showMarker = false,
}: UnitFigureProps) {
  const chosenRole = appearanceRole ?? model;
  const v2 = unitSrc(harness, chosenRole);
  const src = v2 ?? heroSrc(harness);
  const glyph = v2 ? null : glyphSrc(model);
  const posture = visualPosture(status);

  return (
    <span
      className="unit-sprite"
      data-faction={harnessSlug(harness)}
      data-posture={posture}
      style={accentColor ? { "--shared-unit-color": accentColor } as CSSProperties : undefined}
    >
      {selected ? <span className="ring" /> : null}
      {showMarker && posture === "working" ? <span className="working-ground" aria-hidden="true" /> : null}
      {showMarker && posture === "idle" ? <span className="idle-ground" aria-hidden="true" /> : null}
      {src ? <Cutout className="hero" src={src} /> : <span className="hero-fallback" />}
      {glyph ? <img className="glyph" src={glyph} alt="" draggable={false} /> : null}
      {posture === "completed" ? <span className="complete-mark" aria-hidden="true">✓</span> : null}
      {posture === "blocked" ? <span className="block-slash" /> : null}
    </span>
  );
}

export function visualPosture(status: string | null): "working" | "blocked" | "idle" | "completed" | "unknown" {
  const key = (status ?? "").trim().toLowerCase();
  if (["working", "active", "busy"].includes(key)) return "working";
  if (["blocked", "queued", "stuck", "error", "needs-attention", "needs attention", "attention"].includes(key)) return "blocked";
  if (["done", "complete", "completed"].includes(key)) return "completed";
  if (key === "idle") return "idle";
  return "unknown";
}
