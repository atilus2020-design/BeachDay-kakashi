import { describe, it, expect } from "vitest";
import { assertWritablePath, assertProposalLimits } from "../../netlify/functions/_lib/allowlist.ts";

const REJECT: [string, string][] = [
  ["parent traversal", "../netlify.toml"],
  ["embedded traversal", "src/../netlify.toml"],
  ["traversal inside docs", "docs/../package.json"],
  ["absolute path", "/etc/passwd"],
  ["backslash", "src\\app.ts"],
  ["dot segment", "src/app/./x.ts"],
  ["empty segment", "src//x.ts"],
  ["trailing slash", "src/app/"],
  ["upper-case root", "SRC/app.ts"],
  ["mixed-case root", "Src/app/x.ts"],
  ["cyrillic look-alike", "sr\u0441/app/x.ts"],
  ["fullwidth look-alike", "\uFF53rc/app/x.ts"],
  ["workflow", ".github/workflows/x.yml"],
  ["function code", "netlify/functions/approve.mts"],
  ["agent definition", ".claude/agents/x.md"],
  ["package.json", "package.json"],
  ["lockfile", "package-lock.json"],
  ["netlify.toml", "netlify.toml"],
  ["vite config", "vite.config.ts"],
  ["scripts", "scripts/build-agents.mjs"],
  ["300 chars", "src/app/" + "a".repeat(292)],
  ["empty", ""],
  ["NUL byte", "src/app/x\u0000.ts"],
  ["drive letter", "C:/src/app/x.ts"],
  ["env file", "src/app/.env.local"],
  ["pem", "public/cert.pem"],
  ["key", "public/server.key"],
  // new deny entries (D-007)
  ["supabase migrations", "supabase/migrations/20261126000000_profiles.sql"],
  ["login page", "login/index.html"],
  ["login reset page", "login/reset/index.html"],
  ["auth module", "src/lib/auth.ts"],
  ["auth module variant", "src/lib/auth.test.ts"],
  ["case trick on auth module", "src/lib/AUTH.ts"],
  ["case trick on supabase", "SUPABASE/x.sql"],
  ["api client (attaches bearer token)", "src/lib/api.ts"],
  ["agents page code", "src/pages/agents.ts"],
  ["login page code", "src/pages/login.ts"],
  ["knowledge (compiled into prompts)", "knowledge/qa-engineer/docs/x.md"],
  ["service worker", "public/sw.js"],
];

const ACCEPT = ["src/app/today.ts", "src/pages/home.ts", "src/scoring/score.ts", "src/styles/x.css", "public/icons/x.svg", "docs/notes.md", "tests/unit/x.test.ts"];

describe("assertWritablePath", () => {
  it.each(REJECT)("rejects %s (%j)", (_n, p) => {
    expect(() => assertWritablePath(p)).toThrow();
  });
  it.each(ACCEPT)("accepts %s", (p) => {
    expect(assertWritablePath(p)).toBe(p);
  });
  it("rejects non-string input", () => {
    expect(() => assertWritablePath(undefined as any)).toThrow();
    expect(() => assertWritablePath(42 as any)).toThrow();
  });
});

const f = (path: string, content = "x") => ({ path, action: "update", content });

describe("assertProposalLimits", () => {
  it("accepts a small proposal", () => {
    expect(() => assertProposalLimits([f("docs/a.md"), f("docs/b.md")] as any)).not.toThrow();
  });
  it("rejects more than 20 files", () => {
    const files = Array.from({ length: 21 }, (_, i) => f(`docs/f${i}.md`));
    expect(() => assertProposalLimits(files as any)).toThrow();
  });
  it("accepts exactly 20 files", () => {
    const files = Array.from({ length: 20 }, (_, i) => f(`docs/f${i}.md`));
    expect(() => assertProposalLimits(files as any)).not.toThrow();
  });
  it("rejects a file over 200 KB", () => {
    expect(() => assertProposalLimits([f("docs/big.md", "a".repeat(200 * 1024 + 1))] as any)).toThrow();
  });
  it("rejects more than 1 MB in total", () => {
    const files = Array.from({ length: 7 }, (_, i) => f(`docs/f${i}.md`, "a".repeat(180 * 1024)));
    expect(() => assertProposalLimits(files as any)).toThrow();
  });
  it("rejects an empty proposal", () => {
    expect(() => assertProposalLimits([] as any)).toThrow();
  });
});
