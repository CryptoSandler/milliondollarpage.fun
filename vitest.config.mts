import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // One fork. Later tasks add tests that truncate shared tables, and running
    // files in parallel would have them delete each other's fixtures
    // mid-assertion.
    //
    // Vitest 4 removed the nested `poolOptions.forks.singleFork` toggle the
    // plan specified (poolOptions was removed entirely); `fileParallelism:
    // false` is the current top-level replacement and has the same effect —
    // it forces a single worker instead of running files in parallel.
    pool: "forks",
    fileParallelism: false,
    // The HTTP route tests each drive several sequential POSTs, and every
    // one opens its own round trip (or several) to the remote Neon test
    // branch. The 5s default is tuned for a single query, not a loop of
    // reservation calls over real network latency, so it clips otherwise
    // passing tests. 20s is generous headroom, not a correctness change.
    testTimeout: 20_000,
  },
});
