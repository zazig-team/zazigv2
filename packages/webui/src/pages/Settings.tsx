import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useCompany } from "../hooks/useCompany";
import {
  fetchCompanySettings,
  updateCompanySettings,
  type CompanySettings,
} from "../lib/queries";

type CompanySettingKey = keyof CompanySettings;
type ToggleSettingKey = "auto_triage" | "auto_spec";
type NumberSettingKey =
  | "triage_batch_size"
  | "triage_max_concurrent"
  | "triage_delay_minutes"
  | "spec_max_concurrent"
  | "spec_delay_minutes";

interface FieldFeedback {
  message: string;
  tone: "info" | "error";
}

const EMPTY_DRAFT_VALUES: Record<NumberSettingKey, string> = {
  triage_batch_size: "",
  triage_max_concurrent: "",
  triage_delay_minutes: "",
  spec_max_concurrent: "",
  spec_delay_minutes: "",
};

const MINIMUM_VALUE_BY_FIELD: Record<NumberSettingKey, number> = {
  triage_batch_size: 1,
  triage_max_concurrent: 1,
  triage_delay_minutes: 0,
  spec_max_concurrent: 1,
  spec_delay_minutes: 0,
};

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("permission") || normalized.includes("rls")) {
    return "Permission denied - check company table RLS policies.";
  }

  return message;
}

function feedbackClassName(feedback: FieldFeedback): string {
  if (feedback.tone === "error") {
    return "inline-feedback inline-feedback--error";
  }
  return "inline-feedback";
}

