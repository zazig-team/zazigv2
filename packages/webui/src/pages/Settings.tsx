import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "../hooks/useCompany";
import { supabase } from "../lib/supabase";

interface CompanySettingsRow {
  auto_triage: boolean | null;
  triage_batch_size: number | null;
  triage_max_concurrent: number | null;
  triage_delay_minutes: number | null;
  auto_spec: boolean | null;
  spec_max_concurrent: number | null;
  spec_delay_minutes: number | null;
}

interface SettingsState {
  autoTriage: boolean;
  triageBatchSize: number;
  triageMaxConcurrent: number;
  triageDelayMinutes: number;
  autoSpec: boolean;
  specMaxConcurrent: number;
  specDelayMinutes: number;
}

const DEFAULT_SETTINGS: SettingsState = {
  autoTriage: false,
  triageBatchSize: 5,
  triageMaxConcurrent: 3,
  triageDelayMinutes: 5,
  autoSpec: false,
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

function mapRowToSettings(row: CompanySettingsRow): SettingsState {
  return {
    autoTriage: Boolean(row.auto_triage),
    triageBatchSize: normalizeNumber(row.triage_batch_size, 5, 1, 20),
    triageMaxConcurrent: normalizeNumber(row.triage_max_concurrent, 3, 1, 10),
    triageDelayMinutes: normalizeNumber(row.triage_delay_minutes, 5, 1, 30),
    autoSpec: Boolean(row.auto_spec),
    specMaxConcurrent: normalizeNumber(row.spec_max_concurrent, 2, 1, 5),
    specDelayMinutes: normalizeNumber(row.spec_delay_minutes, 5, 1, 30),
  };
}

function settingsChanged(current: SettingsState, initial: SettingsState): boolean {
  return current.autoTriage !== initial.autoTriage
    || current.triageBatchSize !== initial.triageBatchSize
    || current.triageMaxConcurrent !== initial.triageMaxConcurrent
    || current.triageDelayMinutes !== initial.triageDelayMinutes
    || current.autoSpec !== initial.autoSpec
    || current.specMaxConcurrent !== initial.specMaxConcurrent
    || current.specDelayMinutes !== initial.specDelayMinutes;
}

function buildChangedFields(
  current: SettingsState,
  initial: SettingsState,
): Partial<CompanySettingsRow> {
  const changed: Partial<CompanySettingsRow> = {};

  if (current.autoTriage !== initial.autoTriage) changed.auto_triage = current.autoTriage;
  if (current.triageBatchSize !== initial.triageBatchSize) changed.triage_batch_size = current.triageBatchSize;
  if (current.triageMaxConcurrent !== initial.triageMaxConcurrent) {
    changed.triage_max_concurrent = current.triageMaxConcurrent;
  }
  if (current.triageDelayMinutes !== initial.triageDelayMinutes) {
    changed.triage_delay_minutes = current.triageDelayMinutes;
  }
  if (current.autoSpec !== initial.autoSpec) changed.auto_spec = current.autoSpec;
  if (current.specMaxConcurrent !== initial.specMaxConcurrent) changed.spec_max_concurrent = current.specMaxConcurrent;
  if (current.specDelayMinutes !== initial.specDelayMinutes) changed.spec_delay_minutes = current.specDelayMinutes;

  return changed;
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
        "auto_triage, triage_batch_size, triage_max_concurrent, triage_delay_minutes, auto_spec, spec_max_concurrent, spec_delay_minutes",
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
        <div className="settings-card-subtitle">Manage automated triage behavior for new ideas.</div>

        <label className="settings-toggle-row" htmlFor="auto-triage-toggle">
          <span className="settings-toggle-label">Enable auto-triage</span>
          <input
            id="auto-triage-toggle"
            type="checkbox"
            checked={settings.autoTriage}
            disabled={controlsDisabled}
            onChange={(event) => {
              setSettings((current) => ({ ...current, autoTriage: event.target.checked }));
              setSaveError(null);
              setSaveSuccess(null);
            }}
          />
        </label>

        <label className="settings-slider-row" htmlFor="triage-batch-size">
          <div className="settings-slider-labels">
            <span>Batch size</span>
            <span>{settings.triageBatchSize}</span>
          </div>
          <input
            id="triage-batch-size"
            type="range"
            min={1}
            max={20}
            value={settings.triageBatchSize}
            disabled={controlsDisabled}
            onChange={(event) => {
              const next = clamp(Number(event.target.value), 1, 20);
              setSettings((current) => ({ ...current, triageBatchSize: next }));
              setSaveError(null);
              setSaveSuccess(null);
            }}
          />
        </label>

        <label className="settings-slider-row" htmlFor="triage-max-concurrent">
          <div className="settings-slider-labels">
            <span>Max concurrent</span>
            <span>{settings.triageMaxConcurrent}</span>
          </div>
          <input
            id="triage-max-concurrent"
            type="range"
            min={1}
            max={10}
            value={settings.triageMaxConcurrent}
            disabled={controlsDisabled}
            onChange={(event) => {
              const next = clamp(Number(event.target.value), 1, 10);
              setSettings((current) => ({ ...current, triageMaxConcurrent: next }));
              setSaveError(null);
              setSaveSuccess(null);
            }}
          />
        </label>

        <label className="settings-slider-row" htmlFor="triage-delay-minutes">
          <div className="settings-slider-labels">
            <span>Delay (min)</span>
            <span>{settings.triageDelayMinutes}</span>
          </div>
          <input
            id="triage-delay-minutes"
            type="range"
            min={1}
            max={30}
            value={settings.triageDelayMinutes}
            disabled={controlsDisabled}
            onChange={(event) => {
              const next = clamp(Number(event.target.value), 1, 30);
              setSettings((current) => ({ ...current, triageDelayMinutes: next }));
              setSaveError(null);
              setSaveSuccess(null);
            }}
          />
        </label>
      </section>

      <section className="settings-card fade-up d2">
        <div className="settings-card-title">Auto-Spec</div>
        <div className="settings-card-subtitle">Manage automated spec writer session dispatch.</div>

        <label className="settings-toggle-row" htmlFor="auto-spec-toggle">
          <span className="settings-toggle-label">Enable auto-spec</span>
          <input
            id="auto-spec-toggle"
            type="checkbox"
            checked={settings.autoSpec}
            disabled={controlsDisabled}
            onChange={(event) => {
              setSettings((current) => ({ ...current, autoSpec: event.target.checked }));
              setSaveError(null);
              setSaveSuccess(null);
            }}
          />
        </label>

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
              setSaveError(null);
              setSaveSuccess(null);
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
              setSaveError(null);
              setSaveSuccess(null);
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
