import { spawn, type ChildProcess } from "node:child_process";
import { freePort, waitFor } from "./cdp";

/**
 * A real `next dev` on a free port, pointed at the test database.
 *
 * WHO CALLS THIS: `purchase-e2e.test.ts` next door, and nothing else.
 *
 * ## Why a real server rather than the route handlers
 *
 * Every other suite in this repository imports the route function and calls it
 * with a `Request`, which is faster and right for what those suites are asking.
 * This one is asking whether the BROWSER can buy a rectangle, so it needs the
 * page, the client bundle, hydration, `fetch`, multipart encoding by the
 * browser's own `FormData`, and a server that answers all of it. Nothing short
 * of a server proves that.
 *
 * ## Why `next dev`, and why the payment stub is not weakened to allow it
 *
 * The payment step needs `ALLOW_STUB_PAYMENTS`, and `isDeployed()` in
 * `src/lib/config.ts` refuses that flag on anything deployed — `VERCEL_ENV`
 * set, or a `NODE_ENV` that is neither `development` nor `test`. That refusal
 * is not in the way of this test; it is the reason this test runs where it
 * does. `NODE_ENV=development` on a developer's own machine is exactly the
 * case the flag exists for, and the guard stays exactly as written. The half
 * of this flow that CAN run against a deployed URL — connect and sign — is
 * smoked there separately, and the half that cannot is reported as not run
 * rather than claimed.
 *
 * ## What is deliberately overridden, and why each one
 *
 * - `DATABASE_URL`: `.env.local` points it at the APP database. `@next/env`
 *   never overwrites a variable that is already set, so passing the test
 *   database here is what keeps a test from writing rows into real data. The
 *   suite's own `beforeEach` truncate reaches only the test database, so a
 *   server on the wrong one would leave its rows behind forever.
 * - `ALLOW_UNTRUSTED_CLIENT_IP`: `next dev` sits behind no proxy, so without it
 *   every request is refused for having no trustworthy caller address. That is
 *   the flag's whole purpose. `vitest.setup.ts` DELETES it from this process on
 *   purpose — so that the unit suites exercise the strict path — which is why
 *   it has to be named again here rather than inherited.
 * - `ALLOW_STUB_PAYMENTS` and `NODE_ENV`: see above.
 * - `NEXT_DIST_DIR`: a dev server writes a turbopack cache with environment
 *   VALUES in it, and `check-build-secrets` fails any `npm run build` that
 *   finds one under `.next` — correctly, because on Vercel that cache is
 *   preserved between builds and would outlive the secret's own rotation. So
 *   this server writes somewhere else entirely rather than the guard being
 *   loosened to tolerate it. See the note on `distDir` in `next.config.ts`.
 */

/** Not `.next`, and not shipped. Gitignored beside it. */
const DIST_DIR = ".next-e2e";

export type DevServer = {
  origin: string;
  stop: () => Promise<void>;
};

export async function startDevServer(): Promise<DevServer> {
  const port = await freePort();
  const child: ChildProcess = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_DIST_DIR: DIST_DIR,
      ALLOW_STUB_PAYMENTS: "true",
      ALLOW_UNTRUSTED_CLIENT_IP: "true",
      DATABASE_URL: process.env.DATABASE_URL,
      // Next opens a browser or prints upgrade notices otherwise; neither is
      // wanted from a test.
      BROWSER: "none",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    // Its own process group, so `stop` can take down the whole tree. `next dev`
    // forks a render worker, and killing only the parent leaves that worker
    // holding the port.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  const collect = (chunk: Buffer) => {
    output += chunk.toString();
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);

  const origin = `http://localhost:${port}`;

  await waitFor(
    `${origin} to answer`,
    async () => {
      if (child.exitCode !== null) {
        throw new Error(`next dev exited with ${child.exitCode}. Output:\n${output.slice(-2000)}`);
      }
      // `/api/board` rather than `/`: it is the smallest route that proves the
      // server booted AND reached the database, which is the pair of things a
      // page load is about to depend on.
      const response = await fetch(`${origin}/api/board`, { cache: "no-store" });
      return response.ok;
    },
    // A cold `next dev` compiles the route on first request. Two minutes is
    // room for that on a laptop that is also running the rest of the suite.
    120_000,
  );

  return {
    origin,
    async stop() {
      if (child.pid === undefined || child.exitCode !== null) return;
      // BY PID, NEVER BY NAME (CLAUDE.md): `pkill -f next` on this machine
      // would take down whatever else a developer has open. The negative pid
      // is this child's own process group, which exists only because of
      // `detached: true` above.
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    },
  };
}
