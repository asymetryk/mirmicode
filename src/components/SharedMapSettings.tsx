import { useEffect, useState, type FormEvent } from "react";
import { BUILDING_KINDS, buildingLabel, buildingSetForStage, UNIT_ROLES, roleLabel } from "../rtsArt";
import type { BuildingKind, CampaignBase, Unit, UnitRole } from "../types";

type SharedMapSettingsProps = {
  base: CampaignBase;
  unit: Unit | null;
  revision: number | null;
  enabled: boolean;
  onSaved: () => void;
};

export function SharedMapSettings({ base, unit, revision, enabled, onSaved }: SharedMapSettingsProps) {
  const buildingSetKey = base.appearance?.buildingSet?.join("|") ?? null;
  const [open, setOpen] = useState(false);
  const [editorToken, setEditorToken] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [campColor, setCampColor] = useState(base.appearance?.color ?? "#a2c947");
  const [campColorChanged, setCampColorChanged] = useState(false);
  const [campColorReset, setCampColorReset] = useState(false);
  const [buildingSet, setBuildingSet] = useState<BuildingKind[]>(base.appearance?.buildingSet ?? buildingSetForStage(base.stage));
  const [buildingSetChanged, setBuildingSetChanged] = useState(false);
  const [buildingSetReset, setBuildingSetReset] = useState(false);
  const [unitColor, setUnitColor] = useState(unit?.appearance?.color ?? "#a2c947");
  const [unitColorChanged, setUnitColorChanged] = useState(false);
  const [unitColorReset, setUnitColorReset] = useState(false);
  const [unitRole, setUnitRole] = useState<UnitRole | "">(unit?.appearance?.unitRole ?? "");
  const [unitRoleChanged, setUnitRoleChanged] = useState(false);
  const [unitRoleReset, setUnitRoleReset] = useState(false);
  const [githubUrl, setGithubUrl] = useState(base.links?.githubUrl ?? "");
  const initialOpenProjectUrl = base.linkProvenance?.openProjectUrl === "manual"
    ? base.links?.openProjectUrl ?? ""
    : base.links?.openProjectUrl ?? base.openProject?.href ?? "";
  const [openProjectUrl, setOpenProjectUrl] = useState(initialOpenProjectUrl);
  const [buzzUrl, setBuzzUrl] = useState(base.links?.buzzUrl ?? "");
  const [linksChanged, setLinksChanged] = useState({ github: false, openProject: false, buzz: false });
  const [resetLinks, setResetLinks] = useState<string[]>([]);

  useEffect(() => {
    setCampColor(base.appearance?.color ?? "#a2c947");
    setCampColorChanged(false);
    setCampColorReset(false);
    setBuildingSet(base.appearance?.buildingSet ?? buildingSetForStage(base.stage));
    setBuildingSetChanged(false);
    setBuildingSetReset(false);
    setUnitColor(unit?.appearance?.color ?? "#a2c947");
    setUnitColorChanged(false);
    setUnitColorReset(false);
    setUnitRole(unit?.appearance?.unitRole ?? "");
    setUnitRoleChanged(false);
    setUnitRoleReset(false);
    setGithubUrl(base.links?.githubUrl ?? "");
    setOpenProjectUrl(base.linkProvenance?.openProjectUrl === "manual"
      ? base.links?.openProjectUrl ?? ""
      : base.links?.openProjectUrl ?? base.openProject?.href ?? "");
    setBuzzUrl(base.links?.buzzUrl ?? "");
    setLinksChanged({ github: false, openProject: false, buzz: false });
    setResetLinks([]);
    setError(null);
    setNotice(null);
  }, [base.id, base.stage, base.appearance?.color, buildingSetKey,
    base.links?.githubUrl, base.links?.openProjectUrl, base.links?.buzzUrl,
    base.openProject?.href, base.linkProvenance?.openProjectUrl, unit?.id,
    unit?.appearance?.color, unit?.appearance?.unitRole]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetch("/api/v1/session", { credentials: "same-origin" }).then((response) => {
      if (!cancelled) setSessionReady(response.ok);
    }).catch(() => {
      if (!cancelled) setSessionReady(false);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || !base.repoKey || revision === null) {
      setError("Shared map editing is unavailable for this snapshot.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        expected_revision: revision,
        repo_key: base.repoKey,
      };
      const appearance: Record<string, unknown> = {};
      if (campColorChanged && !campColorReset) appearance.color = campColor;
      if (buildingSetChanged && !buildingSetReset) appearance.building_set = buildingSet;
      if (Object.keys(appearance).length > 0) payload.appearance = appearance;

      const unitAppearance: Record<string, unknown> = {};
      if (unit && unitColorChanged && !unitColorReset) unitAppearance.color = unitColor;
      if (unit && unitRoleChanged && !unitRoleReset) unitAppearance.unit_role = unitRole || null;
      if (Object.keys(unitAppearance).length > 0 && unit) {
        payload.unit_id = unit.id;
        payload.unit_appearance = unitAppearance;
      }

      const links: Record<string, string | null> = {};
      if (linksChanged.github && !resetLinks.includes("github_url")) links.github_url = githubUrl.trim() || null;
      if (linksChanged.openProject && !resetLinks.includes("openproject_url")) links.openproject_url = openProjectUrl.trim() || null;
      if (linksChanged.buzz && !resetLinks.includes("buzz_url")) links.buzz_url = buzzUrl.trim() || null;
      if (Object.keys(links).length > 0) payload.links = links;

      const reset: Record<string, string[]> = {};
      const appearanceReset = [
        ...(campColorReset ? ["color"] : []),
        ...(buildingSetReset ? ["building_set"] : []),
      ];
      if (appearanceReset.length > 0) reset.appearance = appearanceReset;
      const unitReset = [
        ...(unitColorReset ? ["color"] : []),
        ...(unitRoleReset ? ["unit_role"] : []),
      ];
      if (unit && unitReset.length > 0) {
        payload.unit_id = unit.id;
        reset.unit_appearance = unitReset;
      }
      const linksReset = resetLinks.filter((key) => !Object.prototype.hasOwnProperty.call(links, key));
      if (linksReset.length > 0) reset.links = linksReset;
      if (Object.keys(reset).length > 0) payload.reset = reset;

      if (Object.keys(payload).length === 2) {
        setNotice("No shared settings changed.");
        return;
      }

      if (!sessionReady && editorToken.trim()) {
        const session = await fetch("/api/v1/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ token: editorToken.trim() }),
        });
        if (!session.ok) throw new Error(session.status === 401 ? "Editor token was not accepted." : "Could not start an edit session.");
        setSessionReady(true);
      }

      const response = await fetch("/api/v1/metadata", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        setSessionReady(false);
        throw new Error("Edit session expired. Enter the editor token to continue.");
      }
      if (response.status === 409) {
        onSaved();
        throw new Error("Shared settings changed elsewhere. The latest map is loading; review it before saving again.");
      }
      if (!response.ok) throw new Error(response.status === 403 ? "This account cannot edit shared map settings." : "Could not save shared map settings.");

      setCampColorChanged(false);
      setCampColorReset(false);
      setBuildingSetChanged(false);
      setBuildingSetReset(false);
      setUnitColorChanged(false);
      setUnitColorReset(false);
      setUnitRoleChanged(false);
      setUnitRoleReset(false);
      setLinksChanged({ github: false, openProject: false, buzz: false });
      setResetLinks([]);
      setNotice("Shared map settings saved.");
      onSaved();
    } catch (cause) {
      if (cause instanceof TypeError) setError("Could not reach the Mirmicode settings service.");
      else setError(cause instanceof Error ? cause.message : "Could not save shared map settings.");
    } finally {
      setEditorToken("");
      setSaving(false);
    }
  }

  async function endSession() {
    try {
      await fetch("/api/v1/session", { method: "DELETE", credentials: "same-origin" });
      setSessionReady(false);
      setNotice("Edit session ended.");
    } catch {
      setError("Could not end the edit session.");
    }
  }

  if (!enabled) return null;

  function resetLink(key: string) {
    setLinksChanged((state) => ({ ...state, [key === "github_url" ? "github" : key === "openproject_url" ? "openProject" : "buzz"]: false }));
    setResetLinks((state) => state.includes(key) ? state : [...state, key]);
  }

  return (
    <section className="shared-map-settings" aria-label="Shared map settings">
      <div className="shared-settings-head">
        <div>
          <h3>Shared map settings</h3>
          <p>Appearance and destinations are shared across viewers.</p>
        </div>
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {open ? (
        <form className="shared-settings-form" onSubmit={save}>
          {!sessionReady ? (
            <label>
              Editor token
              <input
                type="password"
                autoComplete="current-password"
                value={editorToken}
                onChange={(event) => setEditorToken(event.currentTarget.value)}
                placeholder="Required to save"
              />
            </label>
          ) : <p className="editor-session-state">Edit session active</p>}

          <fieldset>
            <legend>Camp appearance</legend>
            <p className="help">Choose which buildings appear around this camp.</p>
            <div className="building-options">
              {BUILDING_KINDS.map((kind) => (
                <label key={kind}>
                  <input
                    type="checkbox"
                    checked={buildingSet.includes(kind)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setBuildingSet((current) => checked
                        ? [...current, kind]
                        : current.filter((entry) => entry !== kind));
                      setBuildingSetChanged(true);
                      setBuildingSetReset(false);
                    }}
                  />
                  {buildingLabel(kind)}
                </label>
              ))}
            </div>
            <button type="button" onClick={() => { setBuildingSet(buildingSetForStage(base.stage)); setBuildingSetChanged(false); setBuildingSetReset(true); }}>Use stage default</button>
            <ColorField label="Camp accent" value={campColor} onChange={(value) => { setCampColor(value); setCampColorChanged(true); setCampColorReset(false); }} onReset={() => { setCampColor(""); setCampColorChanged(false); setCampColorReset(true); }} />
          </fieldset>

          {unit ? (
            <fieldset>
              <legend>{unit.model} appearance</legend>
              <label>
                Unit form
                <select value={unitRole} onChange={(event) => { setUnitRole(event.currentTarget.value as UnitRole | ""); setUnitRoleChanged(true); setUnitRoleReset(false); }}>
                  <option value="">Use model mapping</option>
                  {UNIT_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => { setUnitRole(""); setUnitRoleChanged(false); setUnitRoleReset(true); }}>Use model default</button>
              <ColorField label="Unit accent" value={unitColor} onChange={(value) => { setUnitColor(value); setUnitColorChanged(true); setUnitColorReset(false); }} onReset={() => { setUnitColor(""); setUnitColorChanged(false); setUnitColorReset(true); }} />
            </fieldset>
          ) : null}

          <fieldset>
            <legend>Project destinations</legend>
            <label>Repository URL<input type="url" value={githubUrl} onChange={(event) => { setGithubUrl(event.currentTarget.value); setLinksChanged((state) => ({ ...state, github: true })); setResetLinks((state) => state.filter((key) => key !== "github_url")); }} placeholder="https://github.com/owner/repository" /></label>
            <button type="button" onClick={() => resetLink("github_url")}>Use source value</button>
            <label>OpenProject URL<input type="url" value={openProjectUrl} onChange={(event) => { setOpenProjectUrl(event.currentTarget.value); setLinksChanged((state) => ({ ...state, openProject: true })); setResetLinks((state) => state.filter((key) => key !== "openproject_url")); }} placeholder="https://openproject.example/projects/repository" /></label>
            <button type="button" onClick={() => resetLink("openproject_url")}>Use source value</button>
            <label>Hive channel URL<input type="url" value={buzzUrl} onChange={(event) => { setBuzzUrl(event.currentTarget.value); setLinksChanged((state) => ({ ...state, buzz: true })); setResetLinks((state) => state.filter((key) => key !== "buzz_url")); }} placeholder="https://hive.example/channel" /></label>
            <button type="button" onClick={() => resetLink("buzz_url")}>Use source value</button>
            <p className="help">Manually entered destinations are labeled as unverified until a source confirms them.</p>
            {resetLinks.length > 0 ? <p className="help">Source values will appear after saving and refreshing the map.</p> : null}
          </fieldset>

          <div className="actions">
            <button type="submit" disabled={saving || revision === null || !base.repoKey}>{saving ? "Saving…" : "Save shared settings"}</button>
            {sessionReady ? <button type="button" onClick={() => void endSession()}>End edit session</button> : null}
          </div>
          {error ? <p className="shared-settings-error" role="alert">{error}</p> : null}
          {notice ? <p className="shared-settings-notice" role="status">{notice}</p> : null}
        </form>
      ) : null}
    </section>
  );
}

function ColorField({ label, value, onChange, onReset }: { label: string; value: string; onChange: (value: string) => void; onReset: () => void }) {
  return (
    <div className="color-field">
      <label>{label}<input type="color" value={isColor(value) ? value : "#a2c947"} onChange={(event) => onChange(event.currentTarget.value)} /></label>
      <button type="button" onClick={onReset}>Use default</button>
    </div>
  );
}

function isColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