export default function Settings(): JSX.Element {
  const { activeCompanyId, activeCompany } = useCompany();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [draftValues, setDraftValues] = useState<Record<NumberSettingKey, string>>(EMPTY_DRAFT_VALUES);
  const [fieldFeedback, setFieldFeedback] = useState<Partial<Record<CompanySettingKey, FieldFeedback>>>(
    {},
  );

  const saveTimersRef = useRef<Partial<Record<NumberSettingKey, number>>>({});

  const clearNumberSaveTimer = useCallback((field: NumberSettingKey): void => {
    const timer = saveTimersRef.current[field];
    if (typeof timer === "number") {
      window.clearTimeout(timer);
      delete saveTimersRef.current[field];
    }
  }, []);

  const clearAllNumberSaveTimers = useCallback((): void => {
    for (const field of Object.keys(saveTimersRef.current) as NumberSettingKey[]) {
      clearNumberSaveTimer(field);
    }
  }, [clearNumberSaveTimer]);

  const setFeedback = useCallback(
    (field: CompanySettingKey, next: FieldFeedback | null): void => {
      setFieldFeedback((current) => {
        if (!next) {
          const { [field]: _removed, ...rest } = current;
          return rest;
        }

        return {
          ...current,
          [field]: next,
        };
      });
    },
    [],
  );

  const saveSetting = useCallback(
    async <TField extends CompanySettingKey>(
      field: TField,
      value: CompanySettings[TField],
      options?: { rollbackValue: CompanySettings[TField] },
    ): Promise<void> => {
      if (!activeCompanyId) {
        return;
      }

      setFeedback(field, { tone: "info", message: "Saving..." });

      try {
        await updateCompanySettings(activeCompanyId, {
          [field]: value,
        } as Partial<CompanySettings>);
        setFeedback(field, { tone: "info", message: "Saved" });
      } catch (error) {
        if (options) {
          setSettings((current) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              [field]: options.rollbackValue,
            };
          });
        }

        setFeedback(field, { tone: "error", message: formatError(error) });
      }
    },
    [activeCompanyId, setFeedback],
  );

  const handleToggleChange = useCallback(
    (field: ToggleSettingKey): void => {
      if (!settings) {
        return;
      }

      const previous = settings[field];
      const next = !previous;

      setSettings((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          [field]: next,
        };
      });

      void saveSetting(field, next, { rollbackValue: previous });
    },
    [saveSetting, settings],
  );

  const handleNumberInputChange = useCallback(
    (field: NumberSettingKey) =>
      (event: ChangeEvent<HTMLInputElement>): void => {
        const rawValue = event.target.value;
        const minValue = MINIMUM_VALUE_BY_FIELD[field];

        setDraftValues((current) => ({
          ...current,
          [field]: rawValue,
        }));

        clearNumberSaveTimer(field);
        setFeedback(field, null);

        if (!settings) {
          return;
        }

        if (rawValue.trim().length === 0) {
          setFeedback(field, { tone: "error", message: "Value is required." });
          return;
        }

        const parsed = Number(rawValue);
        if (!Number.isInteger(parsed)) {
          setFeedback(field, { tone: "error", message: "Use whole numbers only." });
          return;
        }

        if (parsed < minValue) {
          setFeedback(field, { tone: "error", message: `Must be ${minValue} or greater.` });
          return;
        }

        if (settings[field] === parsed) {
          return;
        }

        setSettings((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            [field]: parsed,
          };
        });

        saveTimersRef.current[field] = window.setTimeout(() => {
          void saveSetting(field, parsed);
        }, 500);
      },
    [clearNumberSaveTimer, saveSetting, setFeedback, settings],
  );

  useEffect(() => {
    clearAllNumberSaveTimers();
    return () => {
      clearAllNumberSaveTimers();
    };
  }, [clearAllNumberSaveTimers]);

  useEffect(() => {
    clearAllNumberSaveTimers();
    setFieldFeedback({});

    if (!activeCompanyId) {
      setLoading(false);
      setLoadError("Select a company to configure automation.");
      setSettings(null);
      setDraftValues(EMPTY_DRAFT_VALUES);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    fetchCompanySettings(activeCompanyId)
      .then((nextSettings) => {
        if (cancelled) {
          return;
        }

        setSettings(nextSettings);
        setDraftValues({
          triage_batch_size: String(nextSettings.triage_batch_size),
          triage_max_concurrent: String(nextSettings.triage_max_concurrent),
          triage_delay_minutes: String(nextSettings.triage_delay_minutes),
          spec_max_concurrent: String(nextSettings.spec_max_concurrent),
          spec_delay_minutes: String(nextSettings.spec_delay_minutes),
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLoadError(formatError(error));
        setSettings(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, clearAllNumberSaveTimers]);

  return (
    <div className="settings-page">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Settings</div>
          <div className="page-subtitle">
            {activeCompany
              ? `Automation controls for ${activeCompany.name}.`
              : "Company automation controls."}
          </div>
        </div>
      </div>

      <div className="settings-content">
        <div className="section-label">Automation</div>

        {loading ? <div className="inline-feedback">Loading settings...</div> : null}
        {!loading && loadError ? (
          <div className="inline-feedback inline-feedback--error">{loadError}</div>
        ) : null}

        {!loading && !loadError && settings ? (
          <div className="settings-grid">
            <section className="settings-card">
              <h2 className="settings-card-title">Auto-Triage</h2>

              <label className="settings-toggle-row">
                <span className="settings-switch">
                  <input
                    checked={settings.auto_triage}
                    onChange={() => handleToggleChange("auto_triage")}
                    type="checkbox"
                  />
                  <span className="settings-switch-track">
                    <span className="settings-switch-thumb" />
                  </span>
                </span>
                <span className="settings-toggle-label">Automatically triage new ideas</span>
              </label>
              {fieldFeedback.auto_triage ? (
                <div className={feedbackClassName(fieldFeedback.auto_triage)}>
                  {fieldFeedback.auto_triage.message}
                </div>
              ) : null}

              <div className="settings-field-list">
                <label className="settings-field-row" htmlFor="triage-batch-size">
                  <span className="settings-field-label">Batch size</span>
                  <input
                    className="settings-number-input"
                    id="triage-batch-size"
                    min={MINIMUM_VALUE_BY_FIELD.triage_batch_size}
                    onChange={handleNumberInputChange("triage_batch_size")}
                    step={1}
                    type="number"
                    value={draftValues.triage_batch_size}
                  />
                </label>
                {fieldFeedback.triage_batch_size ? (
                  <div className={feedbackClassName(fieldFeedback.triage_batch_size)}>
                    {fieldFeedback.triage_batch_size.message}
                  </div>
                ) : null}

                <label className="settings-field-row" htmlFor="triage-max-concurrent">
                  <span className="settings-field-label">Max concurrent</span>
                  <input
                    className="settings-number-input"
                    id="triage-max-concurrent"
                    min={MINIMUM_VALUE_BY_FIELD.triage_max_concurrent}
                    onChange={handleNumberInputChange("triage_max_concurrent")}
                    step={1}
                    type="number"
                    value={draftValues.triage_max_concurrent}
                  />
                </label>
                {fieldFeedback.triage_max_concurrent ? (
                  <div className={feedbackClassName(fieldFeedback.triage_max_concurrent)}>
                    {fieldFeedback.triage_max_concurrent.message}
                  </div>
                ) : null}

                <label className="settings-field-row" htmlFor="triage-delay-minutes">
                  <span className="settings-field-label">Delay (min)</span>
                  <input
                    className="settings-number-input"
                    id="triage-delay-minutes"
                    min={MINIMUM_VALUE_BY_FIELD.triage_delay_minutes}
                    onChange={handleNumberInputChange("triage_delay_minutes")}
                    step={1}
                    type="number"
                    value={draftValues.triage_delay_minutes}
                  />
                </label>
                {fieldFeedback.triage_delay_minutes ? (
                  <div className={feedbackClassName(fieldFeedback.triage_delay_minutes)}>
                    {fieldFeedback.triage_delay_minutes.message}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="settings-card">
              <h2 className="settings-card-title">Auto-Spec</h2>

              <label className="settings-toggle-row">
                <span className="settings-switch">
                  <input
                    checked={settings.auto_spec}
                    onChange={() => handleToggleChange("auto_spec")}
                    type="checkbox"
                  />
                  <span className="settings-switch-track">
                    <span className="settings-switch-thumb" />
                  </span>
                </span>
                <span className="settings-toggle-label">Automatically spec develop-routed ideas</span>
              </label>
              {fieldFeedback.auto_spec ? (
                <div className={feedbackClassName(fieldFeedback.auto_spec)}>
                  {fieldFeedback.auto_spec.message}
                </div>
              ) : null}

              <div className="settings-field-list">
                <label className="settings-field-row" htmlFor="spec-max-concurrent">
                  <span className="settings-field-label">Max concurrent</span>
                  <input
                    className="settings-number-input"
                    id="spec-max-concurrent"
                    min={MINIMUM_VALUE_BY_FIELD.spec_max_concurrent}
                    onChange={handleNumberInputChange("spec_max_concurrent")}
                    step={1}
                    type="number"
                    value={draftValues.spec_max_concurrent}
                  />
                </label>
                {fieldFeedback.spec_max_concurrent ? (
                  <div className={feedbackClassName(fieldFeedback.spec_max_concurrent)}>
                    {fieldFeedback.spec_max_concurrent.message}
                  </div>
                ) : null}

                <label className="settings-field-row" htmlFor="spec-delay-minutes">
                  <span className="settings-field-label">Delay (min)</span>
                  <input
                    className="settings-number-input"
                    id="spec-delay-minutes"
                    min={MINIMUM_VALUE_BY_FIELD.spec_delay_minutes}
                    onChange={handleNumberInputChange("spec_delay_minutes")}
                    step={1}
                    type="number"
                    value={draftValues.spec_delay_minutes}
                  />
                </label>
                {fieldFeedback.spec_delay_minutes ? (
                  <div className={feedbackClassName(fieldFeedback.spec_delay_minutes)}>
                    {fieldFeedback.spec_delay_minutes.message}
                  </div>
                ) : null}

                <div className="settings-note">No batch size - locked to 1.</div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
