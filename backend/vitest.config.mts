import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Isolation tests hit the real local Postgres sequentially by design —
    // they create/delete whole organizations, so parallel runs would race.
    fileParallelism: false,
    // Pinned explicitly, not just relying on the default: authRateLimit.test.ts
    // depends on each test *file* getting a fresh in-memory rate-limiter
    // store (app.ts's limiter middleware is module-level state). Turning
    // this off — e.g. singleFork for speed — would let that file's
    // exhausted limiters bleed into whichever other file's auth calls
    // run in the same process next, failing them with unrelated 429s.
    isolate: true,
  },
});
