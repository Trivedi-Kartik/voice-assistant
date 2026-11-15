// End-to-end Karvix 2 test through the REAL voice pipeline, no mocks in the loop:
//   Kokoro (local TTS) speaks a command -> re-recorded as webm/opus with MediaRecorder (exactly the app's
//   mic format) -> sent over the real WebSocket protocol to a locally running server -> Groq Whisper STT ->
//   tool loop picks pc_task -> PC agent runner -> agent_request/agent_response handled by the REAL desktop
//   agent code (agentHost/skills) in a sandbox home -> spoken confirmation answered by voice next turn.
// Prereqs: server running locally (cd server && PORT=8080 npx tsx src/index.ts), both packages built,
// Kokoro model present (KOKORO_DIR). Creates one test user (@example.invalid) and deletes it afterwards.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");

const SERVER = process.env.E2E_SERVER || "http://localhost:8080";
const KOKORO_DIR = process.env.KOKORO_DIR;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "karvix-e2e-"));
app.setPath("home", path.join(SANDBOX, "home"));
app.setPath("userData", path.join(SANDBOX, "userData"));
const HOME = path.join(SANDBOX, "home");
for (const d of ["Desktop", "Documents", "Downloads"]) fs.mkdirSync(path.join(HOME, d), { recursive: true });

const log = (...a) => console.log("[e2e]", ...a);

app.whenReady().then(main).catch((e) => { console.error("E2E ERROR", e); app.exit(1); });

