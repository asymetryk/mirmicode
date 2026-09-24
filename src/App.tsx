import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  STALE_SNAPSHOT_BANNER,
  WORKING_SET_SOURCE_KEY,
  WORKING_SET_URL_KEY,
  loadFixture,
  readStartupWorkingSetUrl,
  resolveSnapshot,
} from "./adapters/source";
import { loadNativeFeedFixture, loadNativeFeedServer } from "./adapters/nativeFeed";
import campDossiers from "./data/camp-dossiers.json";
import { CampDossierPanel } from "./components/CampDossierPanel";
import { MapStage } from "./components/MapStage";
import { MapHud } from "./components/MapHud";
import { SelectionPopover } from "./components/SelectionPopover";
import { SideRail } from "./components/SideRail";
import { resolveDossier } from "./dossier";
import { positionBases } from "./layout";
import { DEFAULT_NOISE_FILTER, applyNoiseFilter, type NoiseFilter } from "./mapNoise";
import type { CampDossierCatalog, MapSnapshot } from "./types";

const HIDE_NOISE_KEY = "mirmicode.hideNoise";
const HIDE_DETACHED_KEY = "mirmicode.hideDetached";
const HIDE_ARCHIVED_KEY = "mirmicode.hideArchived";
const RAIL_OPEN_KEY = "mirmicode.railOpen";

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
  const [railOpen, setRailOpen] = useState(readRailOpen);
  const requestVersion = useRef(0);

  const dossierCatalog = campDossiers as CampDossierCatalog;

  useEffect(() => {
    let cancelled = false;
    const version = ++requestVersion.current;
    const commit = (next: MapSnapshot, reason: string | null) => {
      if (cancelled || version !== requestVersion.current) return;
      setSnapshot(next);
      setFallbackReason(reason);
      setLoading(false);
    };
    if (useServerFeed()) {
      void loadServer(commit);
      const timer = window.setInterval(() => {
        void loadNativeFeedServer().then((next) => {
          if (!cancelled && version === requestVersion.current) {
            setSnapshot(next);
            setFallbackReason(null);
          }
        }).catch(() => {
          if (!cancelled && version === requestVersion.current) {
            setFallbackReason("Mirmicode feed is unavailable; showing the last observation.");
          }
        });
      }, 15_000);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    } else if (useNativeFeed()) {
      void loadNative(commit);
    } else {
      void apply(readStartupUrl(), commit);
    }
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
      if (event.key !== "Escape") return;
      if (attached) {
        setAttached(false);
        return;
      }
      setSelectedBaseId(null);
      setSelectedUnitId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attached]);

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

  useEffect(() => {
    if (selectedBaseId) setRailOpen(true);
  }, [selectedBaseId]);

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

  function onClearSelection() {
    setSelectedBaseId(null);
    setSelectedUnitId(null);
    setAttached(false);
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

  function onRailOpen(value: boolean) {
    setRailOpen(value);
    writeFlag(RAIL_OPEN_KEY, value);
  }

  function refreshLiveSnapshot() {
    if (!useServerFeed()) return;
    void loadNativeFeedServer().then((next) => {
      setSnapshot(next);
      setFallbackReason(null);
    }).catch(() => {
      setFallbackReason("Mirmicode feed is unavailable; showing the last observation.");
    });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Mirmicode</h1>
          <p className="tagline">Macro the project. Micro the agents.</p>
        </div>
        <MapHud
          bases={positioned}
          sourceLabel={status}
          observedAt={snapshot?.fetchedAt ?? null}
          now={now}
        />
        <div className="topbar-meta">
          <p className="public-note">Build in public. Not monetized.</p>
        </div>
        {banner ? (
          <p className="banner" role={fallbackReason || staleNote ? "alert" : "status"}>
            {banner}
          </p>
        ) : null}
      </header>
      <div className={railOpen ? "stage-shell is-rail-open" : "stage-shell"}>
        <div className="map-frame">
          <MapStage
            key={snapshot?.source ?? "pending"}
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
            onClearSelection={onClearSelection}
          />
          {railOpen ? null : (
            <button
              type="button"
              className="rail-expand"
              aria-expanded={false}
              onClick={() => onRailOpen(true)}
            >
              Forces
            </button>
          )}
        </div>
        {railOpen ? (
          <SideRail
            inspector={selected ? <>
              <SelectionPopover
                base={selected}
                unit={selectedUnit}
                attached={attached && selected !== null}
                now={now}
                metadataRevision={snapshot?.metadataRevision ?? null}
                canEditMetadata={snapshot?.source === "mirmicode" && Boolean(selected.repoKey)}
                onRefreshSnapshot={refreshLiveSnapshot}
                onToggleAttach={onToggleAttach}
                onClose={onClearSelection}
                onSelectUnit={(baseId, unitId) => {
                  setSelectedBaseId(baseId);
                  setSelectedUnitId(unitId);
                }}
              />
              <CampDossierPanel
                base={selected}
                dossier={snapshot?.source === "mirmicode" ? null : resolveDossier(selected, dossierCatalog)}
                onClose={onClearSelection}
              />
            </> : null}
            bases={positioned}
            selectedBaseId={selectedBaseId}
            selectedUnitId={selectedUnitId}
            hideNoise={filter.hideNoise}
            hideDetached={filter.hideDetached}
            hideArchived={filter.hideArchived}
            hiddenCount={filtered.hiddenCount}
            fetchedAt={snapshot?.fetchedAt ?? null}
            sourceLabel={status}
            urlDraft={urlDraft}
            loading={loading}
            onHideNoise={onHideNoise}
            onHideDetached={onHideDetached}
            onHideArchived={onHideArchived}
            onCollapse={() => {
              onClearSelection();
              onRailOpen(false);
            }}
            onSelectBase={(id) => {
              setSelectedBaseId(id);
              setSelectedUnitId(null);
            }}
            onSelectUnit={(baseId, unitId) => {
              setSelectedBaseId(baseId);
              setSelectedUnitId(unitId);
            }}
            onUrlDraft={setUrlDraft}
            onLoadUrl={onLoadUrl}
            onUseFixture={onUseFixture}
          />
        ) : null}
      </div>
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
  if (snapshot.source === "mirmicode") return `Mirmicode live · ${count}`;
  if (snapshot.source === "native-feed") return `Native feed · ${count}`;
  return `Fixture · sample data · ${count}`;
}

function readRailOpen(): boolean {
  return readFlag(RAIL_OPEN_KEY, true);
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

async function loadNative(
  commit: (snapshot: MapSnapshot, fallbackReason: string | null) => void,
): Promise<void> {
  try {
    const snapshot = await loadNativeFeedFixture();
    commit(snapshot, null);
  } catch (error) {
    commit(loadFixtureForFallback(), readableReason(error));
  }
}

async function loadServer(
  commit: (snapshot: MapSnapshot, fallbackReason: string | null) => void,
): Promise<void> {
  try {
    commit(await loadNativeFeedServer(), null);
  } catch (error) {
    commit({ source: "mirmicode", fetchedAt: new Date().toISOString(), bases: [],
      stale: true, notice: "Waiting for a live Mirmicode feed." }, readableReason(error));
  }
}

function loadFixtureForFallback(): MapSnapshot {
  // Fallback when the native feed fails to load: keep the existing fixture
  // behavior so the UI never blanks. The fixture is independent of the
  // mirmicode-native contract and is not a cahq dependency.
  return loadFixture();
}

function readableReason(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Native feed fixture could not be reached.";
}

function useNativeFeed(): boolean {
  return (import.meta.env.VITE_FEED_SOURCE ?? "").trim().toLowerCase() === "native";
}

function useServerFeed(): boolean {
  return (import.meta.env.VITE_FEED_SOURCE ?? "").trim().toLowerCase() === "server";
}

function readStartupUrl(): string {
  if (useNativeFeed() || useServerFeed()) return "";
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
