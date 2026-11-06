#!/usr/bin/env bun
/*
Usage:
  VerifyDesign.ts <url-or-path> <out-dir> [--viewport WIDTHxHEIGHT] [--full] [--a11y|--no-a11y]

Runs a thin smoke check for a rendered design in a fresh local headless Chrome or Chromium
(Tools/lib/headless.ts; CHROME_PATH picks the browser, CHROME_FLAGS adds launch flags). The
browser uses a throwaway profile, so the check never drives the user's own windows or logins.

What it does:
- Opens the URL or local file at the requested viewport (applied), waits for the load and for
  the DOM and fonts to settle, and fails (exit 1) before any screenshot when either step fails,
  so a stale or error page is never captured and reported as the page.
- Saves a PNG of the viewport (--full: the whole page) and refuses a blank frame (no visible
  text or media) instead of saving it as the page.
- Runs accessibility heuristics over the rendered DOM: image alt text, button and link names,
  form labels, heading order.

What it does NOT verify, and says so in its JSON under not_verified:
- Colour contrast. The a11y pass is DOM heuristics (names, alt text, labels, heading order),
  not axe-core and not WCAG AA contrast.
- How the page looks. The screenshot is evidence for a reader (the agent or the user), not a
  judgement; this tool does not decide whether the design is good.

Exit: 0 pass · 1 fail (load, capture or a11y) · 2 usage · 3 no headless browser could be started
*/
import { mkdirSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserUnavailable, HeadlessPage } from "./lib/headless.ts";

type TreeNode = {
  ref?: string;
  role?: string;
  name?: string;
  text?: string;
  alt?: string;
  href?: string;
  level?: number;
  children?: TreeNode[];
};
type Violation = { type: string; count: number; examples: { ref?: string; text?: string }[] };
type A11yResult = {
  engine: "dom-heuristic";
  limitations: string[];
  violations: Violation[];
  pass: boolean;
};

/** What this check never verifies; printed in every result so a pass is not read as more than it is. */
export const NOT_VERIFIED = [
  "contrast: colour contrast (WCAG AA) is not checked; the a11y pass covers names, alt text, labels and heading order only",
  "appearance: the screenshot is evidence to read, not a design judgement; look at it (or have the user look) before calling the design done",
] as const;

const LIMITATIONS = ["no-contrast-check", "no-dynamic-aria-live-check", "no-css-parsed-check"];

type StepResult = { code: number; stderr: string };
/**
 * Why the page cannot be trusted as loaded. A failed open or wait-stable is a failure on its own: a screenshot taken
 * after it would show whatever was already there. `wait` is null when open failed and wait-stable never ran. Pure.
 */
export function loadErrors(open: StepResult, wait: StepResult | null): string[] {
  const errors: string[] = [];
  if (open.code !== 0) errors.push(`open failed (exit ${open.code}): ${open.stderr.trim() || "no stderr"}`);
  if (wait === null && open.code === 0) errors.push("wait-stable did not run");
  if (wait && wait.code !== 0) errors.push(`wait-stable failed (exit ${wait.code}): ${wait.stderr.trim() || "no stderr"}`);
  return errors;
}

/** The run's verdict: loaded, captured, and the a11y heuristics passed (or were skipped). Pure. */
export function verdict(o: { open: StepResult; wait: StepResult | null; screenshot: string | null; a11yPass: boolean }): { pass: boolean; errors: string[] } {
  const errors = loadErrors(o.open, o.wait);
  if (!errors.length && o.screenshot === null) errors.push("no screenshot");
  return { pass: errors.length === 0 && o.a11yPass, errors };
}

function walkTree(node: TreeNode, out: TreeNode[] = []): TreeNode[] {
  out.push(node);
  for (const child of node.children ?? []) walkTree(child, out);
  return out;
}

function textOf(n: TreeNode): string {
  return `${n.name ?? ""} ${n.text ?? ""}`.trim();
}

function add(map: Map<string, Violation>, type: string, node: TreeNode): void {
  const v = map.get(type) ?? { type, count: 0, examples: [] };
  v.count += 1;
  if (v.examples.length < 5) v.examples.push({ ref: node.ref, text: textOf(node) });
  map.set(type, v);
}

