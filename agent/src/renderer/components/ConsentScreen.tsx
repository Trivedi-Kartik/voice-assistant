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
      <h1>Before you start</h1>
      <ul>
        <li>When you press the hotkey and speak, your audio is sent to our server and processed via Groq to transcribe and understand it.</li>
        <li>This app can take real actions on your computer on your behalf — opening apps, running web searches, and opening URLs — only from a fixed, safe list your assistant is allowed to use.</li>
        <li>This is an early beta. Things may break, and the assistant may occasionally misunderstand you.</li>
      </ul>
      <button onClick={accept} disabled={accepting}>
        {accepting ? "…" : "I understand, continue"}
      </button>
    </div>
  );
}
