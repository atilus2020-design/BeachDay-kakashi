// After `vite build`: rewrite dist/sw.js placeholders with a content hash and the public shell asset list.
// Usage: node scripts/inject-sw.mjs [distDir]   (default ./dist). Never fails the build for missing pages.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

const dist = resolve(process.argv[2] || "dist");
const swPath = join(dist, "sw.js");
if (!existsSync(swPath)) {
  console.warn(`inject-sw: ${swPath} not found; skipping.`);
  process.exit(0);
}
const PAGES = ["index.html", "how-it-works/index.html", "resources/index.html", "guide/index.html", "offline.html"];
const EXCLUDE = /(^|\/)(agents|login)(\/|[-.])/i;
const urls = new Set(["/offline.html", "/offline.css", "/manifest.webmanifest"]);
const hash = createHash("sha256");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const toUrl = (rel) => "/" + rel.replace(/index\.html$/, "");
const refs = (html) => [...html.matchAll(/(?:src|href)="(\/[^"#?]+\.(?:js|css|webmanifest|png|svg))"/g)].map((m) => m[1]);

for (const page of PAGES) {
  const file = join(dist, page);
  if (!existsSync(file)) { console.warn(`inject-sw: warning: ${page} not built yet, not precached.`); continue; }
  const html = readFileSync(file, "utf8");
  hash.update(html);
  urls.add(toUrl(page));
  for (const r of refs(html)) if (!EXCLUDE.test(r.slice(1)) && existsSync(join(dist, r))) urls.add(r);
}
// Icons (small set only)
if (existsSync(join(dist, "icons"))) {
  for (const f of walk(join(dist, "icons"))) {
    const rel = f.slice(dist.length).replace(/\\/g, "/");
    if (/icon-(192|512|maskable-512)\.png$|apple-touch-icon-180\.png$|favicon\.svg$/.test(rel)) urls.add(rel);
  }
}
for (const u of urls) {
  const f = join(dist, u.endsWith("/") ? u + "index.html" : u);
  if (existsSync(f)) hash.update(readFileSync(f));
}
const list = [...urls].sort();
const version = hash.digest("hex").slice(0, 12);
let sw = readFileSync(swPath, "utf8");
if (!sw.includes("__VERSION__") || !sw.includes('"__PRECACHE__"')) console.warn("inject-sw: warning: placeholders missing in sw.js");
sw = sw.replace("__VERSION__", version).replace('"__PRECACHE__"', JSON.stringify(list));
writeFileSync(swPath, sw);
console.log(`inject-sw: version ${version}, ${list.length} precache URLs`);
