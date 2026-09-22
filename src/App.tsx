import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  WORKING_SET_SOURCE_KEY,
  WORKING_SET_URL_KEY,
  readStartupWorkingSetUrl,
  resolveSnapshot,
} from "./adapters/source";
import { Inspector } from "./components/Inspector";
import { Legend } from "./components/Legend";
import { MapStage } from "./components/MapStage";
import { positionBases } from "./layout";
import type { MapSnapshot } from "./types";

export function App() {
  const [urlDraft, setUrlDraft] = useState(readStartupUrl);
  const [snapshot, setSnapshot] = useState<MapSnapshot | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void apply(readStartupUrl(), (next, reason) => {
      if (cancelled) return;
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

  useEffect(() => {
    if (!snapshot || !selectedBaseId) return;
    const base = snapshot.bases.find((entry) => entry.id === selectedBaseId);
    if (!base) {
      setSelectedBaseId(null);
      setSelectedUnitId(null);
      setAttached(false);
      return;
    }
    if (selectedUnitId && !base.units.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(null);
    }
  }, [snapshot, selectedBaseId, selectedUnitId]);

  const positioned = useMemo(
    () => positionBases(snapshot?.bases ?? []),
    [snapshot],
  );
  const selected = positioned.find((base) => base.id === selectedBaseId) ?? null;
  const selectedUnit = selected?.units.find((unit) => unit.id === selectedUnitId) ?? null;

  async function onLoadUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = urlDraft.trim();
    remember(url);
    setLoading(true);
    await apply(url, (next, reason) => {
      setSnapshot(next);
      setFallbackReason(reason);
      setLoading(false);
    });
  }

  function onUseFixture() {
    remember("");
    setUrlDraft("");
    setLoading(true);
    void apply("", (next, reason) => {
      setSnapshot(next);
      setFallbackReason(reason);
      setLoading(false);
    });
  }

  function onToggleAttach() {
    if (!selected) return;
    setAttached((value) => !value);
  }

  const status = statusLine(snapshot, loading);
  const banner = fallbackReason ?? snapshot?.notice ?? null;

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
          <p className="banner" role={fallbackReason ? "alert" : "status"}>
            {banner}
          </p>
        ) : null}
      </header>
      <Legend bases={positioned} />
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

function statusLine(snapshot: MapSnapshot | null, loading: boolean): string {
  if (loading && !snapshot) return "Loading bases…";
  if (!snapshot) return "No snapshot";
  const units = snapshot.bases.reduce((sum, base) => sum + base.units.length, 0);
  const count = `${snapshot.bases.length} ${snapshot.bases.length === 1 ? "base" : "bases"} · ${units} units`;
  if (loading) return `Loading… · ${count}`;
  if (snapshot.source === "working-set") return `Working Set · ${count}`;
  return `Fixture · sample data · ${count}`;
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
