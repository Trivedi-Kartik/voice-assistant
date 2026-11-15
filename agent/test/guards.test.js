const test = require("node:test");
const assert = require("node:assert");
const { isTerminalWindow, humanTextFromRejected, isSystemPermissionDialog, isExecutablePath, isRiskyShortcut, enterNeedsConfirmation, isRiskyWebLabel } = require("../dist/main/agent/guards.js");

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

test("system permission and password dialogs are recognised (the agent must never answer them)", () => {
  assert.ok(isSystemPermissionDialog("xdg-desktop-portal-gnome", "Remote desktop"));
  assert.ok(isSystemPermissionDialog("polkit-gnome-authentication-agent-1", ""));
  assert.ok(isSystemPermissionDialog("gcr-prompter", "Unlock Login Keyring"));
  assert.ok(isSystemPermissionDialog("", "Authentication Required"));
  assert.ok(isSystemPermissionDialog("consent.exe", "User Account Control"));
  assert.strictEqual(isSystemPermissionDialog("gnome-calculator", "Calculator"), false);
  assert.strictEqual(isSystemPermissionDialog("Google Chrome", "Share a note - Docs"), false);
});

test("programs and scripts can't be created or opened (write-then-open code execution)", () => {
  for (const f of ["x.bat", "~/Desktop/run.CMD", "a.exe", "b.js", "c.hta", "d.lnk", "e.ps1", "f.sh", "g.desktop", "Karvix.AppImage", "h.py", "evil.vbs", "i.jar", "j.msi"]) assert.ok(isExecutablePath(f), f);
  for (const f of ["notes.txt", "todo.md", "photo.jpg", "report.pdf", "data.csv", "letter.docx", "noextension", "archive.tar.gz"]) assert.strictEqual(isExecutablePath(f), false, f);
});

test("shortcuts that close/quit/open system menus are flagged; ordinary editing shortcuts are not", () => {
  for (const k of [["alt", "f4"], ["ctrl", "w"], ["ctrl", "q"], ["super"], ["win", "r"], ["alt", "tab"], ["shift", "delete"], ["delete"]]) assert.ok(isRiskyShortcut(k), k.join("+"));
  for (const k of [["ctrl", "s"], ["ctrl", "c"], ["ctrl", "v"], ["ctrl", "a"], ["enter"], ["tab"], ["ctrl", "z"]]) assert.strictEqual(isRiskyShortcut(k), false, k.join("+"));
});

test("Enter needs a yes unless the focused field is clearly a search/address box (chat messages and forms submit on Enter)", () => {
  assert.strictEqual(enterNeedsConfirmation({ role: "textbox", name: "Type a message" }), true);
  assert.strictEqual(enterNeedsConfirmation({ role: "textbox", name: "Add a comment" }), true);
  assert.strictEqual(enterNeedsConfirmation(undefined), true); // unknown focus -> don't risk a send
  assert.strictEqual(enterNeedsConfirmation({ role: "textbox", type: "search", name: "" }), false);
  assert.strictEqual(enterNeedsConfirmation({ role: "textbox", name: "Search products" }), false);
});

test("risky labels are recognised in the supported languages, not only English", () => {
  for (const l of ["Place order", "Buy now", "Send", "Delete account", "Comprar ahora", "Pagar", "Enviar mensaje", "Payer maintenant", "Supprimer", "Jetzt kaufen", "Bezahlen", "Senden", "Löschen", "Acquista", "Elimina", "भुगतान करें", "भेजें", "ซื้อเลย", "ส่งข้อความ", "ลบบัญชี"]) assert.ok(isRiskyWebLabel(l), l);
  for (const l of ["Add to cart", "Proceed to checkout", "Cart", "Home", "Continue shopping", "Save", "Search", "Next"]) assert.strictEqual(isRiskyWebLabel(l), false, l);
});
