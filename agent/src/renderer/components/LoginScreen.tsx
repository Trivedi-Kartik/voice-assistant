import { useState } from "react";
import { VoiceOrb } from "./VoiceOrb";
import { useDictionary } from "../i18n";

// Renderer never calls the auth API or holds tokens directly — it sends
// credentials over IPC to main, which does the HTTPS call and keeps tokens out of
// renderer memory/devtools entirely. See docs/ARCHITECTURE.md "Auth on the client".
export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const t = useDictionary();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await window.jarvis.auth.login(email, password);
      } else {
        await window.jarvis.auth.signup(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.login.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="glass auth-card">
        <VoiceOrb state="idle" variant="small" />
        <div className="wordmark">Karvix</div>
        <p className="subtitle">{t.login.subtitle}</p>

        <div className="tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            {t.login.logInTab}
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            {t.login.signUpTab}
          </button>
          <div className={`thumb${mode === "signup" ? " signup" : ""}`} />
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label>{t.login.emailLabel}</label>
            <input
              type="email"
              placeholder={t.login.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>{t.login.passwordLabel}</label>
            <input
              type="password"
              placeholder={t.login.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button type="submit" className="cta" disabled={submitting}>
            {submitting ? t.login.pleaseWait : mode === "login" ? t.login.logInTab : t.login.signUpTab}
          </button>
        </form>
        <p className="switch-line">
          {mode === "login" ? t.login.needAccount : t.login.alreadyHaveAccount}
          <button
            type="button"
            className="link-button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? t.login.signUpTab : t.login.logInTab}
          </button>
        </p>
      </div>
    </div>
  );
}
