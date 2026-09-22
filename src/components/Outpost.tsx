import { outpostSrc } from "../rtsArt";

type OutpostProps = {
  faction: string | null;
  selected: boolean;
  attached: boolean;
};

export function Outpost({ faction, selected, attached }: OutpostProps) {
  const src = faction ? outpostSrc(faction) : null;
  const className = [
    "outpost-sprite",
    selected ? "is-selected" : "",
    attached ? "is-attached" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={className} data-faction={faction ?? "other"}>
      {selected ? <span className="ring" /> : null}
      {src ? <img src={src} alt="" draggable={false} /> : <span className="outpost-fallback" />}
    </span>
  );
}
