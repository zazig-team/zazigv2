import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "../hooks/useCompany";
import { supabase } from "../lib/supabase";

type ItemType = "idea" | "brief" | "bug" | "test";
const ITEM_TYPES: ItemType[] = ["idea", "brief", "bug", "test"];
const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  idea: "Ideas",
  brief: "Briefs",
  bug: "Bugs",
  test: "Tests",
};

interface CompanySettingsRow {
  auto_triage_types: string[] | null;
  auto_spec_types: string[] | null;
  spec_max_concurrent: number | null;
  spec_delay_minutes: number | null;
}

interface SettingsState {
  autoTriageTypes: ItemType[];
  autoSpecTypes: ItemType[];
  specMaxConcurrent: number;
  specDelayMinutes: number;
}

const DEFAULT_SETTINGS: SettingsState = {
  autoTriageTypes: [],
  autoSpecTypes: [],
  specMaxConcurrent: 2,
  specDelayMinutes: 5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeNumber(
  value: number | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return clamp(Math.round(value), min, max);
}

function parseTypes(raw: string[] | null): ItemType[] {
  if (!raw) return [];
  return raw.filter((t): t is ItemType => ITEM_TYPES.includes(t as ItemType));
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted1 = [...a].sort();
  const sorted2 = [...b].sort();
  return sorted1.every((v, i) => v === sorted2[i]);
}

function mapRowToSettings(row: CompanySettingsRow): SettingsState {
  return {
    autoTriageTypes: parseTypes(row.auto_triage_types),
    autoSpecTypes: parseTypes(row.auto_spec_types),
    specMaxConcurrent: normalizeNumber(row.spec_max_concurrent, 2, 1, 5),
    specDelayMinutes: normalizeNumber(row.spec_delay_minutes, 5, 1, 30),
  };
}

function settingsChanged(current: SettingsState, initial: SettingsState): boolean {
  return !arraysEqual(current.autoTriageTypes, initial.autoTriageTypes)
    || !arraysEqual(current.autoSpecTypes, initial.autoSpecTypes)
    || current.specMaxConcurrent !== initial.specMaxConcurrent
    || current.specDelayMinutes !== initial.specDelayMinutes;
}

function buildChangedFields(
  current: SettingsState,
  initial: SettingsState,
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};

  if (!arraysEqual(current.autoTriageTypes, initial.autoTriageTypes)) {
    changed.auto_triage_types = current.autoTriageTypes;
  }
  if (!arraysEqual(current.autoSpecTypes, initial.autoSpecTypes)) {
    changed.auto_spec_types = current.autoSpecTypes;
  }
  if (current.specMaxConcurrent !== initial.specMaxConcurrent) changed.spec_max_concurrent = current.specMaxConcurrent;
  if (current.specDelayMinutes !== initial.specDelayMinutes) changed.spec_delay_minutes = current.specDelayMinutes;

  return changed;
}

function toggleType(types: ItemType[], type: ItemType, enabled: boolean): ItemType[] {
  if (enabled) {
    return types.includes(type) ? types : [...types, type];
  }
  return types.filter((t) => t !== type);
}

