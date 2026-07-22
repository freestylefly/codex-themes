import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path, { resolve } from "node:path";
import fs from "node:fs";
import type { Plugin } from "vite";

/**
 * Expose a curated set of environment variables to the main process. Secrets
 * (service role, Alipay private key) are intentionally absent; only the public
 * Supabase URL + anon key and the commerce API base URL are available.
 */
function mainEnvPlugin(): Plugin {
  const vars: Record<string, string> = {};
  for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_COMMERCE_API_URL"]) {
    const value = process.env[key];
    if (value) vars[`process.env.${key}`] = JSON.stringify(value);
  }
  return {
    name: "main-env",
    config() {
      return { define: vars };
    },
  };
}

/**
 * Copy inject assets into the main build output so that direct dist launches
 * (e.g. WeSight running dist/main/index.js) can resolve dream-skin.css and
 * renderer-inject.js even when the app path points inside dist/main.
 */
function copyInjectAssets(): Plugin {
  function doCopy() {
    const src = resolve(__dirname, "assets", "inject");
    const dest = resolve(__dirname, "dist", "main", "assets", "inject");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true, force: true });
  }
  return {
    name: "copy-inject-assets",
    buildStart() {
      // Copy in dev mode too, so direct dist launches and WeSight restarts
      // always find the inject assets next to the main build output.
      doCopy();
    },
    closeBundle() {
      doCopy();
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyInjectAssets(), mainEnvPlugin()],
    build: {
      outDir: "dist/main",
      rollupOptions: {
        input: { index: resolve(__dirname, "electron/main.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        input: { index: resolve(__dirname, "electron/preload.ts") },
      },
    },
  },
  renderer: {
    root: "src",
    build: {
      outDir: "dist/renderer",
      rollupOptions: {
        input: { index: resolve(__dirname, "src/index.html") },
      },
    },
    plugins: [react()],
  },
});
