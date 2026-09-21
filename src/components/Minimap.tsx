import type { MouseEvent } from "react";
import type { ViewState } from "../types";
import { WORLD, type PositionedBase, clamp } from "../layout";

type MinimapProps = {
  bases: PositionedBase[];
  selectedId: string | null;
  view: ViewState;
  viewport: { w: number; h: number };
  attached: boolean;
  onJump: (nx: number, ny: number) => void;
};

export function Minimap({
  bases,
  selectedId,
  view,
  viewport,
  attached,
  onJump,
}: MinimapProps) {
  const rect = viewportRect(view, viewport);

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    if (attached) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - bounds.left) / bounds.width;
    const ny = (event.clientY - bounds.top) / bounds.height;
    onJump(clamp(nx, 0, 1), clamp(ny, 0, 1));
  }

  return (
    <button
      type="button"
      className={attached ? "minimap is-locked" : "minimap"}
      aria-label={attached ? "Minimap, view attached" : "Minimap"}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      <span className="minimap-label">Minimap</span>
      <span className="minimap-field" aria-hidden="true">
        {bases.map((base) => (
          <span
            key={base.id}
            className={base.id === selectedId ? "mini-dot is-selected" : "mini-dot"}
            style={{
              left: `${(base.x / WORLD.width) * 100}%`,
              top: `${(base.y / WORLD.height) * 100}%`,
            }}
          />
        ))}
        {rect ? (
          <span
            className="mini-view"
            style={{
              left: `${rect.x}%`,
              top: `${rect.y}%`,
              width: `${rect.w}%`,
              height: `${rect.h}%`,
            }}
          />
        ) : null}
      </span>
    </button>
  );
}

function viewportRect(
  view: ViewState,
  viewport: { w: number; h: number },
): { x: number; y: number; w: number; h: number } | null {
  if (viewport.w <= 0 || viewport.h <= 0 || view.scale <= 0) return null;
  const x = ((-view.x / view.scale) / WORLD.width) * 100;
  const y = ((-view.y / view.scale) / WORLD.height) * 100;
  const w = (viewport.w / view.scale / WORLD.width) * 100;
  const h = (viewport.h / view.scale / WORLD.height) * 100;
  return { x, y, w, h };
}
