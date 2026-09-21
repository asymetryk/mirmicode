import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { formatLastTouched, harnessSlug } from "../format";
import { WORLD, fitView, clamp, type PositionedBase } from "../layout";
import type { ViewState } from "../types";
import { Minimap } from "./Minimap";

type MapStageProps = {
  bases: PositionedBase[];
  selectedId: string | null;
  attached: boolean;
  now: number;
  onSelect: (id: string) => void;
};

export function MapStage({ bases, selectedId, attached, now, onSelect }: MapStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const suppressClick = useRef(false);
  const [view, setView] = useState<ViewState>({ x: 48, y: 48, scale: 1 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  const dragRef = useRef<DragState | null>(null);
  viewRef.current = view;

  const focus = attached ? (bases.find((base) => base.id === selectedId) ?? null) : null;
  const focusRef = useRef(focus);
  const attachedRef = useRef(attached);
  focusRef.current = focus;
  attachedRef.current = attached;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setViewport({ w: rect.width, h: rect.height });
      if (!fitted.current && bases.length > 0 && rect.width > 20 && rect.height > 20) {
        setView(fitView(bases, rect.width, rect.height));
        fitted.current = true;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [bases]);

  useLayoutEffect(() => {
    if (!attached || !focus) return;
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setView((current) => {
      const x = rect.width / 2 - focus.x * current.scale;
      const y = rect.height / 2 - focus.y * current.scale;
      if (Math.abs(current.x - x) < 0.5 && Math.abs(current.y - y) < 0.5) return current;
      return { scale: current.scale, x, y };
    });
  }, [attached, focus]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if ((event.target as HTMLElement | null)?.closest(".minimap")) return;
      const current = viewRef.current;
      const rect = el.getBoundingClientRect();
      const nextScale = clamp(current.scale * (event.deltaY > 0 ? 0.92 : 1.08), 0.35, 2);
      const locked = attachedRef.current ? focusRef.current : null;
      if (locked) {
        setView({
          scale: nextScale,
          x: rect.width / 2 - locked.x * nextScale,
          y: rect.height / 2 - locked.y * nextScale,
        });
        return;
      }
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      setView({
        scale: nextScale,
        x: px - worldX * nextScale,
        y: py - worldY * nextScale,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function jumpTo(nx: number, ny: number) {
    const el = stageRef.current;
    if (!el || attached) return;
    const rect = el.getBoundingClientRect();
    const worldX = nx * WORLD.width;
    const worldY = ny * WORLD.height;
    setView((current) => ({
      scale: current.scale,
      x: rect.width / 2 - worldX * current.scale,
      y: rect.height / 2 - worldY * current.scale,
    }));
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (attached || event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".minimap")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-base-id]");
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      viewX: viewRef.current.x,
      viewY: viewRef.current.y,
      moved: false,
      baseId: card?.dataset.baseId ?? null,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.originX;
    const dy = event.clientY - drag.originY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    setDragging(true);
    setView({
      ...viewRef.current,
      x: drag.viewX + dx,
      y: drag.viewY + dy,
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (drag.moved) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      return;
    }
    if (drag.baseId) onSelect(drag.baseId);
  }

  function onCardClick(id: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSelect(id);
  }

  const hint = focus
    ? `Attached to ${focus.repo}. Detach to pan.`
    : "Drag to pan. Scroll to zoom. Select a base, then attach to lock the view.";

  return (
    <div
      ref={stageRef}
      className={["map-stage", dragging ? "is-dragging" : "", attached ? "is-attached" : ""]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="map-world"
        style={{
          width: WORLD.width,
          height: WORLD.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        <p className="world-mark">Bases</p>
        {bases.map((base) => {
          const selected = base.id === selectedId;
          const className = [
            "base-card",
            selected ? "is-selected" : "",
            selected && attached ? "is-attached" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={base.id}
              type="button"
              className={className}
              data-base-id={base.id}
              data-harness={harnessSlug(base.harness)}
              aria-pressed={selected}
              style={{ left: base.x, top: base.y }}
              onClick={() => onCardClick(base.id)}
            >
              <CardField label="Repo" value={base.repo} />
              <CardField label="Label" value={base.label ?? "—"} />
              <CardField label="Thread" value={base.threadName ?? "—"} />
              <span className="card-split">
                <CardField label="Harness" value={base.harness} />
                <CardField label="Model" value={base.model} />
              </span>
              <CardField label="Last touched" value={formatLastTouched(base.updatedAt, now)} />
            </button>
          );
        })}
      </div>
      {bases.length === 0 ? <p className="map-empty">No bases in this snapshot.</p> : null}
      <p className="map-hint">{hint}</p>
      <Minimap
        bases={bases}
        selectedId={selectedId}
        view={view}
        viewport={viewport}
        attached={attached}
        onJump={jumpTo}
      />
    </div>
  );
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <span className="card-field">
      <span className="card-label">{label}</span>
      <span className={value === "unknown" || value === "—" ? "card-value is-empty" : "card-value"}>
        {value}
      </span>
    </span>
  );
}

type DragState = {
  pointerId: number;
  originX: number;
  originY: number;
  viewX: number;
  viewY: number;
  moved: boolean;
  baseId: string | null;
};
