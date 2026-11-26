import { defineConfig } from "vitest/config";
import { loadTestEnv } from "./tests/mocks/load-env.mjs";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/function/**/*.test.ts"],
    globalSetup: ["./tests/mocks/global-setup.ts"],
    // Base URLs are set by globalSetup (free mock port); only the non-URL values are fixed here.
    env: { ...Object.fromEntries(Object.entries(loadTestEnv()).filter(([, v]) => !v.includes("127.0.0.1"))), NODE_ENV: "test" },
    testTimeout: 20_000,
    fileParallelism: false, // the mock server holds shared state (head sha, call log)
  },
});
