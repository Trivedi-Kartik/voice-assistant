// Plain-language privacy policy for the invited-beta launch — honest and
// specific to what this app actually does, not a boilerplate template. Not a
// substitute for real legal review before any broader/public launch (see
// docs/ARCHITECTURE.md "Security / privacy"). Served as static HTML directly
// from this Express app (see index.ts's `GET /privacy`) — no separate
// hosting, no build step, stays free.
//
// CONTACT_EMAIL below is a real placeholder, not a filled-in value — set it
// to whatever address you actually want real users emailing before this
// goes live to anyone. Never guess/reuse an email on someone's behalf here.
const CONTACT_EMAIL = "SET-YOUR-CONTACT-EMAIL@example.com";
export const PRIVACY_POLICY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Karvix — Privacy Policy</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 32px 20px 80px; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; }
  .updated { color: #666; font-size: 0.9rem; }
  .beta-note { background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; padding: 12px 16px; margin: 1.5rem 0; }
  code { background: #f0f0f0; padding: 2px 5px; border-radius: 4px; }
</style>
</head>
<body>
<h1>Karvix — Privacy Policy</h1>
<p class="updated">Last updated: 2026-08-15</p>

<div class="beta-note">
  Karvix is an early, invite-only beta. This policy describes exactly what
  happens today — it may change as the product does, and we'll update this
  page when it does.
</div>

<h2>What we collect, and why</h2>
<ul>
  <li><strong>Account info:</strong> your email and a securely hashed password
    (we never store your actual password).</li>
  <li><strong>Voice audio:</strong> when you press the hotkey and speak, that
    audio is sent to our server and forwarded to Groq (a third-party AI
    provider) to transcribe it to text. The raw audio itself is not stored
    after transcription.</li>
  <li><strong>Conversation transcripts:</strong> what you said and what
    Karvix replied are stored so your conversation history and any facts it
    remembers about your preferences persist across sessions.</li>
  <li><strong>Screenshots and clipboard content — only with your explicit
    "yes":</strong> Karvix never reads your clipboard or takes a screenshot
    without first asking out loud and waiting for you to confirm. If you
    confirm, that content is sent to Groq to be described back to you, and
    is not stored afterward.</li>
  <li><strong>Device info:</strong> a device name, your operating system, and
    which app abilities your device supports — used only to know which
    actions Karvix can safely offer you.</li>
  <li><strong>Usage counters:</strong> how many voice turns you use per day,
    to enforce a fair daily limit on our shared account with Groq.</li>
</ul>

<h2>Third parties</h2>
<p>
  Groq processes your voice audio (speech-to-text), your conversation text
  (to decide how to respond and which action to take), and — only when you
  confirm — screenshots or clipboard text. We don't share your data with any
  other third party.
</p>

<h2>Your choices</h2>
<ul>
  <li>You can add your own Groq API key in Settings — your usage then goes
    through your own Groq account instead of our shared one.</li>
  <li>You can say anything other than "yes" to decline any confirmation
    prompt (closing an app, reading your clipboard, taking a screenshot) —
    nothing sensitive happens without your explicit go-ahead.</li>
  <li>You can ask us to delete your account and everything associated with
    it at any time — email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</li>
</ul>

<h2>Security</h2>
<p>
  Passwords are hashed with bcrypt, never stored in plain text. If you add
  your own Groq API key, it's encrypted at rest (AES-256-GCM) before it ever
  touches our database.
</p>

<h2>Contact</h2>
<p>
  Questions, concerns, or a deletion request: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.
</p>
</body>
</html>
`;
