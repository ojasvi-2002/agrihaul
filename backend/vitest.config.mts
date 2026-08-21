import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Isolation tests hit the real local Postgres sequentially by design —
    // they create/delete whole organizations, so parallel runs would race.
    fileParallelism: false,
  },
});