export function a11yFromTree(root: TreeNode): A11yResult {
  const nodes = walkTree(root);
  const violations = new Map<string, Violation>();
  let previousHeading = 0;
  let sawHeading = false;
  for (const n of nodes) {
    const role = (n.role ?? "").toLowerCase();
    const label = textOf(n);
    if (role === "img" && !label && !n.alt) add(violations, "img-alt", n);
    if (role === "button" && !label) add(violations, "button-name", n);
    if (role === "a" && (!label || !n.href)) add(violations, "link-name", n);
    if (["textbox", "combobox", "spinbutton"].includes(role) && !label) add(violations, "form-label", n);
    if (role === "heading" && typeof n.level === "number") {
      if (!sawHeading && n.level > 1) add(violations, "heading-order", n);
      if (sawHeading && n.level > previousHeading + 1) add(violations, "heading-order", n);
      sawHeading = true;
      previousHeading = n.level;
    }
  }
  const list = [...violations.values()];
  return { engine: "dom-heuristic", limitations: LIMITATIONS, violations: list, pass: list.length === 0 };
}

/**
 * Evaluated in the page: the visible, exposed elements the heuristics look at, in document order, with a
 * simplified accessible name (aria-labelledby, aria-label, labels, alt, value, visible text, title, placeholder).
 * Decorative images (alt="", role=presentation/none) and aria-hidden subtrees are left out, as an accessibility
 * tree would.
 */
export const DOM_TREE_EXPR = `(() => {
  const visible = (el) => !el.closest('[aria-hidden="true"]') && (typeof el.checkVisibility !== 'function' || el.checkVisibility());
  const txt = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const byIds = (ids) => txt(ids.split(/\\s+/).map((id) => { const r = document.getElementById(id); return r ? r.textContent : ''; }).join(' '));
  const inner = (el) => {
    let s = el.innerText || '';
    for (const img of el.querySelectorAll('img[alt], [role="img"][aria-label]')) s += ' ' + (img.getAttribute('alt') || img.getAttribute('aria-label') || '');
    return txt(s);
  };
  const nameOf = (el, role) => {
    const lb = el.getAttribute('aria-labelledby');
    if (lb && byIds(lb)) return byIds(lb);
    if (txt(el.getAttribute('aria-label'))) return txt(el.getAttribute('aria-label'));
    if (el.labels && el.labels.length) { const l = txt([...el.labels].map((x) => x.innerText).join(' ')); if (l) return l; }
    if (role === 'img') return txt(el.getAttribute('alt')) || txt(el.getAttribute('title')) || (el.tagName === 'svg' ? txt((el.querySelector('title') || {}).textContent) : '');
    if (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(el.type)) return txt(el.value) || (el.type === 'submit' ? 'Submit' : el.type === 'reset' ? 'Reset' : '');
    if (['button', 'a', 'heading'].includes(role)) return inner(el) || txt(el.getAttribute('title'));
    return txt(el.getAttribute('title')) || txt(el.getAttribute('placeholder'));
  };
  const roleOf = (el) => {
    const r = (el.getAttribute('role') || '').toLowerCase();
    if (r === 'presentation' || r === 'none') return null;
    if (r === 'img' || r === 'button' || r === 'heading' || r === 'textbox' || r === 'combobox' || r === 'spinbutton') return r;
    if (r === 'link') return 'a';
    const t = el.tagName;
    if (t === 'IMG') return el.getAttribute('alt') === '' ? null : 'img';
    if (t === 'BUTTON') return 'button';
    if (t === 'A' && el.hasAttribute('href')) return 'a';
    if (/^H[1-6]$/.test(t)) return 'heading';
    if (t === 'TEXTAREA') return 'textbox';
    if (t === 'SELECT') return 'combobox';
    if (t === 'INPUT') {
      const ty = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'image'].includes(ty)) return ty === 'image' ? 'img' : 'button';
      if (ty === 'number') return 'spinbutton';
      if (['text', 'email', 'search', 'tel', 'url', 'password'].includes(ty)) return 'textbox';
    }
    return null;
  };
  const children = [];
  let n = 0;
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    const role = roleOf(el);
    if (!role || !visible(el)) continue;
    const node = { ref: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '@' + (n++), role, name: nameOf(el, role) };
    if (role === 'img' && el.hasAttribute('alt')) node.alt = el.getAttribute('alt');
    if (role === 'a') node.href = el.getAttribute('href') || '';
    if (role === 'heading') node.level = /^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : Number(el.getAttribute('aria-level') || 2);
    children.push(node);
  }
  return { role: 'document', name: document.title, children };
})()`;

/** Evaluated in the page: does the frame show anything (visible text or a sized media element)? */
export const BLANK_EXPR = `(() => {
  if (!document.body) return true;
  if ((document.body.innerText || '').trim().length > 0) return false;
  for (const el of document.querySelectorAll('img, svg, canvas, video, picture, iframe, object, embed')) {
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) return false;
  }
  return true;
})()`;

function usage(): string {
  return "usage: VerifyDesign.ts <url-or-path> <out-dir> [--viewport WIDTHxHEIGHT] [--full] [--a11y|--no-a11y]";
}

