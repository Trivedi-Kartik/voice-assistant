import { useEffect, useState } from "react";
import { useAppStore } from "../state/store";
import { SUPPORTED_LANGUAGES, LANGUAGE_NATIVE_NAMES } from "../i18n/languages";
import { useDictionary } from "../i18n";

interface CustomApp {
  name: string;
  openCommand: string;
  processName?: string;
}

// BYOK escape valve: lets a user who's hit the shared daily cap add their own Groq
// key instead — no billing/Stripe needed in v1. See docs/ARCHITECTURE.md "Cost
// control".
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [customApps, setCustomApps] = useState<CustomApp[]>([]);
  const { language, setLanguage } = useAppStore();
  const [languageStatus, setLanguageStatus] = useState<"idle" | "saving" | "error">("idle");
  const t = useDictionary();

  useEffect(() => {
    window.jarvis.customApps.list().then(setCustomApps);
  }, []);

  async function save() {
    setStatus("saving");
    try {
      await window.jarvis.auth.setGroqKey(apiKey);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  async function changeLanguage(next: string) {
    const previous = language;
    setLanguage(next); // optimistic — matches this component's other save() patterns' feel
    setLanguageStatus("saving");
    try {
      await window.jarvis.settings.setLanguage(next);
      setLanguageStatus("idle");
    } catch {
      setLanguage(previous);
      setLanguageStatus("error");
    }
  }

  async function removeApp(name: string) {
    await window.jarvis.customApps.remove(name);
    setCustomApps((apps) => apps.filter((a) => a.name !== name));
  }

  return (
    <div className="settings-panel">
      <div className="help-hero">
        <h2 className="wordmark">{t.settings.heading}</h2>
      </div>

      <section className="settings-card">
        <h3 className="settings-card-title">{t.settings.languageTitle}</h3>
        <p className="hint">{t.settings.languageHint}</p>
        <div className="field">
          <label>{t.settings.languageLabel}</label>
          <select value={language} onChange={(e) => changeLanguage(e.target.value)}>
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NATIVE_NAMES[code]}
              </option>
            ))}
          </select>
        </div>
        {languageStatus === "error" && <div className="error-banner">{t.settings.languageError}</div>}
      </section>

      <section className="settings-card">
        <h3 className="settings-card-title">{t.settings.groqKeyTitle}</h3>
        <p className="hint">{t.settings.groqKeyHint}</p>
        <div className="field">
          <label>{t.settings.groqKeyLabel}</label>
          <input
            type="password"
            placeholder="gsk_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <button className="cta" onClick={save} disabled={!apiKey || status === "saving"}>
          {status === "saving" ? t.settings.saving : t.settings.saveKey}
        </button>
        {status === "saved" && <div className="success-banner">{t.settings.groqKeySaved}</div>}
        {status === "error" && <div className="error-banner">{t.settings.groqKeyError}</div>}
      </section>

      <section className="settings-card">
        <h3 className="settings-card-title">{t.settings.myAppsTitle}</h3>
        <p className="hint">{t.settings.myAppsHint}</p>
        {customApps.length === 0 ? (
          <p className="hint">{t.settings.noneAddedYet}</p>
        ) : (
          <ul className="settings-app-list">
            {customApps.map((app) => (
              <li key={app.name} className="settings-app-item">
                <span className="settings-app-name">{app.name}</span>
                <button className="link-button" onClick={() => removeApp(app.name)}>
                  {t.settings.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className="link-button" onClick={() => window.jarvis.shell.openPrivacyPolicy()}>
        {t.settings.privacyPolicyLink}
      </button>
      <button className="link-button" onClick={onClose}>
        {t.settings.close}
      </button>
    </div>
  );
}
