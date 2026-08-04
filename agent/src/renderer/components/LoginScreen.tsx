import { useState } from "react";

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
      <h1>Karvix</h1>
      <p className="subtitle">Sign in to talk to your assistant.</p>
      <form onSubmit={submit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <div className="error-banner">{error}</div>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>
      <button className="link-button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
      </button>
    </div>
  );
}
