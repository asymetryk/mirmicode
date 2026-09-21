import type { ReactNode } from "react";
import { postureOf, unitKind, type UnitKind } from "../factions";
import { harnessSlug } from "../format";

type UnitFigureProps = {
  harness: string;
  model: string;
  status: string | null;
  selected?: boolean;
};

export function UnitFigure({ harness, model, status, selected = false }: UnitFigureProps) {
  const faction = harnessSlug(harness);
  const posture = postureOf(status);
  const kind = unitKind(model);
  const shift = posture === "working" ? -4 : posture === "blocked" ? 7 : 2;

  return (
    <svg className="unit-figure-svg" viewBox="0 0 36 52" aria-hidden="true">
      {selected ? (
        <ellipse className="ring-stroke" cx="18" cy="28" rx="15.5" ry="22" />
      ) : null}
      {body(faction)}
      <g transform={`translate(0 ${shift})`}>{weapon(faction, kind)}</g>
      {posture === "working" ? <path className="stroke" d="M11 5.5 Q18 1 25 5.5" /> : null}
      {posture === "blocked" ? <path className="block-stroke" d="M7 12 L29 44" /> : null}
    </svg>
  );
}

function body(faction: string): ReactNode {
  if (faction === "cursor") {
    return (
      <g>
        <polygon points="18,2 23,9 18,12 13,9" />
        <polygon points="6,14 13,11 23,11 30,14 28,19 8,19" />
        <polygon points="10,19 26,19 24,33 12,33" />
        <polygon points="12,33 17,33 16,49 11,49" />
        <polygon points="19,33 24,33 25,49 20,49" />
      </g>
    );
  }
  if (faction === "codex") {
    return (
      <g>
        <path d="M18 9 C27 6 33 16 30 27 C28 38 23 44 17 43 C9 41 5 31 8 20 C10 11 12 8 18 9 Z" />
        <path d="M9 24 L3 17 L2 22 L8 29 Z" />
        <path className="stroke" d="M16 43 Q12 50 5 47" />
      </g>
    );
  }
  if (faction === "ohmypi") {
    return (
      <g>
        <rect x="12" y="4" width="12" height="9" />
        <rect className="cutout" x="14" y="7" width="8" height="3" />
        <rect x="9" y="13" width="18" height="16" />
        <rect x="3" y="13" width="7" height="7" />
        <rect x="26" y="13" width="7" height="7" />
        <rect x="11" y="29" width="5" height="16" />
        <rect x="20" y="29" width="5" height="16" />
      </g>
    );
  }
  return (
    <g>
      <circle cx="18" cy="12" r="5" />
      <rect x="14" y="18" width="8" height="16" />
      <rect x="10" y="34" width="4" height="14" />
      <rect x="22" y="34" width="4" height="14" />
    </g>
  );
}

function weapon(faction: string, kind: UnitKind): ReactNode {
  if (faction === "cursor") {
    if (kind === "gemini") {
      return (
        <g>
          <polygon points="24,15 27,3 29,5 26,16" />
          <polygon points="29,17 33,5 35,7 31,18" />
        </g>
      );
    }
    return <polygon points="26,16 34,1 37,4 29,20" />;
  }
  if (faction === "codex") {
    if (kind === "luna") return <path d="M8 20 C0 12 1 30 10 32 C4 26 5 18 8 20 Z" />;
    if (kind === "terra") return <polygon points="6,24 0,30 3,38 12,32" />;
    if (kind === "sol") {
      return (
        <g>
          <polygon points="18,8 16,0 20,8" />
          <polygon points="26,10 34,4 28,14" />
          <polygon points="10,10 2,4 8,14" />
        </g>
      );
    }
    if (kind === "astra") {
      return (
        <g>
          <polygon points="18,8 16,0 20,8" />
          <polygon points="24,9 31,2 26,12" />
          <polygon points="12,9 5,2 10,12" />
        </g>
      );
    }
    return <path d="M30 22 L36 14 L35 26 Z" />;
  }
  if (faction === "ohmypi") {
    if (kind === "minimax") return <rect x="30" y="16" width="14" height="4" />;
    if (kind === "astra") {
      return (
        <g>
          <rect x="28" y="10" width="6" height="12" />
          <polygon points="28,10 31,4 34,10" />
        </g>
      );
    }
    if (kind === "sol") {
      return (
        <g>
          <circle cx="31" cy="12" r="4" />
          <path className="stroke" d="M31 4 V7 M25 12 H28 M34 12 H37 M27 7 L29 9" />
        </g>
      );
    }
    if (kind === "kimi") {
      return (
        <g>
          <rect x="30" y="18" width="12" height="2.4" />
          <polygon points="42,16 46,19 42,22" />
        </g>
      );
    }
    return <rect x="30" y="17" width="10" height="3" />;
  }
  return <polygon points="24,18 32,10 34,14 26,22" />;
}
