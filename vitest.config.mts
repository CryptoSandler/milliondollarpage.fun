import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Holds a run-scoped Postgres advisory lock for as long as the run lasts,
    // so a second `npm test` queues behind this one instead of truncating its
    // fixtures mid-assertion. `fileParallelism` below only orders the files
    // within one run; this orders the runs. See the file itself for why it
    // blocks rather than skipping, and why it takes the lock on the direct
    // endpoint rather than through the pooler.
    globalSetup: ["./vitest.globalSetup.ts"],
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
  },
});
