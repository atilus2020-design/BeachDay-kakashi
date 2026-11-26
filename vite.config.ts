import { defineConfig } from "vite";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// Multi-page app. Pages are written by different experts, so only inputs that exist are built.
const pages = [
  "index.html",
  "agents/index.html",
  "login/index.html",
  "login/reset/index.html",
  "how-it-works/index.html",
  "resources/index.html",
  "guide/index.html",
];

const input = Object.fromEntries(
  pages
    .filter((p) => existsSync(resolve(root, p)))
    .map((p) => [p === "index.html" ? "main" : p.replace(/\/index\.html$/, "").replace(/\//g, "-"), resolve(root, p)]),
);

export default defineConfig({
  publicDir: "public",
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input },
  },
});
