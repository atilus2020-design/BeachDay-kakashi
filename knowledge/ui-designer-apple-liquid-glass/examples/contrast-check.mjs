// Example 2 — WCAG contrast check of every text/background token pair in tokens.css (light and dark).
// Score colours are used as TEXT on --surface, so they must reach 4.5:1. Run: node contrast-check.mjs
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const block = (s) => Object.fromEntries([...s.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const [lightSrc, darkSrc] = css.split("@media (prefers-color-scheme: dark)");
const themes = { light: block(lightSrc), dark: { ...block(lightSrc), ...block(darkSrc) } };
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [["text","bg"],["text","surface"],["text-2","surface"],["on-accent","accent"],
  ["score-great","surface"],["score-good","surface"],["score-fair","surface"],["score-poor","surface"]];
let fail = 0;
for (const [name, t] of Object.entries(themes)) for (const [fg, bg] of pairs) {
  const r = ratio(t[fg], t[bg]); const ok = r >= 4.5; if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(5)} ${fg} on ${bg}: ${r.toFixed(2)}:1`);
}
process.exit(fail ? 1 : 0);
