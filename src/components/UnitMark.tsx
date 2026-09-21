import type { ReactNode } from "react";
import { unitKind, type UnitKind } from "../factions";

export function UnitMark({ model }: { model: string }) {
  return (
    <svg className="unit-mark" viewBox="0 0 16 16" aria-hidden="true">
      {shape(unitKind(model))}
    </svg>
  );
}

function shape(kind: UnitKind): ReactNode {
  switch (kind) {
    case "astra":
      return <polygon points="8,1.5 14.5,14 1.5,14" />;
    case "luna":
      return <path d="M10.2 2.2a5.6 5.6 0 1 0 .2 11.2 4.3 4.3 0 1 1-.2-11.2z" />;
    case "terra":
      return <rect x="2.5" y="2.5" width="11" height="11" />;
    case "sol":
      return (
        <>
          <circle cx="8" cy="8" r="3" />
          <path
            d="M8 1.2v2.3M8 12.5v2.3M1.2 8h2.3M12.5 8h2.3M3.2 3.2l1.6 1.6M11.2 11.2l1.6 1.6M12.8 3.2l-1.6 1.6M4.8 11.2l-1.6 1.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </>
      );
    case "grok":
      return <polygon points="8,1.2 14.2,4.7 14.2,11.3 8,14.8 1.8,11.3 1.8,4.7" />;
    case "gemini":
      return (
        <>
          <rect x="2.4" y="1.8" width="3.4" height="12.4" />
          <rect x="10.2" y="1.8" width="3.4" height="12.4" />
        </>
      );
    case "minimax":
      return (
        <path
          d="M2 4.2h12M2 8h12M2 11.8h12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      );
    case "kimi":
      return (
        <path
          d="M2.5 5.2 8 11.2 13.5 5.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      );
    default:
      return <circle cx="8" cy="8" r="4" />;
  }
}
