/// <reference lib="dom" />
// Runs INSIDE the web page (serialized by Playwright's page.evaluate). Pure DOM — no imports allowed.
// Collects the page's interactive elements and gives each a stable id (data-kvx) that survives re-snapshots.

export interface PageElement {
  id: string;
  role: string;
  name: string;
  type?: string;
  value?: string;
  href?: string;
  flags: string[];
  secret: boolean;
  risky: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  text: string;
  elements: PageElement[];
  more: boolean;
}

// Must stay fully self-contained (Playwright serializes this function's source into the page; it can't see imports).
export function collectPage(opts: { max: number; secret: string; risky: string }): PageSnapshot {
  const maxElements = opts.max;
  const secretSource = opts.secret;
  const riskySource = opts.risky;
  const w = window as unknown as { __kvx?: { next: number } };
  w.__kvx ??= { next: 1 };
  const secretRe = new RegExp(secretSource, "i");
  const riskyRe = new RegExp(riskySource, "i");
  const clean = (s: string | null | undefined, n = 80) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

  const SELECTOR =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [contenteditable=""], [contenteditable="true"]';

  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };

  const labelOf = (el: HTMLElement): string => {
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      if (clean(t)) return clean(t);
    }
    const input = el as HTMLInputElement;
    if (input.labels && input.labels.length) return clean(input.labels[0].textContent);
    const txt = clean(el.innerText || el.textContent);
    if (txt) return txt;
    return clean(input.placeholder || el.getAttribute("title") || el.getAttribute("alt") || input.name || (input.type === "submit" || input.type === "button" ? input.value : ""));
  };

  const roleOf = (el: HTMLElement): string => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const t = ((el as HTMLInputElement).type || "text").toLowerCase();
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio";
      if (t === "submit" || t === "button" || t === "image" || t === "reset") return "button";
      return "textbox";
    }
    return "button";
  };

  const all = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
  const elements: PageElement[] = [];
  const listed = new Set<Element>();
  let more = false;
  for (const el of all) {
    if (!visible(el)) continue;
    if (elements.length >= maxElements) {
      more = true;
      break;
    }
    // A control nested inside another one with the same label (e.g. <a href><button>Checkout</button></a>, very
    // common) is ONE thing to the user — list only the outer one so the model never sees an ambiguous pair.
    const outer = el.parentElement?.closest(SELECTOR) as HTMLElement | null;
    if (outer && listed.has(outer) && labelOf(outer) === labelOf(el)) continue;
    if (!el.hasAttribute("data-kvx")) el.setAttribute("data-kvx", String(w.__kvx.next++));
    listed.add(el);
    const input = el as HTMLInputElement;
    const type = el.tagName.toLowerCase() === "input" ? (input.type || "text").toLowerCase() : undefined;
    const name = labelOf(el);
    const autocomplete = el.getAttribute("autocomplete") ?? "";
    const secret = type === "password" || secretRe.test(`${input.name ?? ""} ${autocomplete} ${name}`);
    const role = roleOf(el);
    const flags: string[] = [];
    if (input.disabled || el.getAttribute("aria-disabled") === "true") flags.push("disabled");
    if (input.checked || el.getAttribute("aria-checked") === "true") flags.push("checked");
    if (input.required) flags.push("required");
    if (document.activeElement === el) flags.push("focused");
    let value: string | undefined;
    if ((role === "textbox" || role === "combobox") && !secret && "value" in input) value = clean(input.value, 120) || undefined;
    if (el.tagName.toLowerCase() === "select") {
      const s = el as unknown as HTMLSelectElement;
      value = clean(s.options[s.selectedIndex]?.text, 80) || undefined;
    }
    const a = el as HTMLAnchorElement;
    let href: string | undefined;
    if (el.tagName.toLowerCase() === "a" && a.href) {
      try {
        const u = new URL(a.href);
        href = u.origin === location.origin ? u.pathname + u.search : u.host + u.pathname;
        href = href.slice(0, 80);
      } catch {
        /* ignore */
      }
    }
    // Structural signal that doesn't depend on a (page-controlled) label: a submit control inside a form that asks for payment
    // or identity details is the commit step, whatever it says on the button.
    const form = el.closest("form");
    const isSubmit = (type === "submit" || (el.tagName.toLowerCase() === "button" && (el as HTMLButtonElement).type !== "button")) && !!form;
    const formAsksSecrets = !!form && Array.from(form.querySelectorAll<HTMLInputElement>("input")).some((i) => i.type === "password" || /cc-|card|cvv|cvc|iban/i.test(`${i.autocomplete} ${i.name}`));
    elements.push({ id: `w${el.getAttribute("data-kvx")}`, role, name, type, value, href, flags, secret, risky: role !== "textbox" && (riskyRe.test(name) || (isSubmit && formAsksSecrets)) });
  }

  const textRaw = (document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
  return { url: location.href, title: document.title, text: textRaw.slice(0, 1500), elements, more };
}
