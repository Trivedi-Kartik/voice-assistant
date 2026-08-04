// Per-user serialization: only one tool-calling turn runs at a time per user, even
// if they have two devices connected simultaneously. This directly protects the
// shared Groq quota from one user's concurrent devices doubling their draw, and
// keeps conversation history append-order sane. See docs/ARCHITECTURE.md.
const busyUsers = new Set<string>();

export function tryAcquireUserLock(userId: string): boolean {
  if (busyUsers.has(userId)) return false;
  busyUsers.add(userId);
  return true;
}

export function releaseUserLock(userId: string): void {
  busyUsers.delete(userId);
}
