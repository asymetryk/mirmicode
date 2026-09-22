import { postureOf } from "../factions";
import { harnessSlug } from "../format";
import { glyphSrc, heroSrc } from "../rtsArt";

type UnitFigureProps = {
  harness: string;
  model: string;
  status: string | null;
  selected?: boolean;
};

export function UnitFigure({ harness, model, status, selected = false }: UnitFigureProps) {
  const hero = heroSrc(harness);
  const glyph = glyphSrc(model);
  const posture = postureOf(status);

  return (
    <span
      className="unit-sprite"
      data-faction={harnessSlug(harness)}
      data-posture={posture}
    >
      {selected ? <span className="ring" /> : null}
      {hero ? (
        <img className="hero" src={hero} alt="" draggable={false} />
      ) : (
        <span className="hero-fallback" />
      )}
      {glyph ? <img className="glyph" src={glyph} alt="" draggable={false} /> : null}
      {posture === "blocked" ? <span className="block-slash" /> : null}
    </span>
  );
}
