// Adapted from the upstream MIT-licensed tool (see LICENSE.txt): TOOLS/HyperFrames/probe.ts.
/**
 * headless: drive one page in a local headless Chrome or Chromium over the DevTools protocol,
 * with no npm dependency. Each session starts a fresh browser with a throwaway profile, so it
 * never touches the user's own browser windows, cookies or logins.
 *
 * Browser lookup (first match wins): $CHROME_PATH, the usual macOS app bundles, then
 * google-chrome / google-chrome-stable / chromium / chromium-browser / chrome on PATH.
 * Extra launch flags: $CHROME_FLAGS, space-separated (e.g. "--no-sandbox" inside a container).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  private constructor(private ws: WebSocket) {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id === undefined) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.fail(new Error(`CDP ${msg.error.code}: ${msg.error.message}`));
      else p.ok(msg.result);
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

/** One page in a fresh headless browser. Always `close()` it. */
export class HeadlessPage {
  private constructor(
    private cdp: Cdp,
    private sessionId: string,
    private chrome: ReturnType<typeof Bun.spawn>,
    private profile: string,
  ) {}

  /** Starts a browser with a throwaway profile and one blank page at the given viewport. */
  static async launch(viewport: { width: number; height: number }): Promise<HeadlessPage> {
    const browser = findBrowser();
    if (!browser) throw new BrowserUnavailable("no Chrome or Chromium found: install one or set CHROME_PATH");
    const profile = mkdtempSync(join(tmpdir(), "webdesign-headless-"));
    let chrome: ReturnType<typeof Bun.spawn>;
    try {
      chrome = Bun.spawn([
        browser, "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
        "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync",
        "--hide-scrollbars", `--window-size=${viewport.width},${viewport.height}`,
        ...(getEnv("CHROME_FLAGS")?.split(/\s+/).filter(Boolean) ?? []), "about:blank",
      ], { stdout: "ignore", stderr: "pipe", stdin: "ignore" });
    } catch (e) {
      rmSync(profile, { recursive: true, force: true });
      throw new BrowserUnavailable(`could not start ${browser}: ${(e as Error).message}`);
    }
    try {
      let cdp: Cdp;
      try {
        cdp = await Cdp.connect(await devtoolsUrl(chrome.stderr as ReadableStream<Uint8Array>, 20_000), 10_000);
      } catch (e) {
        throw e instanceof BrowserUnavailable ? e : new BrowserUnavailable((e as Error).message);
      }
      const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
      const page = new HeadlessPage(cdp, sessionId, chrome, profile);
      await cdp.send("Page.enable", {}, sessionId);
      await cdp.send("Runtime.enable", {}, sessionId);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false }, sessionId);
      return page;
    } catch (e) {
      chrome.kill("SIGKILL");
      await chrome.exited;
      rmSync(profile, { recursive: true, force: true });
      throw e;
    }
  }

  /** Navigates and waits for `document.readyState === "complete"` on that URL. Returns an error string, or null. */
  async open(url: string, timeoutMs = 60_000): Promise<string | null> {
    const nav = await this.cdp.send("Page.navigate", { url }, this.sessionId, timeoutMs).catch((e: Error) => ({ errorText: e.message }));
    if (nav?.errorText) return String(nav.errorText);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await Bun.sleep(100);
      const state = await this.evaluate<[string, string]>("[location.href, document.readyState]").catch(() => null);
      if (state && state[0] !== "about:blank" && state[1] === "complete") return null;
    }
    return `page did not finish loading within ${timeoutMs} ms`;
  }

  /**
   * Waits until the page's DOM size and text stop changing across consecutive polls (fonts and
   * scripts settled). Returns an error string, or null.
   */
  async waitStable(timeoutMs = 30_000, quietMs = 750): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    let last = "";
    let quietSince = Date.now();
    while (Date.now() < deadline) {
      await Bun.sleep(150);
      const sig = await this.evaluate<string>(
        "(document.fonts && document.fonts.status) + ':' + document.getElementsByTagName('*').length + ':' + (document.body ? document.body.innerText.length : -1)",
      ).catch(() => null);
      if (sig === null) continue;
      if (sig !== last) { last = sig; quietSince = Date.now(); continue; }
      if (!sig.startsWith("loading") && Date.now() - quietSince >= quietMs) return null;
    }
    return `page did not settle within ${timeoutMs} ms`;
  }

  /** Evaluates an expression (awaiting a returned promise) and returns its JSON value. */
  async evaluate<T = unknown>(expression: string, timeoutMs = 30_000): Promise<T> {
    const res = await this.cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, this.sessionId, timeoutMs);
    if (res?.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(`expression threw: ${String(d.exception?.description ?? d.text ?? "error").split("\n")[0]}`);
    }
    return res?.result?.value as T;
  }

  /** PNG bytes of the viewport (or the full page). */
  async screenshot(fullPage = false): Promise<Uint8Array> {
    const res = await this.cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage }, this.sessionId, 60_000);
    return Uint8Array.from(Buffer.from(String(res?.data ?? ""), "base64"));
  }

  async close(): Promise<void> {
    this.cdp.close();
    this.chrome.kill("SIGKILL");
    await this.chrome.exited;
    rmSync(this.profile, { recursive: true, force: true });
  }
}
