import { useState } from "react";
import { VoiceOrb } from "./VoiceOrb";

// Renderer never calls the auth API or holds tokens directly — it sends
// credentials over IPC to main, which does the HTTPS call and keeps tokens out of
// renderer memory/devtools entirely. See docs/ARCHITECTURE.md "Auth on the client".
export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="glass auth-card">
        <VoiceOrb state="idle" variant="small" />
        <div className="wordmark">Karvix</div>
        <p className="subtitle">Sign in to talk to your assistant.</p>

        <div className="tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Log in
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            Sign up
          </button>
          <div className={`thumb${mode === "signup" ? " signup" : ""}`} />
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button type="submit" className="cta" disabled={submitting}>
            {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>
        <p className="switch-line">
          {mode === "login" ? "Need an account? " : "Already have an account? "}
          <button
            type="button"
            className="link-button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}
