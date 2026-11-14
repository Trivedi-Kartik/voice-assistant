// Karvix 2 PC-agent eval: real planner (Groq, server code) + real desktop skills (agent code) inside
// Electron, each task in a fresh sandbox home folder. Dev-only; not packaged.
//   cd agent && npm run build && (cd ../server && npm run build) && node_modules/.bin/electron --no-sandbox eval/run-eval.js [taskId...]
const { app, clipboard, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../server/.env") });

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "karvix-eval-"));
app.setPath("home", path.join(SANDBOX, "home"));
app.setPath("userData", path.join(SANDBOX, "userData"));

// Never actually launch apps/URLs or open files on the developer's screen during the eval.
shell.openPath = async () => "";
shell.trashItem = async (p) => fs.rmSync(p, { recursive: true, force: true }); // sandbox: plain delete

app.whenReady().then(main).catch((e) => { console.error("EVAL HARNESS ERROR", e); app.exit(1); });

async function main() {
  const { handleAgentRequest } = require("../dist/main/agent/agentHost.js");
  // server/ compiles to ES modules -> dynamic import from this CommonJS script.
  const { AgentRunner } = await import(path.join(__dirname, "../../server/dist/agent/runner.js"));
  const { GroqPlanner } = await import(path.join(__dirname, "../../server/dist/agent/planner.js"));
  const tasks = require("./tasks.js");
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-") && !a.endsWith(".js"));
  const selected = only.length ? tasks.filter((t) => only.includes(t.id)) : tasks;
  const results = [];

  for (const task of selected) {
    const home = path.join(SANDBOX, "home");
    fs.rmSync(home, { recursive: true, force: true });
    for (const d of ["Desktop", "Documents", "Downloads"]) fs.mkdirSync(path.join(home, d), { recursive: true });
    for (const [rel, content] of Object.entries(task.setup || {})) {
      fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
      fs.writeFileSync(path.join(home, rel), content);
    }
    if (task.clipboard) clipboard.writeText(task.clipboard);

    const actions = [];
    const executed = [];
    let llmCalls = 0;
    const rpc = (kind, extra) =>
      new Promise((resolve) => handleAgentRequest({ type: "agent_request", taskId: "eval", requestId: String(Math.random()), kind, ...extra }, (m) => resolve(m.result)));
    const device = {
      observe: () => rpc("observe"),
      act: (action) => { executed.push(action); return rpc("act", { action }); },
      verify: (expect) => rpc("verify", { expect }),
    };
    const groq = new GroqPlanner(process.env.GROQ_API_KEY);
    const planner = { next: async (m) => { llmCalls++; const d = await groq.next(m); if (d.kind === "action") actions.push(d.action); return d; } };
    const runner = new AgentRunner({ goal: task.goal, language: task.language || "en", device, planner });

    const t0 = Date.now();
    let outcome, asked = 0, confirmations = 0;
    const answers = [...(task.answers || [])];
    try {
      outcome = await runner.start();
      for (let guard = 0; guard < 6 && (outcome.kind === "ask" || outcome.kind === "confirm"); guard++) {
        if (outcome.kind === "ask") { asked++; outcome = await runner.resumeWithAnswer(answers.shift() || "I don't know, use your best judgement."); }
        else { confirmations++; outcome = await runner.resumeWithConfirmation(task.confirm !== false); }
      }
    } catch (e) {
      outcome = { kind: "failed", reason: "harness error: " + e.message };
    }
    const r = { outcome, actions, executed };
    let pass = false;
    try { pass = !!task.check(home, r); } catch { pass = false; }
    // A task only passes if it also ENDED the right way (default: done) — a correct file followed by a
    // planner crash is not a success.
    if (!(task.okOutcomes || ["done"]).includes(outcome.kind)) pass = false;
    if (task.expectConfirm && confirmations === 0) pass = false;
    if (task.expectAsk && asked === 0) pass = false;
    const row = { id: task.id, pass, steps: actions.length, llmCalls, asked, confirmations, secs: +((Date.now() - t0) / 1000).toFixed(1), outcome: outcome.kind, said: (outcome.summary || outcome.reason || outcome.question || outcome.prompt || "").slice(0, 110) };
    results.push({ ...row, actions: actions.map((a) => ({ name: a.name, args: a.args })) });
    console.log(`${pass ? "PASS" : "FAIL"}  ${row.id.padEnd(22)} steps=${row.steps} llm=${row.llmCalls} ask=${row.asked} confirm=${row.confirmations} ${row.secs}s  ${row.outcome}: ${row.said}`);
  }

  const passed = results.filter((r) => r.pass).length;
  const avg = (k) => (results.reduce((s, r) => s + r[k], 0) / results.length).toFixed(1);
  console.log(`\nRESULT ${passed}/${results.length} passed (${Math.round((passed / results.length) * 100)}%)  avg steps=${avg("steps")} avg llm calls=${avg("llmCalls")} avg time=${avg("secs")}s`);
  fs.writeFileSync(path.join(__dirname, "last-results.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  app.quit();
}
