import { postureOf, type Posture } from "../factions";
import { harnessSlug } from "../format";
import { glyphSrc, heroSrc, markerSrc, unitSrc } from "../rtsArt";
import { Cutout } from "./Cutout";

type UnitFigureProps = {
  harness: string;
  model: string;
  status: string | null;
  selected?: boolean;
  /** Ground idle/work marker. Off in the legend and roster so those stay compact. */
  showMarker?: boolean;
};

export function UnitFigure({
  harness,
  model,
  status,
  selected = false,
  showMarker = false,
}: UnitFigureProps) {
  const v2 = unitSrc(harness, model);
  const src = v2 ?? heroSrc(harness);
  const glyph = v2 ? null : glyphSrc(model);
  const posture = postureOf(status);
  const marker = showMarker ? markerFor(harness, posture) : null;

  return (
    <span className="unit-sprite" data-faction={harnessSlug(harness)} data-posture={posture}>
      {selected ? <span className="ring" /> : null}
      {marker ? <Cutout className="fx-marker" src={marker} /> : null}
      {src ? <Cutout className="hero" src={src} /> : <span className="hero-fallback" />}
      {glyph ? <img className="glyph" src={glyph} alt="" draggable={false} /> : null}
      {posture === "blocked" ? <span className="block-slash" /> : null}
    </span>
  );
}

function markerFor(harness: string, posture: Posture): string | null {
  if (posture === "working") return markerSrc(harness, "working");
  if (posture === "idle") return markerSrc(harness, "idle");
  return null;
}
