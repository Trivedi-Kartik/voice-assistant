// tsc only emits .js — copy the non-TypeScript runtime assets (the Linux accessibility helper script) next to the
// compiled code so they ship inside the packaged app (read from app.asar via fs and passed to python3 -c).
const fs = require("fs");
const path = require("path");
const pairs = [
  ["src/main/agent/a11y/atspi_helper.py", "dist/main/agent/a11y/atspi_helper.py"],
  ["src/main/agent/a11y/portal_helper.py", "dist/main/agent/a11y/portal_helper.py"],
];
for (const [from, to] of pairs) {
  const src = path.join(__dirname, "..", from);
  const dest = path.join(__dirname, "..", to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
console.log("copied", pairs.length, "runtime asset(s)");
