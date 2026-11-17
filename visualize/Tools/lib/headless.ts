// Adapted from MIT-licensed code (see LICENSE.txt).
/**
 * headless: run one expression in a page loaded by a local headless Chrome or Chromium, over the
 * DevTools protocol, with no npm dependency. Bake.ts uses it to let a page's scripts draw before
 * freezing a script-free copy.
 *
 * Browser lookup (first match wins): $CHROME_PATH, the usual macOS app bundles, then
 * google-chrome / google-chrome-stable / chromium / chromium-browser / chrome on PATH.
 * Extra launch flags: $CHROME_FLAGS, space-separated (e.g. "--no-sandbox" inside a container).
 */

import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getEnv } from "../_portable/paths.ts";

export class BrowserUnavailable extends Error {}

const MAC_APPS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
const PATH_BINS = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];

/** Path of a Chrome-family browser, or undefined when none is found. */
export function findBrowser(): string | undefined {
  const forced = getEnv("CHROME_PATH");
  if (forced) return existsSync(forced) ? forced : undefined;
  if (process.platform === "darwin") {
    const app = MAC_APPS.find((p) => existsSync(p));
    if (app) return app;
  }
  for (const bin of PATH_BINS) {
    const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" });
    const path = r.status === 0 ? r.stdout.split(/\r?\n/)[0]?.trim() : "";
    if (path) return path;
  }
  return undefined;
}

/**
 * Minimal flattened-session CDP client over Bun's WebSocket. Params and results are `any` on purpose:
 * they are untyped protocol JSON, and every field used is checked where read.
 */
class Cdp {
  private nextId = 1;
  private pending = new Map<number, { ok: (v: any) => void; fail: (e: Error) => void }>();
  private listeners: Array<(method: string, params: any, sessionId?: string) => void> = [];
  private constructor(private ws: WebSocket) {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.fail(new Error(`CDP ${msg.error.code}: ${msg.error.message}`));
        else p.ok(msg.result);
      } else if (msg.method) {
        for (const l of this.listeners) l(msg.method, msg.params, msg.sessionId);
      }
    };
  }
  static connect(url: string, timeoutMs: number): Promise<Cdp> {
    return new Promise((ok, fail) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => fail(new Error(`CDP connect timed out after ${timeoutMs} ms`)), timeoutMs);
      ws.onopen = () => { clearTimeout(timer); ok(new Cdp(ws)); };
      ws.onerror = () => { clearTimeout(timer); fail(new Error(`CDP connect failed: ${url}`)); };
    });
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 15_000): Promise<any> {
    const id = this.nextId++;
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => { this.pending.delete(id); fail(new Error(`CDP ${method} timed out`)); }, timeoutMs);
      this.pending.set(id, { ok: (v) => { clearTimeout(timer); ok(v); }, fail: (e) => { clearTimeout(timer); fail(e); } });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(l: (method: string, params: any, sessionId?: string) => void): void { this.listeners.push(l); }
  close(): void { try { this.ws.close(); } catch { /* socket already closed by the browser exit */ } }
}

/** Read the DevTools endpoint Chrome prints on stderr. */
async function devtoolsUrl(stderr: ReadableStream<Uint8Array>, timeoutMs: number): Promise<string> {
  const reader = stderr.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chunk = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), Math.max(1, deadline - Date.now())))]);
    if (chunk === null || chunk.done) break;
    text += decoder.decode(chunk.value);
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(text);
    if (m) { reader.releaseLock(); return m[1]!; }
  }
  throw new BrowserUnavailable(`headless browser did not report a DevTools endpoint within ${timeoutMs} ms: ${text.slice(-400)}`);
}

export interface EvaluateOptions {
  /** Viewport width in CSS pixels. */
  width: number;
  height?: number;
  /** Budget for the page load, in ms. */
  loadTimeoutMs?: number;
  /** Budget for the expression, in ms. */
  evalTimeoutMs?: number;
}

/**
 * Loads `url` at the given width and evaluates `fnSource` (the source of a function, possibly async)
 * in it; returns the function's JSON-serializable result. Throws BrowserUnavailable when no browser
 * can be started or reached.
 */
export async function evaluateInPage(url: string, fnSource: string, opts: EvaluateOptions): Promise<unknown> {
  const browser = findBrowser();
  if (!browser) throw new BrowserUnavailable("no Chrome or Chromium found: install one or set CHROME_PATH");
  const height = opts.height ?? 900;
  const profile = mkdtempSync(join(tmpdir(), "visualize-headless-"));
  let chrome: ReturnType<typeof Bun.spawn>;
  try {
    chrome = Bun.spawn([
      browser, "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
      "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync",
      `--window-size=${opts.width},${height}`, ...(getEnv("CHROME_FLAGS")?.split(/\s+/).filter(Boolean) ?? []), "about:blank",
    ], { stdout: "ignore", stderr: "pipe", stdin: "ignore" });
  } catch (e) {
    rmSync(profile, { recursive: true, force: true });
    throw new BrowserUnavailable(`could not start ${browser}: ${(e as Error).message}`);
  }
  let cdp: Cdp | undefined;
  try {
    try {
      cdp = await Cdp.connect(await devtoolsUrl(chrome.stderr as ReadableStream<Uint8Array>, 20_000), 10_000);
    } catch (e) {
      throw e instanceof BrowserUnavailable ? e : new BrowserUnavailable((e as Error).message);
    }
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: opts.width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await cdp.send("Page.navigate", { url }, sessionId);
    // Poll the page itself rather than trusting load events, which can arrive late for about:blank.
    const loadMs = opts.loadTimeoutMs ?? 20_000;
    const deadline = Date.now() + loadMs;
    let loaded = false;
    while (!loaded && Date.now() < deadline) {
      await Bun.sleep(50);
      const probe = await cdp.send("Runtime.evaluate", { expression: "[location.href, document.readyState]", returnByValue: true }, sessionId).catch(() => null);
      const [href, state] = (probe?.result?.value ?? []) as [string?, string?];
      loaded = href === url && state === "complete";
    }
    if (!loaded) throw new Error(`page did not finish loading within ${loadMs} ms: ${url}`);
    const evalMs = opts.evalTimeoutMs ?? 60_000;
    const res = await cdp.send("Runtime.evaluate", { expression: `(${fnSource})()`, awaitPromise: true, returnByValue: true }, sessionId, evalMs);
    if (res?.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(`expression threw: ${String(d.exception?.description ?? d.text ?? "error").split("\n")[0]}`);
    }
    return res?.result?.value;
  } finally {
    cdp?.close();
    chrome.kill("SIGKILL");
    await chrome.exited;
    rmSync(profile, { recursive: true, force: true });
  }
}
