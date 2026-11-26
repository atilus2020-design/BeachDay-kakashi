import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { startMocks } from "./upstreams.mjs";
import { testEnvForPort } from "./load-env.mjs";

let mocks: Awaited<ReturnType<typeof startMocks>> | undefined;

export async function setup() {
  if (existsSync("scripts/build-agents.mjs")) {
    execFileSync(process.execPath, ["scripts/build-agents.mjs"], { stdio: "inherit" });
  }
  mocks = await startMocks(0);
  Object.assign(process.env, testEnvForPort(mocks.port), { NODE_ENV: "test", MOCK_BASE: mocks.url });
}

export async function teardown() {
  await mocks?.close();
}
