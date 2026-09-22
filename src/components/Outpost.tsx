import { buildingSrc, outpostSrc } from "../rtsArt";
import { Cutout } from "./Cutout";

type OutpostProps = {
  faction: string | null;
  selected: boolean;
  attached: boolean;
};

export function Outpost({ faction, selected, attached }: OutpostProps) {
  const src =
    buildingSrc(faction, "pad") ??
    (faction ? outpostSrc(faction) : null) ??
    buildingSrc(null, "depot");
  const className = ["outpost-sprite", selected ? "is-selected" : "", attached ? "is-attached" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={className} data-faction={faction ?? "other"}>
      {selected ? <span className="ring" /> : null}
      {src ? <Cutout src={src} /> : <span className="outpost-fallback" />}
    </span>
  );
}
