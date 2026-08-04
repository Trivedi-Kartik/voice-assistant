import { useState } from "react";

// BYOK escape valve: lets a user who's hit the shared daily cap add their own Groq
// key instead — no billing/Stripe needed in v1. See docs/ARCHITECTURE.md "Cost
// control".
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setStatus("saving");
    try {
      await window.jarvis.auth.setGroqKey(apiKey);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="settings-panel">
      <h2>Settings</h2>
      <label>
        Your own Groq API key (optional)
        <input
          type="password"
          placeholder="gsk_..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>
      <p className="hint">
        Hit today's free limit? Add your own free Groq key (console.groq.com) to remove the daily
        cap entirely.
      </p>
      <div className="settings-actions">
        <button onClick={save} disabled={!apiKey || status === "saving"}>
          {status === "saving" ? "Saving…" : "Save key"}
        </button>
        <button className="link-button" onClick={onClose}>
          Close
        </button>
      </div>
      {status === "saved" && <div className="success-banner">Saved — the daily cap no longer applies.</div>}
      {status === "error" && <div className="error-banner">Couldn't save that key — try again.</div>}
    </div>
  );
}
