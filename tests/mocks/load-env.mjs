import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Parse tests/mocks/test.env into a plain object. */
export function loadTestEnv() {
  const text = readFileSync(fileURLToPath(new URL("./test.env", import.meta.url)), "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Same values with the mock port swapped in. */
export function testEnvForPort(port) {
  const env = loadTestEnv();
  for (const k of Object.keys(env)) env[k] = env[k].replace("127.0.0.1:9100", `127.0.0.1:${port}`);
  return env;
}
