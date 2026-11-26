import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./tests/mocks/load-env.mjs";

// WebKit is not installed here: every project runs on the pre-installed Chromium,
// emulating the phone viewport, user agent and touch (real iOS checks are manual).
const chromiumOnly = (name: keyof typeof devices) => {
  const { defaultBrowserType: _ignored, ...rest } = devices[name];
  return rest;
};

const testEnv = loadTestEnv();
const mockPort = process.env.MOCK_PORT || "9100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1, // shared mock state
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:8888",
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "iPhone 13", use: { ...chromiumOnly("iPhone 13") } },
    { name: "Pixel 7", use: { ...chromiumOnly("Pixel 7") } },
    { name: "Desktop Chrome", use: { ...chromiumOnly("Desktop Chrome") } },
  ],
  webServer: [
    {
      command: "node tests/mocks/upstreams.mjs",
      url: `http://127.0.0.1:${mockPort}/__calls`,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      env: { MOCK_PORT: mockPort },
    },
    {
      command: "npx netlify dev --port 8888 --offline",
      url: "http://localhost:8888",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...(process.env as Record<string, string>),
        ...testEnv,
        VITE_SUPABASE_URL: "https://beachday-test.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
    },
  ],
});
