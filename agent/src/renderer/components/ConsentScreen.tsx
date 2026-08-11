import { useState } from "react";

// Explicit, affirmative first-run consent — separate from the OS mic-permission
// dialog. Required before this product goes live to real users. See
// docs/ARCHITECTURE.md "Security / privacy".
export function ConsentScreen({ onAccept }: { onAccept: () => void }) {
  const [accepting, setAccepting] = useState(false);

  async function accept() {
    setAccepting(true);
    await window.jarvis.consent.record();
    onAccept();
  }

  return (
    <div className="consent-screen">
      <div className="glass">
        <h1>Before you start</h1>
        <ul>
          <li>When you press the hotkey and speak, your audio is sent to our server and processed via Groq to transcribe and understand it.</li>
          <li>This app can take real actions on your computer on your behalf — opening and closing apps, controlling media, setting reminders, running web searches, and opening URLs — only from a fixed, safe list your assistant is allowed to use. Actions that are risky (closing an app) or could expose something private (reading your clipboard, taking a screenshot) always ask you out loud to confirm first — just say "yes" on your next turn to allow it, or anything else to cancel.</li>
          <li>If you confirm a screenshot, an image of your screen at that moment is sent to a cloud AI model to be described back to you — more sensitive than anything else this app shares, which is why it's never done without asking first.</li>
          <li>This is an early beta. Things may break, and the assistant may occasionally misunderstand you.</li>
        </ul>
        <button onClick={accept} disabled={accepting}>
          {accepting ? "…" : "I understand, continue"}
        </button>
      </div>
    </div>
  );
}
