import { session } from "electron";

// Set from the main process (not a static <meta> tag) so dev and packaged builds
// can have different policies. Vite's dev client injects an inline module script
// for React Fast Refresh and uses eval-based transforms — a strict production CSP
// blocks that outright and leaves the page blank before React ever mounts. The
// packaged app never talks to a Vite dev server, so it gets the strict policy.
export function applyContentSecurityPolicy(isDev: boolean): void {
  const policy = isDev
    ? "default-src 'self' http://localhost:5173 ws://localhost:5173; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; " +
      "style-src 'self' 'unsafe-inline'"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}
