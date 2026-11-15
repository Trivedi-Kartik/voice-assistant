// Browser route against a local mock shop, headless system Chrome. No AI involved: this checks the device-side
// behaviour (DOM listing, clicks, fills, and the safety stops) deterministically.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.KARVIX_BROWSER_HEADLESS = "1";
process.env.KARVIX_BROWSER_PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "kvx-browser-test-"));
const { webAction, closeBrowser } = require("../dist/main/agent/browser/browser.js");
const { start } = require("./mockShop.js");

const act = (name, args = {}, confirmed) => webAction({ name, args, ...(confirmed ? { confirmed: true } : {}) });

test("shopping flow: browse, add to cart, checkout — stops at Place order without a yes", async (t) => {
  const { server, base } = await start();
  t.after(async () => { await closeBrowser(); server.close(); fs.rmSync(process.env.KARVIX_BROWSER_PROFILE, { recursive: true, force: true }); });

  let r = await act("web_open", { url: base + "/" });
  assert.ok(r.ok, r.message);
  assert.match(r.observation.elements, /link "Blue Mug — \$12"/);
  assert.match(r.observation.elements, /untrusted/); // page text is labelled as untrusted data

  r = await act("web_click", { element: "Reject all" }); // privacy-friendly cookie choice works
  assert.ok(r.ok, r.message);
  r = await act("web_click", { element: "Blue Mug — $12" });
  assert.ok(r.ok, r.message);
  assert.match(r.observation.elements, /Page: Blue Mug/);

  r = await act("web_click", { element: "Add to cart" }); // not a committing action -> no confirmation
  assert.ok(r.ok, r.message);
  r = await act("web_read");
  assert.match(r.data.text, /Added Blue Mug to cart/);

  r = await act("web_click", { element: "Cart" });
  assert.match(r.observation.elements, /Page: Cart/);
  r = await act("web_read");
  assert.match(r.data.text, /Blue Mug/);
  r = await act("web_click", { element: "Proceed to checkout" }); // checkout itself is allowed
  assert.ok(r.ok, r.message);
  assert.match(r.observation.elements, /Page: Checkout/);

  r = await act("web_fill", { element: "Full name", text: "Kartik T" });
  assert.ok(r.ok, r.message);
  assert.match(r.observation.elements, /= "Kartik T"/);

  r = await act("web_fill", { element: "Card number", text: "4111111111111111" });
  assert.strictEqual(r.ok, false, "must refuse to type card numbers");
  assert.match(r.message, /never type/);

  r = await act("web_click", { element: "Place order" });
  assert.strictEqual(r.ok, false, "Place order must not run without a yes");
  assert.deepStrictEqual({ kind: r.needsConfirmation.kind, target: r.needsConfirmation.target }, { kind: "click", target: "Place order" });

  r = await act("web_click", { element: "Place order" }, true); // after the user's spoken yes
  assert.ok(r.ok, r.message);
  assert.match(r.observation.elements, /Order placed!/);
});

test("refuses passwords, non-web URLs, and needs a yes even when the page itself demands a risky click", async (t) => {
  const { server, base } = await start();
  t.after(async () => { await closeBrowser(); server.close(); });

  let r = await act("web_open", { url: "file:///etc/passwd" });
  assert.strictEqual(r.ok, false);
  assert.match(r.message, /only open http/);
  r = await act("web_open", { url: "javascript:alert(1)" });
  assert.strictEqual(r.ok, false);

  r = await act("web_open", { url: base + "/login" });
  assert.ok(r.ok, r.message);
  r = await act("web_fill", { element: "Password", text: "hunter2" });
  assert.strictEqual(r.ok, false, "must refuse to type passwords");
  r = await act("web_fill", { element: "Email", text: "me@example.com" });
  assert.ok(r.ok, r.message);

  r = await act("web_open", { url: base + "/evil" });
  r = await act("web_click", { element: "Delete account" });
  assert.strictEqual(r.ok, false, "prompt injection on the page can't make it click Delete account");
  assert.ok(r.needsConfirmation);
});

test("a benign-sounding button that actually commits a payment form is still stopped; Enter in a comment/chat box needs a yes, in search it doesn't", async (t) => {
  const { server, base } = await start();
  t.after(async () => { await closeBrowser(); server.close(); });
  let r = await act("web_open", { url: base + "/checkout2" });
  assert.ok(r.ok, r.message);
  r = await act("web_click", { element: "Continue" });
  assert.strictEqual(r.ok, false, "a submit inside a payment form needs a yes even though its label says Continue");
  assert.ok(r.needsConfirmation);

  r = await act("web_click", { element: "Comment" });
  r = await act("web_fill", { element: "Comment", text: "hello" });
  r = await act("web_press", { key: "Enter" });
  assert.strictEqual(r.ok, false, "Enter in a comment box can post it");
  assert.ok(r.needsConfirmation);

  r = await act("web_fill", { element: "Search", text: "mugs" });
  r = await act("web_press", { key: "Enter" });
  assert.ok(r.ok, r.message); // search boxes are fine
});
