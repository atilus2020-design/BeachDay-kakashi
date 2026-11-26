import { defineConfig } from "vitest/config";
import { loadTestEnv } from "./tests/mocks/load-env.mjs";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/function/**/*.test.ts"],
    globalSetup: ["./tests/mocks/global-setup.ts"],
    env: { ...loadTestEnv(), NODE_ENV: "test" },
    testTimeout: 20_000,
    fileParallelism: false, // the mock server holds shared state (head sha, call log)
  },
});
