// GitHub REST client for the Agent Console (doc 04 §4.4, §4.6; github-commits skill; D-003, D-005).
// The target repository comes only from GITHUB_REPO; GITHUB_API_URL overrides the base for mocks.
import path from "node:path";
import { isReadablePath } from "./allowlist.ts";

export const GITHUB_API_VERSION = "2026-03-10";
const READ_MAX_BYTES = 200 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const COMMIT_DEADLINE_MS = 45_000;

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

/** Thrown for a stale proposal (main moved and a touched file changed) → HTTP 409. */
export class StaleError extends Error {
  constructor() {
    super("The code changed since this proposal; ask the agent to refresh it.");
    this.name = "StaleError";
  }
}

export function githubConfig() {
  const repo = process.env.GITHUB_REPO ?? "";
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(repo)) throw new GitHubError("GITHUB_REPO not configured", 503);
  const api = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  return { api, repo, token: process.env.GITHUB_TOKEN || "" };
}

export const hasWriteToken = () => Boolean(process.env.GITHUB_TOKEN) && Boolean(process.env.GITHUB_REPO);

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

async function gh(method: string, apiPath: string, body?: unknown, signal?: AbortSignal): Promise<{ status: number; json: any }> {
  const { api, repo, token } = githubConfig();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "beach-day",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await fetch(`${api}/repos/${repo}${apiPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function ghOk(method: string, apiPath: string, body?: unknown, signal?: AbortSignal) {
  const r = await gh(method, apiPath, body, signal);
  if (r.status < 200 || r.status >= 300) throw new GitHubError(`GitHub ${method} ${apiPath.split("?")[0]} → ${r.status}`, r.status);
  return r.json;
}

// ---------------------------------------------------------------- reads

/** Read allow-list: normalized repo-relative text paths; never .env*, keys, or .git internals. */
export function assertReadablePath(p: unknown, { allowRoot = false } = {}): string {
  if (typeof p !== "string") throw new Error("path must be a string");
  let s = p.trim().replace(/\/+$/, "");
  if (allowRoot && (s === "" || s === ".")) return "";
  if (s.length === 0 || s.length > 200) throw new Error("bad path");
  if (s.includes("\\") || s.includes("\0") || s.startsWith("/") || /^[a-zA-Z]:/.test(s) || /[\u0000-\u001f]/.test(s)) throw new Error("bad path");
  if (path.posix.normalize(s) !== s || s.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) throw new Error("bad path");
  const segs = s.toLowerCase().split("/");
  if (segs.some((seg) => seg.startsWith(".env") || seg === ".git" || seg === "node_modules")) throw new Error("path not readable");
  if (/\.(pem|key|p12|pfx)$/i.test(s)) throw new Error("path not readable");
  return s;
}

const isHiddenSecret = (name: string) => name.toLowerCase().startsWith(".env") || /\.(pem|key|p12|pfx)$/i.test(name);

export async function getHeadSha(signal?: AbortSignal): Promise<string> {
  const j = await ghOk("GET", "/git/ref/heads/main", undefined, signal);
  const sha = j?.object?.sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{4,64}$/i.test(sha)) throw new GitHubError("bad ref response", 502);
  return sha;
}

export interface RepoFile { sha: string; size: number; text: string | null }

/**
 * GET contents/{path}?ref=… → { sha, size, text } (text null when binary or > 200 KB),
 * null when the file does not exist. Throws for directories.
 */
export async function getFile(p: string, ref: string, signal?: AbortSignal): Promise<RepoFile | null> {
  const r = await gh("GET", `/contents/${encodePath(p)}?ref=${encodeURIComponent(ref)}`, undefined, signal);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new GitHubError(`GitHub contents → ${r.status}`, r.status);
  const j = r.json;
  // Only a regular file at exactly this path: a symlink (type "symlink", or a "file" whose path differs
  // because GitHub followed the link) or a submodule is refused.
  if (Array.isArray(j) || j?.type !== "file" || j?.path !== p) throw new Error("not a file");
  const size = Number(j.size) || 0;
  let text: string | null = null;
  if (size <= READ_MAX_BYTES && j.encoding === "base64" && typeof j.content === "string") {
    const buf = Buffer.from(j.content, "base64");
    if (!buf.includes(0)) {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      } catch {
        text = null;
      }
    }
  }
  return { sha: String(j.sha), size, text };
}

/** read_file tool: returns text or throws a message safe to show the model. */
export async function readTextFile(p: string, signal?: AbortSignal): Promise<{ path: string; content: string; sha: string }> {
  const safe = assertReadablePath(p);
  const f = await getFile(safe, "main", signal);
  if (!f) throw new Error(`not found: ${safe}`);
  if (f.size > READ_MAX_BYTES) throw new Error("file is larger than 200 KB");
  if (f.text === null) throw new Error("not a UTF-8 text file");
  return { path: safe, content: f.text, sha: f.sha };
}

/** list_files tool: entries of a directory on main (secret-looking names hidden). */
export async function listDir(dir: string, signal?: AbortSignal): Promise<{ path: string; entries: { name: string; type: string; size?: number }[] }> {
  const safe = assertReadablePath(dir, { allowRoot: true });
  const r = await gh("GET", `/contents${safe ? "/" + encodePath(safe) : ""}?ref=main`, undefined, signal);
  if (r.status === 404) throw new Error(`not found: ${safe || "/"}`);
  if (r.status !== 200) throw new GitHubError(`GitHub contents → ${r.status}`, r.status);
  if (!Array.isArray(r.json)) throw new Error("not a directory");
  const entries = r.json
    .filter((e: any) => typeof e?.name === "string" && !isHiddenSecret(e.name) && isReadablePath(safe ? `${safe}/${e.name}` : e.name))
    .slice(0, 500)
    .map((e: any) => ({ name: e.name, type: e.type === "dir" ? "dir" : e.type === "file" ? "file" : String(e.type), ...(e.type === "file" ? { size: Number(e.size) || 0 } : {}) }));
  return { path: safe, entries };
}

// ---------------------------------------------------------------- atomic commit (Approve)

export interface CommitFile { path: string; action: "create" | "update" | "delete"; content: string }

/**
 * One atomic commit to main via the Git Data API (doc 04 §4.6), with the stale check:
 * if head ≠ baseSha, every touched file's current blob sha must equal fileShas[path] (null = absent),
 * otherwise StaleError. A failed fast-forward PATCH is retried once from the top.
 */
export async function commitToMain(opts: {
  files: CommitFile[];
  message: string;
  baseSha: string;
  fileShas: Record<string, string | null>;
}): Promise<{ sha: string; url: string }> {
  const { repo } = githubConfig();
  const signal = AbortSignal.timeout(COMMIT_DEADLINE_MS); // the whole commit, retries included
  for (let attempt = 0; attempt < 2; attempt++) {
    const head = await getHeadSha(signal);
    if (head !== opts.baseSha) {
      const current = await Promise.all(
        opts.files.map((f) =>
          getFile(f.path, head, signal).then(
            (cur) => (cur ? cur.sha : null),
            (e) => {
              if (e instanceof GitHubError || (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") throw e;
              return "__not_a_file__"; // became a directory or symlink → stale
            },
          ),
        ),
      );
      opts.files.forEach((f, i) => {
        const expected = Object.prototype.hasOwnProperty.call(opts.fileShas, f.path) ? opts.fileShas[f.path] : undefined;
        if (expected === undefined || current[i] !== expected) throw new StaleError();
      });
    }
    const baseTree = (await ghOk("GET", `/git/commits/${head}`, undefined, signal))?.tree?.sha;
    if (typeof baseTree !== "string") throw new GitHubError("bad commit response", 502);
    const tree = await ghOk("POST", "/git/trees", {
      base_tree: baseTree,
      tree: opts.files.map((f) =>
        f.action === "delete"
          ? { path: f.path, mode: "100644", type: "blob", sha: null }
          : { path: f.path, mode: "100644", type: "blob", content: f.content },
      ),
    }, signal);
    const commit = await ghOk("POST", "/git/commits", { message: opts.message, tree: tree?.sha, parents: [head] }, signal);
    if (typeof commit?.sha !== "string") throw new GitHubError("bad commit response", 502);
    const upd = await gh("PATCH", "/git/refs/heads/main", { sha: commit.sha, force: false }, signal);
    if (upd.status >= 200 && upd.status < 300) {
      return { sha: commit.sha, url: `https://github.com/${repo}/commit/${commit.sha}` };
    }
    if (upd.status !== 422 && upd.status !== 409) throw new GitHubError(`GitHub PATCH ref → ${upd.status}`, upd.status);
    // main moved between our read and the update: retry once (re-runs the stale check)
  }
  throw new StaleError();
}