function parseArgs(): { input: string; outDir: string; w: number; h: number; a11y: boolean; full: boolean } {
  const args = Bun.argv.slice(2);
  const input = args.shift();
  const outDir = args.shift();
  if (!input || !outDir) {
    console.error(usage());
    process.exit(2);
  }
  let viewport = "1440x900";
  let a11y = true;
  let full = false;
  while (args.length) {
    const flag = args.shift();
    if (flag === "--viewport") viewport = args.shift() ?? "";
    else if (flag === "--a11y") a11y = true;
    else if (flag === "--no-a11y") a11y = false;
    else if (flag === "--full") full = true;
    else {
      console.error(`unknown flag: ${flag ?? ""}`);
      process.exit(2);
    }
  }
  const m = /^(\d+)x(\d+)$/.exec(viewport);
  const w = m ? Number(m[1]) : 0;
  const h = m ? Number(m[2]) : 0;
  if (!m || w < 320 || h < 320 || w > 7680 || h > 7680) {
    console.error("invalid viewport; expected WIDTHxHEIGHT with each value in [320, 7680]");
    process.exit(2);
  }
  return { input, outDir, w, h, a11y, full };
}

async function resolveUrl(input: string): Promise<{ url: string; resolvedUrl: string }> {
  if (/^(https?|file):\/\//.test(input)) return { url: input, resolvedUrl: input };
  const abs = resolve(input);
  const s = await stat(abs).catch(() => null);
  if (!s) {
    console.error(`path does not exist: ${abs}`);
    process.exit(2);
  }
  return { url: input, resolvedUrl: pathToFileURL(abs).href };
}

async function main(): Promise<void> {
  if (Bun.argv.slice(2).length === 0) {
    console.error(usage());
    return;
  }
  const opts = parseArgs();
  const { url, resolvedUrl } = await resolveUrl(opts.input);
  const outDir = resolve(opts.outDir);
  try {
    mkdirSync(outDir, { recursive: true });
  } catch (e) {
    console.error(`failed to create output directory: ${(e as Error).message}`);
    process.exit(2);
  }
  const timestamp = new Date().toISOString();
  const viewport = { w: opts.w, h: opts.h, applied: true };
  let page: HeadlessPage;
  try {
    page = await HeadlessPage.launch({ width: opts.w, height: opts.h });
  } catch (e) {
    if (e instanceof BrowserUnavailable) {
      console.error(`no headless browser: ${e.message}`);
      process.exit(3);
    }
    throw e;
  }
  try {
    const openErr = await page.open(resolvedUrl);
    const open: StepResult = { code: openErr ? 1 : 0, stderr: openErr ?? "" };
    const waitErr = open.code === 0 ? await page.waitStable() : null;
    const wait: StepResult | null = open.code === 0 ? { code: waitErr ? 1 : 0, stderr: waitErr ?? "" } : null;
    const notLoaded = loadErrors(open, wait);
    if (notLoaded.length) {
      console.log(JSON.stringify({ url, resolvedUrl, viewport, screenshot: null, errors: notLoaded, not_verified: NOT_VERIFIED, pass: false, timestamp }, null, 2));
      process.exitCode = 1;
      return;
    }
    const shot = join(outDir, `${timestamp.replace(/[:.]/g, "-")}.png`);
    let screenshot: string | null = shot;
    let screenshotError: string | undefined;
    try {
      // A blank frame is refused instead of saved as the page.
      if (await page.evaluate<boolean>(BLANK_EXPR)) throw new Error("blank frame refused: no visible text or media on the page");
      writeFileSync(shot, await page.screenshot(opts.full));
    } catch (e) {
      screenshot = null;
      screenshotError = (e as Error).message || "screenshot failed";
    }
    let a11y: A11yResult | { skipped: true };
    if (opts.a11y) {
      const tree = await page.evaluate<TreeNode>(DOM_TREE_EXPR).catch((e: Error) => e);
      a11y = tree instanceof Error || !tree
        ? {
          engine: "dom-heuristic",
          limitations: LIMITATIONS,
          violations: [{ type: "tree-unavailable", count: 1, examples: [{ text: tree instanceof Error ? tree.message : "no tree" }] }],
          pass: false,
        }
        : a11yFromTree(tree);
    } else {
      a11y = { skipped: true };
    }
    const a11yPass = "skipped" in a11y ? true : a11y.pass;
    const { pass, errors } = verdict({ open, wait, screenshot, a11yPass });
    const result = {
      url,
      resolvedUrl,
      viewport,
      screenshot,
      ...(screenshotError ? { screenshotError } : {}),
      ...(errors.length ? { errors } : {}),
      a11y,
      not_verified: NOT_VERIFIED,
      pass,
      timestamp,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = pass ? 0 : 1;
  } finally {
    await page.close();
  }
}

if (import.meta.main) await main();
