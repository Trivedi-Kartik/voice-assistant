import { useState } from "react";
import { useDictionary } from "../i18n";

// Explicit, affirmative first-run consent — separate from the OS mic-permission
// dialog. Required before this product goes live to real users. See
// docs/ARCHITECTURE.md "Security / privacy".
export function ConsentScreen({ onAccept }: { onAccept: () => void }) {
  const [accepting, setAccepting] = useState(false);
  const t = useDictionary();

  async function accept() {
    setAccepting(true);
    await window.jarvis.consent.record();
    onAccept();
  }

  return (
    <div className="consent-screen">
      <div className="glass">
        <h1>{t.consent.heading}</h1>
        <ul>
          {t.consent.bullets.map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
        <button onClick={accept} disabled={accepting}>
          {accepting ? "…" : t.consent.accept}
        </button>
      </div>
    </div>
  );
}
