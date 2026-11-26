// Example 1 — check a manifest against the Chromium install criteria (web.dev). Run: node check-manifest.mjs [file]
import { readFileSync } from "node:fs";
export function checkManifest(m) {
  const errs = [];
  if (!m.name && !m.short_name) errs.push("name or short_name required");
  const sizes = (m.icons || []).flatMap((i) => String(i.sizes || "").split(/\s+/));
  for (const s of ["192x192", "512x512"]) if (!sizes.includes(s)) errs.push(`icon ${s} required`);
  if (!m.start_url) errs.push("start_url required");
  if (!["fullscreen", "standalone", "minimal-ui", "window-controls-overlay"].includes(m.display)) errs.push("display must be standalone/fullscreen/minimal-ui/window-controls-overlay");
  if (m.prefer_related_applications === true) errs.push("prefer_related_applications must be absent or false");
  if (m.start_url && m.scope && !new URL(m.start_url, "https://x/").pathname.startsWith(m.scope)) errs.push("start_url outside scope");
  if (!m.id) errs.push("warning: set a stable id (iOS uses it to identify the app)");
  return errs;
}
const file = process.argv[2] || new URL("./manifest.webmanifest", import.meta.url);
const errs = checkManifest(JSON.parse(readFileSync(file)));
console.log(errs.length ? errs.join("\n") : "manifest OK: installable on Chromium (plus apple-touch-icon for iOS)");
const broken = checkManifest({ name: "x", icons: [{ src: "/i.png", sizes: "192x192" }], display: "browser" });
console.log("broken example →", broken);
process.exit(errs.length || broken.filter((e) => !e.startsWith("warning")).length !== 3 ? 1 : 0);
