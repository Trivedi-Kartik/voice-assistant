import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

// The PC agent may only touch files inside the user's home folder, and never hidden folders/files
// (~/.ssh, ~/.config, browser profiles, our own auth file…). Symlinks are resolved so a link inside
// home can't point the agent outside it.
export class PathError extends Error {}

export function homeDir(): string {
  return app.getPath("home");
}

export function resolveUserPath(input: string): string {
  if (typeof input !== "string" || !input.trim()) throw new PathError("No path given.");
  const home = homeDir();
  let p = input.trim().replace(/^["']|["']$/g, "");
  if (p === "~") p = home;
  else if (p.startsWith("~/") || p.startsWith("~\\")) p = path.join(home, p.slice(2));
  else if (!path.isAbsolute(p)) p = path.join(home, p);
  p = path.resolve(p);
  assertAllowed(p, home);
  // Resolve symlinks for the deepest existing ancestor and re-check it's still inside home.
  let probe = p;
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  if (fs.existsSync(probe)) assertAllowed(fs.realpathSync(probe), fs.realpathSync(home));
  return p;
}

function assertAllowed(p: string, home: string): void {
  const rel = path.relative(home, p);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new PathError(`I can only work with files inside your home folder (not ${p}).`);
  if (rel.split(path.sep).some((part) => part.startsWith("."))) throw new PathError("I don't touch hidden files or folders.");
}

// Show paths back to the planner/user in the short ~ form.
export function displayPath(p: string): string {
  const home = homeDir();
  return p === home ? "~" : p.startsWith(home + path.sep) ? `~/${path.relative(home, p).split(path.sep).join("/")}` : p;
}
