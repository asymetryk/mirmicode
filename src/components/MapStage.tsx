import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { postureOf, postureSignal, factionName } from "../factions";
import { drawsUnitTokens, unitEmphasis } from "../mapNoise";
import { harnessSlug, unitContext } from "../format";
import {
  BUILDING_KINDS,
  buildingSrc,
  dominantFaction,
  resourceSrc,
  roleLabel,
  unitRole,
} from "../rtsArt";
import {
  WORLD,
  fitView,
  clamp,
  unitSlot,
  BUILDING_OFFSET,
  RESOURCE_OFFSETS,
  resourcePlacements,
  type PositionedBase,
} from "../layout";
import type { ViewState } from "../types";
import { Cutout } from "./Cutout";
import { Minimap } from "./Minimap";
import { Outpost } from "./Outpost";
import { UnitFigure } from "./UnitFigure";

type MapStageProps = {
  bases: PositionedBase[];
  selectedBaseId: string | null;
  selectedUnitId: string | null;
  attached: boolean;
  onSelectBase: (id: string) => void;
  onSelectUnit: (baseId: string, unitId: string) => void;
};

export function MapStage({
  bases,
  selectedBaseId,
  selectedUnitId,
  attached,
  onSelectBase,
  onSelectUnit,
}: MapStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const suppressClick = useRef(false);
  const [view, setView] = useState<ViewState>({ x: 48, y: 48, scale: 1 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  const dragRef = useRef<DragState | null>(null);
  viewRef.current = view;

  const focus = attached ? (bases.find((base) => base.id === selectedBaseId) ?? null) : null;
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
      if ((event.target as HTMLElement | null)?.closest(".minimap, .legend")) return;
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
    const target = event.target as HTMLElement;
    if (target.closest(".minimap")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const unit = target.closest<HTMLElement>("[data-unit-id]");
    const base = target.closest<HTMLElement>("[data-base-id]");
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      viewX: viewRef.current.x,
      viewY: viewRef.current.y,
      moved: false,
      unitId: unit?.dataset.unitId ?? null,
      baseId: base?.dataset.baseId ?? null,
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
    if (drag.unitId && drag.baseId) onSelectUnit(drag.baseId, drag.unitId);
    else if (drag.baseId) onSelectBase(drag.baseId);
  }

  function onTokenClick(baseId: string, unitId: string | null) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (unitId) onSelectUnit(baseId, unitId);
    else onSelectBase(baseId);
  }

  const hint = focus
    ? `Attached to ${focus.repo}. Detach to pan.`
    : "Drag to pan. Scroll to zoom. Select a unit. Attach locks the view on its base.";

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
        {bases.map((base, baseIndex) => {
          const baseSelected = base.id === selectedBaseId;
          const faction = dominantFaction(base.units);
          const unassigned = !drawsUnitTokens(base.repo);
          return (
            <div
              key={base.id}
              className="base-site"
              data-unassigned={unassigned ? "true" : "false"}
              style={{ left: base.x, top: base.y }}
            >
              {unassigned
                ? null
                : BUILDING_KINDS.filter((kind) => kind !== "pad").map((kind) => {
                const src = buildingSrc(faction, kind);
                const slot = BUILDING_OFFSET[kind];
                if (!src) return null;
                return (
                  <span
                    key={kind}
                    className={`dressing building building-${kind}`}
                    style={{ left: slot.x, top: slot.y }}
                    aria-hidden="true"
                  >
                    <Cutout src={src} />
                  </span>
                );
              })}
              {unassigned
                ? null
                : resourcePlacements(baseIndex).map((prop) => {
                const slot = RESOURCE_OFFSETS[prop.slot];
                if (!slot) return null;
                return (
                  <span
                    key={`${prop.kind}-${prop.slot}`}
                    className={`dressing resource resource-${prop.kind}`}
                    style={{ left: slot.x, top: slot.y }}
                    aria-hidden="true"
                  >
                    <Cutout src={resourceSrc(faction, prop.kind)} />
                  </span>
                );
              })}
              <button
                type="button"
                className="outpost"
                data-base-id={base.id}
                data-count={unassigned ? base.units.length : undefined}
                aria-pressed={baseSelected && selectedUnitId === null}
                aria-label={unassigned ? `Unassigned, ${base.units.length} units` : undefined}
                onClick={() => onTokenClick(base.id, null)}
              >
                <Outpost faction={faction} selected={baseSelected} attached={baseSelected && attached} />
                <span className="outpost-name">{unassigned ? "Unassigned" : base.repo}</span>
                {unassigned ? <span className="unassigned-count">{base.units.length}</span> : null}
              </button>
              {unassigned
                ? null
                : base.units.map((unit, index) => {
                const slot = unitSlot(index, base.units.length);
                const selected = unit.id === selectedUnitId;
                const role = unitRole(unit.model);
                const typeLabel = role ? roleLabel(role) : unit.model;
                const typeBit =
                  role && typeLabel.toLowerCase() !== unit.model.toLowerCase()
                    ? `${typeLabel} (${unit.model})`
                    : unit.model;
                const posture = postureSignal(unit.status, unit.lifecycle);
                return (
                  <button
                    key={unit.id}
                    type="button"
                    className={selected ? "unit is-selected" : "unit"}
                    data-base-id={base.id}
                    data-unit-id={unit.id}
                    data-emphasis={unitEmphasis(unit, base.repo)}
                    data-faction={harnessSlug(unit.harness)}
                    data-posture={postureOf(posture)}
                    data-role={role ?? "other"}
                    aria-pressed={selected}
                    aria-label={`${factionName(unit.harness)} ${typeBit}, ${unit.status ?? "idle"}, on ${base.repo}`}
                    title={[`${factionName(unit.harness)} · ${unit.model}`, unitContext(unit)].filter(Boolean).join("\n")}
                    style={{ left: slot.x, top: 108 + slot.y }}
                    onClick={() => onTokenClick(base.id, unit.id)}
                  >
                    <span className="unit-figure">
                      <UnitFigure
                        harness={unit.harness}
                        model={unit.model}
                        status={posture}
                        selected={selected}
                        showMarker
                      />
                    </span>
                    <span className="unit-type">{typeLabel}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {bases.length === 0 ? <p className="map-empty">No bases in this snapshot.</p> : null}
      <p className="map-hint">{hint}</p>
      <Minimap
        bases={bases}
        selectedId={selectedBaseId}
        view={view}
        viewport={viewport}
        attached={attached}
        onJump={jumpTo}
      />
    </div>
  );
}

type DragState = {
  pointerId: number;
  originX: number;
  originY: number;
  viewX: number;
  viewY: number;
  moved: boolean;
  unitId: string | null;
  baseId: string | null;
};
