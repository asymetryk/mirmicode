import { useEffect, useState } from "react";
import { cutoutUrl } from "../cutout";

type CutoutProps = {
  src: string;
  className?: string;
};

/** Painted subject with the flat v2 backdrop removed. v1 art is unchanged. */
export function Cutout({ src, className }: CutoutProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setUrl(null);
    void cutoutUrl(src).then((next) => {
      if (live) setUrl(next);
    });
    return () => {
      live = false;
    };
  }, [src]);

  if (!url) return <span className={className ? `${className} is-pending` : "is-pending"} aria-hidden="true" />;
  return <img className={className} src={url} alt="" draggable={false} />;
}
