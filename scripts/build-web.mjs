import { build } from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  out = path.join(root, "web-dist");
if (process.env.VERCEL) {
  const value = process.env.PERPL_BACKEND_URL;
  if (
    !process.env.DATABASE_URL &&
    (!value || new URL(value).protocol !== "https:")
  )
    throw Error(
      "Set DATABASE_URL for the Vercel backend, or PERPL_BACKEND_URL for an external backend.",
    );
  if (!process.env.PERPL_BACKEND_TOKEN)
    throw Error("Set the server-only PERPL_BACKEND_TOKEN in Vercel.");
  if (process.env.DATABASE_URL && !process.env.PERPL_JOB_TOKEN)
    throw Error("Set the server-only PERPL_JOB_TOKEN in Vercel.");
}
await mkdir(out, { recursive: true });
await build({
  stdin: {
    contents:
      "import React from 'react';import {createRoot} from 'react-dom/client';import Dashboard from './components/dashboard';import './app/globals.css';createRoot(document.getElementById('root')).render(<Dashboard/>);",
    resolveDir: root,
    sourcefile: "web-entry.tsx",
    loader: "tsx",
  },
  bundle: true,
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  outdir: out,
  entryNames: "dashboard",
  assetNames: "[name]-[hash]",
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  tsconfig: path.join(root, "tsconfig.json"),
  logLevel: "warning",
});
for (const file of [
  "favicon.svg",
  "perpl-logo.svg",
  "monad-logo.svg",
  "envio-logo.png",
  "og.svg",
  "og.png",
  "apple-touch-icon.png",
])
  await copyFile(path.join(root, "public", file), path.join(out, file));
await writeFile(
  path.join(out, "index.html"),
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0d0c12"><title>Perpl Analytics</title><meta name="description" content="Perpl protocol, risk and wallet intelligence. Public data, clear coverage, live market prices."><meta property="og:title" content="Perpl Analytics"><meta property="og:description" content="Protocol intelligence with transparent data coverage."><meta property="og:image" content="https://perpl-analytics.vercel.app/og.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/dashboard.css"></head><body><div id="root"></div><script type="module" src="/dashboard.js"></script></body></html>',
);
console.log(
  "Built Vercel frontend. Live operation requires the cloud backend and durable storage.",
);