export default function Settings(): JSX.Element {
  const { activeCompanyId, activeCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [initialSettings, setInitialSettings] = useState<SettingsState | null>(null);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);

  const loadSettings = useCallback(async (): Promise<void> => {
    if (!activeCompanyId) {
      setLoading(false);
      setLoadError(null);
      setInitialSettings(null);
      setSettings(DEFAULT_SETTINGS);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaveSuccess(null);

    const { data, error } = await supabase
      .from("companies")
      .select(
        "auto_triage_types, auto_spec_types, spec_max_concurrent, spec_delay_minutes",
      )
      .eq("id", activeCompanyId)
      .single();

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    const next = mapRowToSettings(data as CompanySettingsRow);
    setSettings(next);
    setInitialSettings(next);
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const hasChanges = useMemo(() => {
    if (!initialSettings) {
      return false;
    }
    return settingsChanged(settings, initialSettings);
  }, [settings, initialSettings]);

  async function saveSettings(): Promise<void> {
    if (!activeCompanyId || !initialSettings || saving) return;

    const changedFields = buildChangedFields(settings, initialSettings);
    if (Object.keys(changedFields).length === 0) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const { error } = await supabase
      .from("companies")
      .update(changedFields)
      .eq("id", activeCompanyId);

    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    setInitialSettings(settings);
    setSaveSuccess("Settings saved.");
    setSaving(false);
  }

  const controlsDisabled = loading || saving || !initialSettings;

  function clearFeedback(): void {
    setSaveError(null);
    setSaveSuccess(null);
  }

  if (!activeCompanyId) {
    return (
      <main className="settings-page">
        <div className="settings-empty">Select a company to view settings.</div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="settings-page">
        <div className="settings-empty">Loading settings...</div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="settings-page">
        <div className="settings-empty settings-empty--error">
          {loadError}
          <button type="button" className="settings-secondary-btn" onClick={() => void loadSettings()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="settings-page">
      <header className="settings-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Automation controls for {activeCompany?.name ?? "your active company"}.
        </p>
      </header>

      <section className="settings-card fade-up d1">
        <div className="settings-card-title">Auto-Triage</div>
        <div className="settings-card-subtitle">Select which item types are automatically triaged.</div>

        <div className="settings-type-toggles">
          {ITEM_TYPES.map((type) => (
            <label className="settings-type-toggle" key={`triage-${type}`} htmlFor={`triage-${type}`}>
              <input
                id={`triage-${type}`}
                type="checkbox"
                checked={settings.autoTriageTypes.includes(type)}
                disabled={controlsDisabled}
                onChange={(event) => {
                  setSettings((current) => ({
                    ...current,
                    autoTriageTypes: toggleType(current.autoTriageTypes, type, event.target.checked),
                  }));
                  clearFeedback();
                }}
              />
              <span className="settings-type-toggle-label">{ITEM_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>

      </section>

      <section className="settings-card fade-up d2">
        <div className="settings-card-title">Auto-Spec</div>
        <div className="settings-card-subtitle">Select which item types are automatically specced.</div>

        <div className="settings-type-toggles">
          {ITEM_TYPES.map((type) => (
            <label className="settings-type-toggle" key={`spec-${type}`} htmlFor={`spec-${type}`}>
              <input
                id={`spec-${type}`}
                type="checkbox"
                checked={settings.autoSpecTypes.includes(type)}
                disabled={controlsDisabled}
                onChange={(event) => {
                  setSettings((current) => ({
                    ...current,
                    autoSpecTypes: toggleType(current.autoSpecTypes, type, event.target.checked),
                  }));
                  clearFeedback();
                }}
              />
              <span className="settings-type-toggle-label">{ITEM_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>

        <label className="settings-slider-row" htmlFor="spec-max-concurrent">
          <div className="settings-slider-labels">
            <span>Max concurrent</span>
            <span>{settings.specMaxConcurrent}</span>
          </div>
          <input
            id="spec-max-concurrent"
            type="range"
            min={1}
            max={5}
            value={settings.specMaxConcurrent}
            disabled={controlsDisabled}
            onChange={(event) => {
              const next = clamp(Number(event.target.value), 1, 5);
              setSettings((current) => ({ ...current, specMaxConcurrent: next }));
              clearFeedback();
            }}
          />
        </label>

        <label className="settings-slider-row" htmlFor="spec-delay-minutes">
          <div className="settings-slider-labels">
            <span>Delay (min)</span>
            <span>{settings.specDelayMinutes}</span>
          </div>
          <input
            id="spec-delay-minutes"
            type="range"
            min={1}
            max={30}
            value={settings.specDelayMinutes}
            disabled={controlsDisabled}
            onChange={(event) => {
              const next = clamp(Number(event.target.value), 1, 30);
              setSettings((current) => ({ ...current, specDelayMinutes: next }));
              clearFeedback();
            }}
          />
        </label>
      </section>

      <div className="settings-actions">
        <button
          type="button"
          className="settings-primary-btn"
          disabled={!hasChanges || saving}
          onClick={() => void saveSettings()}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saveError ? <span className="settings-feedback settings-feedback--error">{saveError}</span> : null}
        {saveSuccess ? <span className="settings-feedback settings-feedback--success">{saveSuccess}</span> : null}
      </div>
    </main>
  );
}
