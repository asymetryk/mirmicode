type OutpostProps = {
  selected: boolean;
  attached: boolean;
};

export function Outpost({ selected, attached }: OutpostProps) {
  return (
    <svg className={selected ? "outpost-svg is-selected" : "outpost-svg"} viewBox="0 0 148 92" aria-hidden="true">
      <polygon className="pad" points="22,30 126,30 138,50 126,70 22,70 10,50" />
      <polyline className="wall" points="26,30 26,16 122,16 122,30" />
      <polyline className="wall" points="26,70 26,78 122,78 122,70" />
      <rect className="post" x="18" y="10" width="8" height="14" />
      <rect className="post" x="122" y="10" width="8" height="14" />
      <rect className="post" x="18" y="68" width="8" height="14" />
      <rect className="post" x="122" y="68" width="8" height="14" />
      <polygon className="node" points="74,24 88,36 74,48 60,36" />
      <line className={attached ? "antenna is-lit" : "antenna"} x1="74" y1="24" x2="74" y2="8" />
      <rect className={attached ? "antenna-cap is-lit" : "antenna-cap"} x="70" y="4" width="8" height="5" />
    </svg>
  );
}
