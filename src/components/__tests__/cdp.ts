import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A browser, driven over the Chrome DevTools Protocol, with no dependency.
 *
 * WHO CALLS THIS: `purchase-e2e.test.ts` next door, and nothing else. That
 * suite is the only thing in this repository that cannot be proved any other
 * way: `walletSigner` returning a real signer, the Wallet Standard registry
 * being read out of `window`, and Continue and Pay turning back on are all
 * WIRING, and a unit test that mocks the wiring proves the mock. So the test
 * needs a page, a registry, an extension registering into it, and a server
 * that verifies the ed25519 signature that comes out the other end.
 *
 * WHY THERE IS NO PLAYWRIGHT OR PUPPETEER HERE. Both would be a browser
 * automation dependency for what this file does in about a hundred lines:
 * launch Chrome with a debugging port, open one WebSocket to it, and send
 * JSON. Node 22 and later ship `WebSocket` as a global, which is the only
 * thing that used to make this a package. `src/lib/wallet/standard.ts` makes
 * the same argument about `@wallet-standard/app`; this repo's ladder
 * (CLAUDE.md) is the same ladder either way. What is given up is real: no
 * auto-waiting, no selector engine, no screenshots, no trace viewer. What is
 * needed here is `evaluate` and `waitFor`, and both are below.
 *
 * // ponytail: one page, one tab, no frames, no downloads, no network
 * // interception. If a later test needs any of those, that is the moment to
 * // weigh a real automation library again rather than to grow this file.
 */

/** Where Chrome lives, in the order this project looks. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

export function findChrome(): string | null {
  return CHROME_CANDIDATES.find((path) => path && existsSync(path)) ?? null;
}

/** A port nobody is listening on right now. Racy by nature; good enough for a test. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls until `check` answers truthily, or gives up with `what` in the message.
 *
 * The whole of the auto-waiting a real automation library would bring, and the
 * reason every step below can be written as one line. A failure names what was
 * being waited for, because "timed out" on its own is the least useful thing a
 * failing end-to-end test can say.
 */
export async function waitFor<T>(
  what: string,
  check: () => Promise<T>,
  timeoutMs = 30_000,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  for (;;) {
    try {
      const value = await check();
      // Truthy is the whole condition, so the value handed back cannot be null
      // or undefined — which is what `NonNullable` above says to the caller
      // rather than making every one of them assert it.
      if (value) return value as NonNullable<T>;
      last = value;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}. Last saw: ${String(last)}`);
    }
    await sleep(100);
  }
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

export type Browser = {
  /** Runs an expression in the page and returns its value; awaits a promise result. */
  evaluate: <T>(expression: string) => Promise<T>;
  /** Registers a script to run before anything else on every document from now on. */
  addInitScript: (source: string) => Promise<void>;
  goto: (url: string) => Promise<void>;
  screenshot: () => Promise<Buffer>;
  resize: (width: number, height: number) => Promise<void>;
  close: () => Promise<void>;
};

/**
 * Starts headless Chrome and attaches to one blank page.
 *
 * `--user-data-dir` is a fresh temporary directory per launch, which is what
 * keeps a test run out of the developer's own profile — the extensions, the
 * cookies and the wallet they actually use are none of this suite's business.
 */
export async function launchChrome(): Promise<Browser> {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      "No Chrome or Chromium found. Set CHROME_PATH to a browser binary; the paths this " +
        `project looks in are: ${CHROME_CANDIDATES.filter(Boolean).join(", ")}`,
    );
  }

  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "mdp-e2e-"));
  const child: ChildProcess = spawn(
    chrome,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--hide-scrollbars",
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const version = await waitFor(
    "Chrome's debugging endpoint",
    async () => {
      if (child.exitCode !== null) {
        throw new Error(`Chrome exited with ${child.exitCode}. stderr: ${stderr.slice(0, 500)}`);
      }
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      return response.ok ? ((await response.json()) as { webSocketDebuggerUrl: string }) : null;
    },
    20_000,
  );

  const socket = new WebSocket(version.webSocketDebuggerUrl);
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let closed = false;

  socket.addEventListener("message", (event) => {
    const frame = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: { message: string };
    };
    if (frame.id === undefined) return; // An event. Nothing here subscribes to any.
    const waiter = pending.get(frame.id);
    if (!waiter) return;
    pending.delete(frame.id);
    if (frame.error) waiter.reject(new Error(`CDP: ${frame.error.message}`));
    else waiter.resolve(frame.result);
  });
  socket.addEventListener("close", () => {
    closed = true;
    for (const waiter of pending.values()) waiter.reject(new Error("The browser connection closed."));
    pending.clear();
  });

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Could not open the browser socket.")), {
      once: true,
    });
  });

  function send<T>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    if (closed) return Promise.reject(new Error("The browser connection closed."));
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  // `flatten: true` puts the page's messages on this same socket, tagged with a
  // session id, instead of wrapping them in Target.sendMessageToTarget.
  const { targetId } = await send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send<{ sessionId: string }>("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);

  const browser: Browser = {
    async evaluate<T>(expression: string): Promise<T> {
      const result = await send<{
        result: { value?: T };
        exceptionDetails?: { exception?: { description?: string }; text: string };
      }>(
        "Runtime.evaluate",
        {
          expression,
          awaitPromise: true,
          returnByValue: true,
          // So a `waitFor` predicate can call `document.querySelector` without
          // the page's own console noise ending up in the answer.
          userGesture: true,
        },
        sessionId,
      );
      if (result.exceptionDetails) {
        throw new Error(
          `Page threw: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
        );
      }
      return result.result.value as T;
    },

    async addInitScript(source: string): Promise<void> {
      await send("Page.addScriptToEvaluateOnNewDocument", { source }, sessionId);
    },

    async goto(url: string): Promise<void> {
      await send("Page.navigate", { url }, sessionId);
      await waitFor(`${url} to finish loading`, () =>
        browser.evaluate<boolean>("document.readyState === 'complete'"),
      );
    },

    async screenshot(): Promise<Buffer> {
      const shot = await send<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      return Buffer.from(shot.data, "base64");
    },

    async resize(width: number, height: number): Promise<void> {
      await send(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
    },

    async close(): Promise<void> {
      try {
        await send("Browser.close");
      } catch {
        // Already gone, or the socket beat us to it. The kill below is what
        // actually guarantees no Chrome is left behind.
      }
      socket.close();
      // By PID, never by name (CLAUDE.md): this is the process this function
      // started and no other.
      if (child.exitCode === null) child.kill("SIGKILL");
      // Chrome writes to its profile as it dies, so a bare rm races it and
      // throws ENOTEMPTY. Retries, and then silence: a temporary directory the
      // operating system will clear anyway must never fail a test.
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      } catch {
        // Left for the OS.
      }
    },
  };

  return browser;
}
