import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { resolveSnapshot } from "./adapters/source";
import { Inspector } from "./components/Inspector";
import { MapStage } from "./components/MapStage";
import { positionBases } from "./layout";
import type { MapSnapshot } from "./types";

const URL_KEY = "mirmicode.workingSetUrl";
const SOURCE_KEY = "mirmicode.dataSource";

export function App() {
  const [urlDraft, setUrlDraft] = useState(readStartupUrl);
  const [snapshot, setSnapshot] = useState<MapSnapshot | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    if (!snapshot || !selectedId) return;
    if (!snapshot.bases.some((base) => base.id === selectedId)) {
      setSelectedId(null);
      setAttached(false);
    }
  }, [snapshot, selectedId]);

  const positioned = useMemo(
    () => positionBases(snapshot?.bases ?? []),
    [snapshot],
  );
  const selected = positioned.find((base) => base.id === selectedId) ?? null;

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
        {banner ? <p className="banner">{banner}</p> : null}
      </header>
      <MapStage
        key={`${snapshot?.source ?? "pending"}:${snapshot?.fetchedAt ?? "0"}`}
        bases={positioned}
        selectedId={selectedId}
        attached={attached && selected !== null}
        now={now}
        onSelect={(id) => setSelectedId(id)}
      />
      <Inspector
        base={selected}
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
      />
    </div>
  );
}

function statusLine(snapshot: MapSnapshot | null, loading: boolean): string {
  if (loading && !snapshot) return "Loading bases…";
  if (!snapshot) return "No snapshot";
  const count = `${snapshot.bases.length} ${snapshot.bases.length === 1 ? "base" : "bases"}`;
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
  const envUrl = import.meta.env.VITE_WORKING_SET_URL?.trim() ?? "";
  try {
    if (localStorage.getItem(SOURCE_KEY) === "fixture") return "";
    const stored = localStorage.getItem(URL_KEY)?.trim() ?? "";
    return stored || envUrl;
  } catch {
    return envUrl;
  }
}

function remember(url: string): void {
  try {
    if (url.trim()) {
      localStorage.setItem(URL_KEY, url.trim());
      localStorage.setItem(SOURCE_KEY, "working-set");
      return;
    }
    localStorage.removeItem(URL_KEY);
    localStorage.setItem(SOURCE_KEY, "fixture");
  } catch {
    // Storage can be blocked. The current view still updates in memory.
  }
}
