import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  STALE_SNAPSHOT_BANNER,
  WORKING_SET_SOURCE_KEY,
  WORKING_SET_URL_KEY,
  readStartupWorkingSetUrl,
  resolveSnapshot,
} from "./adapters/source";
import { Inspector } from "./components/Inspector";
import { Legend } from "./components/Legend";
import { MapStage } from "./components/MapStage";
import { positionBases } from "./layout";
import { DEFAULT_NOISE_FILTER, applyNoiseFilter, type NoiseFilter } from "./mapNoise";
import type { MapSnapshot } from "./types";

const HIDE_NOISE_KEY = "mirmicode.hideNoise";
const HIDE_DETACHED_KEY = "mirmicode.hideDetached";
const HIDE_ARCHIVED_KEY = "mirmicode.hideArchived";

export function App() {
  const [urlDraft, setUrlDraft] = useState(readStartupUrl);
  const [snapshot, setSnapshot] = useState<MapSnapshot | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<NoiseFilter>(readNoiseFilter);
  const requestVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const version = ++requestVersion.current;
    void apply(readStartupUrl(), (next, reason) => {
      if (cancelled || version !== requestVersion.current) return;
      setSnapshot(next);
      setFallbackReason(reason);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAttached(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(
    () => applyNoiseFilter(snapshot?.bases ?? [], filter),
    [snapshot, filter],
  );

  useEffect(() => {
    if (!snapshot || !selectedBaseId) return;
    const base = filtered.bases.find((entry) => entry.id === selectedBaseId);
    if (!base) {
      setSelectedBaseId(null);
      setSelectedUnitId(null);
      setAttached(false);
      return;
    }
    if (selectedUnitId && !base.units.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(null);
    }
  }, [snapshot, filtered.bases, selectedBaseId, selectedUnitId]);

  const positioned = useMemo(
    () => positionBases(filtered.bases),
    [filtered],
  );
  const selected = positioned.find((base) => base.id === selectedBaseId) ?? null;
  const selectedUnit = selected?.units.find((unit) => unit.id === selectedUnitId) ?? null;

  async function onLoadUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = urlDraft.trim();
    remember(url);
    const version = ++requestVersion.current;
    setLoading(true);
    await apply(url, (next, reason) => {
      if (version !== requestVersion.current) return;
      setSnapshot(next);
      setFallbackReason(reason);
      setLoading(false);
    });
  }

  function onUseFixture() {
    remember("");
    setUrlDraft("");
    const version = ++requestVersion.current;
    setLoading(true);
    void apply("", (next, reason) => {
      if (version !== requestVersion.current) return;
      setSnapshot(next);
      setFallbackReason(reason);
      setLoading(false);
    });
  }

  function onToggleAttach() {
    if (!selected) return;
    setAttached((value) => !value);
  }

  const status = statusLine(snapshot, loading, positioned, filtered.hiddenCount);
  const staleNote = snapshot?.stale ? STALE_SNAPSHOT_BANNER : null;

  function onHideNoise(value: boolean) {
    setFilter((current) => ({ ...current, hideNoise: value }));
    writeFlag(HIDE_NOISE_KEY, value);
  }

  function onHideDetached(value: boolean) {
    setFilter((current) => ({ ...current, hideDetached: value }));
    writeFlag(HIDE_DETACHED_KEY, value);
  }

  function onHideArchived(value: boolean) {
    setFilter((current) => ({ ...current, hideArchived: value }));
    writeFlag(HIDE_ARCHIVED_KEY, value);
  }

  const banner = [fallbackReason, staleNote, snapshot?.notice].filter(Boolean).join(" ") || null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Mirmicode</h1>
          <p className="tagline">Macro the project. Micro the agents.</p>
        </div>
        <div className="topbar-meta">
          <p className="status" role="status">
            {status}
          </p>
          <p className="public-note">Build in public. Not monetized.</p>
        </div>
        {banner ? (
          <p className="banner" role={fallbackReason || staleNote ? "alert" : "status"}>
            {banner}
          </p>
        ) : null}
      </header>
      <Legend
        bases={positioned}
        hideNoise={filter.hideNoise}
        hideDetached={filter.hideDetached}
        hideArchived={filter.hideArchived}
        hiddenCount={filtered.hiddenCount}
        onHideNoise={onHideNoise}
        onHideDetached={onHideDetached}
        onHideArchived={onHideArchived}
      />
      <MapStage
        key={`${snapshot?.source ?? "pending"}:${snapshot?.fetchedAt ?? "0"}`}
        bases={positioned}
        selectedBaseId={selectedBaseId}
        selectedUnitId={selectedUnitId}
        attached={attached && selected !== null}
        onSelectBase={(id) => {
          setSelectedBaseId(id);
          setSelectedUnitId(null);
        }}
        onSelectUnit={(baseId, unitId) => {
          setSelectedBaseId(baseId);
          setSelectedUnitId(unitId);
        }}
      />
      <Inspector
        base={selected}
        unit={selectedUnit}
        attached={attached && selected !== null}
        now={now}
        fetchedAt={snapshot?.fetchedAt ?? null}
        sourceLabel={status}
        urlDraft={urlDraft}
        loading={loading}
        onUrlDraft={setUrlDraft}
        onLoadUrl={onLoadUrl}
        onUseFixture={onUseFixture}
        onToggleAttach={onToggleAttach}
        onSelectUnit={(baseId, unitId) => {
          setSelectedBaseId(baseId);
          setSelectedUnitId(unitId);
        }}
      />
    </div>
  );
}

function statusLine(
  snapshot: MapSnapshot | null,
  loading: boolean,
  visible: { units: unknown[] }[],
  hiddenCount: number,
): string {
  if (loading && !snapshot) return "Loading bases…";
  if (!snapshot) return "No snapshot";
  const units = visible.reduce((sum, base) => sum + base.units.length, 0);
  const hidden = hiddenCount > 0 ? ` · ${hiddenCount} hidden` : "";
  const count = `${visible.length} ${visible.length === 1 ? "base" : "bases"} · ${units} units${hidden}`;
  if (loading) return `Loading… · ${count}`;
  if (snapshot.source === "working-set") return `Live Working Set · ${count}`;
  return `Fixture · sample data · ${count}`;
}

function readNoiseFilter(): NoiseFilter {
  return {
    hideNoise: readFlag(HIDE_NOISE_KEY, DEFAULT_NOISE_FILTER.hideNoise),
    hideDetached: readFlag(HIDE_DETACHED_KEY, DEFAULT_NOISE_FILTER.hideDetached),
    hideArchived: readFlag(HIDE_ARCHIVED_KEY, DEFAULT_NOISE_FILTER.hideArchived),
  };
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    if (value === "0") return false;
    if (value === "1") return true;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage can be blocked. The current view still updates in memory.
  }
}

async function apply(
  url: string,
  commit: (snapshot: MapSnapshot, fallbackReason: string | null) => void,
): Promise<void> {
  const result = await resolveSnapshot(url);
  commit(result.snapshot, result.fallbackReason);
}

function readStartupUrl(): string {
  const envUrl = import.meta.env.VITE_WORKING_SET_URL;
  try {
    return readStartupWorkingSetUrl(envUrl, localStorage);
  } catch {
    return readStartupWorkingSetUrl(envUrl, null);
  }
}

function remember(url: string): void {
  try {
    if (url.trim()) {
      localStorage.setItem(WORKING_SET_URL_KEY, url.trim());
      localStorage.setItem(WORKING_SET_SOURCE_KEY, "working-set");
      return;
    }
    localStorage.removeItem(WORKING_SET_URL_KEY);
    localStorage.setItem(WORKING_SET_SOURCE_KEY, "fixture");
  } catch {
    // Storage can be blocked. The current view still updates in memory.
  }
}
