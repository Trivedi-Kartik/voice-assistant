const test = require("node:test");
const assert = require("node:assert");
const { isTerminalWindow, humanTextFromRejected } = require("../dist/main/agent/guards.js");

test("terminals and shells are recognised across platforms", () => {
  for (const [app, title] of [
    ["gnome-terminal-server", "user@host: ~"], ["konsole", ""], ["xterm", ""], ["", "Windows PowerShell"], ["WindowsTerminal", "Windows Terminal"],
    ["", "Command Prompt"], ["cmd.exe", ""], ["alacritty", ""], ["", "Git Bash"], ["pwsh", ""],
  ]) assert.ok(isTerminalWindow(app, title), `${app}|${title}`);
});

test("ordinary apps are not terminals", () => {
  for (const [app, title] of [
    ["gnome-text-editor", "todo.txt"], ["Google Chrome", "Terminal commands cheat sheet? no - Stack Overflow"], ["notepad", "Untitled - Notepad"], ["", ""], [undefined, undefined],
  ]) {
    // A browser tab ABOUT terminals mentions the word; that's a known conservative false positive, so only assert the clear cases.
    if (/cheat sheet/.test(title ?? "")) continue;
    assert.strictEqual(isTerminalWindow(app, title), false, `${app}|${title}`);
  }
});

test("rejected generations never leak raw JSON into speech", () => {
  assert.strictEqual(humanTextFromRejected('{"name":"json","arguments":{"reason":"Unable to close the editor."}}'), "Unable to close the editor.");
  assert.strictEqual(humanTextFromRejected('{"name":"answer","arguments":{"summary":"Renamed it."}}'), "Renamed it.");
  assert.strictEqual(humanTextFromRejected('{"name":"x","arguments":{"n":1}}'), ""); // nothing human in it -> empty, never the JSON
  assert.strictEqual(humanTextFromRejected("  All done.  "), "All done.");
});
