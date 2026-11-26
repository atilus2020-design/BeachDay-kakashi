// Path allow-list for agent proposals (owner: security-engineer / Rook).
// Policy: docs/security.md R9 and the path-allowlist skill. Deny wins, default deny.
// Called by the propose_change tool handler AND again by the approve Function
// (complete mediation: a stored proposal is re-validated from scratch before commit).
// Error messages are short, fixed strings: they never echo the path or content.

export type ProposalAction = "create" | "update" | "delete";
export interface ProposalFile { path: string; action: ProposalAction; content: string }

export class AllowlistError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AllowlistError";
    this.code = code;
  }
}

export const LIMITS = Object.freeze({
  maxPathLength: 200,
  maxFiles: 20,
  maxFileBytes: 200 * 1024,
  maxTotalBytes: 1024 * 1024,
});

// Writable trees (case-sensitive match on the exact spelling).
const WRITE_ALLOW_PREFIX = [
  "src/app/", "src/pages/", "src/lib/", "src/styles/", "src/scoring/", "src/data/",
  "public/", "tests/", "docs/", "knowledge/",
] as const;
// Root-level HTML the agents may edit: the home page and the content pages.
// New root pages are not allowed (vite.config.* would not build them anyway).
const WRITE_ALLOW_EXACT = [
  "index.html", "how-it-works/index.html", "resources/index.html", "guide/index.html",
] as const;

// Deny rules are matched against the LOWER-CASED path, so case tricks cannot dodge them.
const WRITE_DENY_PREFIX = [
  ".github/", ".claude/", "netlify/", "scripts/", "supabase/", "login/", "agents/",
  "node_modules/", "dist/", ".netlify/",
  "src/pages/agents.", "src/pages/login", // console + auth page code (token, Approve)
] as const;
const WRITE_DENY_EXACT = [
  "netlify.toml", "public/sw.js", "public/_headers", "public/_redirects",
] as const;
const WRITE_DENY_RE: readonly RegExp[] = [
  /^package[^/]*\.json$/,      // package.json, package-lock.json
  /^vite\.config\./,
  /^src\/lib\/auth\./,         // supabase-js client + token helpers
  /^src\/lib\/api\./,          // attaches the bearer token to /api calls
];

// Secrets and VCS internals: denied for both reading and writing, at any depth.
const SECRET_RE: readonly RegExp[] = [
  /(^|\/)\.env/,               // .env, .env.local, .env.example ...
  /\.env$/,                    // test.env, prod.env
  /\.(pem|key|p12|pfx|jks|keystore)$/,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.git(\/|$|attributes$|ignore$|modules$)/,
];
const READ_DENY_PREFIX = ["node_modules/", "dist/", ".netlify/"] as const;
const READ_DENY_SEGMENT = new Set(["node_modules", ".git", ".netlify"]);

const SAFE_CHARS = /^[A-Za-z0-9._\/-]+$/; // ASCII only: blocks look-alikes, spaces, controls, `\`, `:`

/** Structural checks shared by read and write. Returns a reason code, or null when the path is well formed. */
function shapeProblem(p: unknown): string | null {
  if (typeof p !== "string" || p.length === 0 || p.length > LIMITS.maxPathLength) return "length";
  if (!SAFE_CHARS.test(p)) return "chars";        // also rejects NUL, backslash, drive letters, non-ASCII
  if (p.startsWith("/")) return "absolute";
  const segs = p.split("/");
  if (segs.some((s) => s === "" || s === "." || s === "..")) return "not-normalized";
  return null;
}

function fail(code: string, message: string): never {
  throw new AllowlistError(code, message);
}

/** Returns `p` unchanged if agents may create/update/delete it; otherwise throws AllowlistError. */
export function assertWritablePath(p: string): string {
  const problem = shapeProblem(p);
  if (problem) fail(problem, `Path rejected (${problem})`);
  const lower = p.toLowerCase();
  if (SECRET_RE.some((r) => r.test(lower))) fail("denied", "Path rejected (denied)");
  if ((WRITE_DENY_EXACT as readonly string[]).includes(lower)) fail("denied", "Path rejected (denied)");
  if (WRITE_DENY_PREFIX.some((d) => lower.startsWith(d))) fail("denied", "Path rejected (denied)");
  if (WRITE_DENY_RE.some((r) => r.test(lower))) fail("denied", "Path rejected (denied)");
  const allowed =
    (WRITE_ALLOW_EXACT as readonly string[]).includes(p) ||
    WRITE_ALLOW_PREFIX.some((a) => p.startsWith(a) && p.length > a.length);
  if (!allowed) fail("not-allowed", "Path rejected (not in allow-list)");
  return p;
}

/** True if the agents' read_file / list_files tools may read `p`. "" means the repo root (list_files). Never throws. */
export function isReadablePath(p: string): boolean {
  if (p === "") return true;
  if (shapeProblem(p)) return false;
  const lower = p.toLowerCase();
  if (SECRET_RE.some((r) => r.test(lower))) return false;
  if (READ_DENY_PREFIX.some((d) => lower.startsWith(d) || lower === d.slice(0, -1))) return false;
  if (lower.split("/").some((s) => READ_DENY_SEGMENT.has(s))) return false;
  return true;
}

const ACTIONS = new Set<string>(["create", "update", "delete"]);
// C0 controls other than TAB, LF, FF, CR (NUL included) and DEL: not text.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000E-\u001F\u007F]/;
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const encoder = new TextEncoder();

/** Validates a whole proposal: shape, every path, counts, sizes and encoding. Throws AllowlistError on the first problem. */
export function assertProposalLimits(files: ProposalFile[]): void {
  if (!Array.isArray(files) || files.length === 0) fail("empty", "Proposal has no files");
  if (files.length > LIMITS.maxFiles) fail("too-many-files", `Proposal has more than ${LIMITS.maxFiles} files`);
  const seen = new Set<string>();
  let total = 0;
  files.forEach((f, i) => {
    const at = `file ${i + 1}`;
    if (!f || typeof f !== "object") fail("shape", `Invalid ${at}`);
    const { path, action, content } = f as Partial<ProposalFile>;
    if (typeof action !== "string" || !ACTIONS.has(action)) fail("action", `Invalid action in ${at}`);
    if (typeof content !== "string") fail("content", `Invalid content in ${at}`);
    assertWritablePath(path as string);
    const key = (path as string).toLowerCase(); // case-colliding paths count as duplicates
    if (seen.has(key)) fail("duplicate", `Duplicate path in ${at}`);
    seen.add(key);
    if (action === "delete") {
      if (content !== "") fail("delete-content", `Delete must have empty content in ${at}`);
      return;
    }
    if (CONTROL_RE.test(content)) fail("binary", `Content is not text in ${at}`);
    if (LONE_SURROGATE_RE.test(content)) fail("encoding", `Content is not valid UTF-8 in ${at}`);
    const bytes = encoder.encode(content).length;
    if (bytes > LIMITS.maxFileBytes) fail("file-too-large", `File larger than 200 KB in ${at}`);
    total += bytes;
    if (total > LIMITS.maxTotalBytes) fail("total-too-large", "Proposal larger than 1 MB");
  });
}
