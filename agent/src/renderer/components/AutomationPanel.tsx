import { useDictionary } from "../i18n";

export interface AutomationStepView {
  description: string;
  risk: string;
  ok: boolean;
}

// Visible while a computer-use task is running (see App.tsx) — the running
// step list plus a Stop button exist specifically to compensate for using a
// free vision model for click-decisions: the user should always be able to
// see what it's about to do/just did, and always be one press away from
// stopping it. Reuses the same full-screen overlay class as
// SettingsPanel/HelpPanel.
export function AutomationPanel({ goal, steps, onStop }: { goal: string; steps: AutomationStepView[]; onStop: () => void }) {
  const t = useDictionary();

  return (
    <div className="settings-panel automation-panel">
      <div className="help-hero">
        <h2 className="wordmark">{t.automation.heading}</h2>
        <p className="hint">{goal}</p>
      </div>

      {steps.length === 0 ? (
        <p className="hint">{t.automation.starting}</p>
      ) : (
        <ul className="automation-step-list">
          {steps.map((s, i) => (
            <li key={i} className={`automation-step${s.risk === "high" ? " risky" : ""}${s.ok ? "" : " failed"}`}>
              {s.description}
            </li>
          ))}
        </ul>
      )}

      <button className="cta" onClick={onStop}>
        {t.automation.stop}
      </button>
    </div>
  );
}