async function main() {
  // ---------- speech: Kokoro -> WAV -> webm/opus via MediaRecorder in a hidden window ----------
  const sherpa = require("sherpa-onnx-node");
  const tts = new sherpa.OfflineTts({
    model: { kokoro: { model: `${KOKORO_DIR}/model.onnx`, voices: `${KOKORO_DIR}/voices.bin`, tokens: `${KOKORO_DIR}/tokens.txt`, dataDir: `${KOKORO_DIR}/espeak-ng-data`, lexicon: `${KOKORO_DIR}/lexicon-us-en.txt,${KOKORO_DIR}/lexicon-zh.txt`, dictDir: `${KOKORO_DIR}/dict`, lang: "en-us" }, numThreads: 2, provider: "cpu", debug: false },
    maxNumSentences: 1,
  });
  const recorder = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  await recorder.loadURL("data:text/html,<title>rec</title>");
  async function speakToWebm(text) {
    const a = tts.generate({ text, sid: 16, speed: 1.0, enableExternalBuffer: false });
    const pcm = Array.from(a.samples);
    return recorder.webContents.executeJavaScript(`(async () => {
      const ctx = new AudioContext({ sampleRate: ${a.sampleRate} });
      const samples = new Float32Array(${JSON.stringify(pcm)});
      const buf = ctx.createBuffer(1, samples.length, ${a.sampleRate}); buf.copyToChannel(samples, 0);
      const dest = ctx.createMediaStreamDestination(); const src = ctx.createBufferSource(); src.buffer = buf; src.connect(dest);
      const rec = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=opus" }); const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((r) => (rec.onstop = r));
      rec.start(250); src.start(); await new Promise((r) => (src.onended = r)); await new Promise((r) => setTimeout(r, 300)); rec.stop(); await done;
      const b = new Uint8Array(await new Blob(chunks, { type: "audio/webm" }).arrayBuffer()); let s = ""; b.forEach((x) => (s += String.fromCharCode(x))); return btoa(s);
    })()`);
  }

  // ---------- account + websocket (same calls the app makes) ----------
  const email = `e2e-smoketest-${Date.now()}@example.invalid`;
  const J = (m, u, b, h = {}) => fetch(SERVER + u, { method: m, headers: { "Content-Type": "application/json", ...h }, body: b ? JSON.stringify(b) : undefined });
  const tok = await (await J("POST", "/auth/signup", { email, password: "smoketest-pass-1", deviceId: crypto.randomUUID(), deviceName: "e2e", platform: "linux", capabilities: ["open_app", "web_search", "open_url"] })).json();
  const ticket = (await (await J("POST", "/auth/ws-ticket", null, { Authorization: `Bearer ${tok.accessToken}` })).json()).ticket;
  const ws = new WebSocket(`${SERVER.replace(/^http/, "ws")}/ws?ticket=${ticket}`);
  const { handleAgentRequest } = require("../dist/main/agent/agentHost.js");
  const events = [];
  let resolveTurn;
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "auth_ok") ws.send(JSON.stringify({ type: "client_hello", features: ["pc_agent"] }));
    if (m.type === "agent_request") handleAgentRequest(m, (resp) => ws.send(JSON.stringify(resp)));
    if (m.type === "transcript") log("heard:", JSON.stringify(m.text));
    if (m.type === "agent_status") log(`agent ${m.state}:`, m.goal || m.text || "");
    if (m.type === "tool_call") log("client tool call:", m.name);
    if (m.type === "assistant_text" || m.type === "error") { log(`${m.type}:`, m.text || m.message); events.push(m); resolveTurn?.(m); }
  });
  await new Promise((r) => ws.on("open", r));
  await new Promise((r) => setTimeout(r, 2500));

  async function sayAndWait(text) {
    log("saying:", JSON.stringify(text));
    const audio = await speakToWebm(text);
    const reply = new Promise((r) => (resolveTurn = r));
    for (let i = 0; i < audio.length; i += 60_000) ws.send(JSON.stringify({ type: "audio_chunk", data: audio.slice(i, i + 60_000) }));
    ws.send(JSON.stringify({ type: "audio_end" }));
    const m = await Promise.race([reply, new Promise((r) => setTimeout(() => r({ type: "timeout" }), 240_000))]);
    // A real user spends a few seconds listening to the reply before speaking again; the server also needs a
    // moment after sending it to close out the turn (persist, release the per-user lock).
    await new Promise((r) => setTimeout(r, 3000));
    return m;
  }

  const results = [];
  const check = (name, ok, detail = "") => { results.push({ name, ok }); log(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`); };

  // Scenario 1: multi-step file task by voice
  await sayAndWait("Create a file called groceries.txt on my desktop with milk, eggs and bread.");
  const g = path.join(HOME, "Desktop/groceries.txt");
  const content = fs.existsSync(g) ? fs.readFileSync(g, "utf8").toLowerCase() : "";
  check("voice -> pc_task creates the file", ["milk", "eggs", "bread"].every((w) => content.includes(w)), JSON.stringify(content.slice(0, 80)));

  // Scenario 2: risky step -> spoken confirmation -> answered by voice on the next turn
  const ask = await sayAndWait("Delete groceries.txt from my desktop.");
  check("delete asks for confirmation first", /trash|yes to confirm/i.test(ask.text || "") && fs.existsSync(g), JSON.stringify(ask.text || ""));
  await sayAndWait("Yes.");
  check("after a spoken yes the file is gone", !fs.existsSync(g));

  log(`RESULT ${results.filter((r) => r.ok).length}/${results.length}`);
  ws.close();
  // cleanup the test user (and only it)
  try {
    const { createRequire } = require("module");
    const req = createRequire(path.join(__dirname, "../../server/package.json"));
    require(req.resolve("dotenv")).config({ path: path.join(__dirname, "../../server/.env") });
    const { PrismaClient } = req("@prisma/client");
    const p = new PrismaClient();
    const u = await p.user.findUnique({ where: { email } });
    if (u) {
      const convs = (await p.conversation.findMany({ where: { userId: u.id }, select: { id: true } })).map((c) => c.id);
      for (const [model, where] of [["message", { conversationId: { in: convs } }], ["taskStep", { task: { userId: u.id } }], ["task", { userId: u.id }], ["toolInvocation", { userId: u.id }], ["memoryFact", { userId: u.id }], ["usageEvent", { userId: u.id }], ["conversation", { userId: u.id }], ["refreshToken", { userId: u.id }], ["device", { userId: u.id }]]) {
        try { await p[model].deleteMany({ where }); } catch {}
      }
      await p.user.delete({ where: { id: u.id } });
      log("test user removed");
    }
    await p.$disconnect();
  } catch (e) {
    log("cleanup failed:", e.message);
  }
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  app.quit();
}
