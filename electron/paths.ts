/**
 * Centralized filesystem locations. Assets live next to the repo in dev and
 * inside the packaged resources directory in production (extraResources).
 */

import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AppPaths {
  /** assets/ root (inject/, presets/, tray/). */
  assetsRoot: string;
  injectDir: string;
  presetsRoot: string;
  trayIconPath: string;
  skillsRoot: string;
  /** userData-derived locations. */
  userDataRoot: string;
  userThemesRoot: string;
  aiJobsRoot: string;
  downloadsDir: string;
  settingsFile: string;
  stateFile: string;
  configBackupFile: string;
  codexConfigPath: string;
}

async function hasAssetsTree(dir: string): Promise<boolean> {
  try {
    const injectDir = path.join(dir, "assets", "inject");
    const stat = await fs.stat(injectDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function resolveAssetsRoot(): Promise<string> {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets");
  }

  // Dev / direct dist launch: electron-vite builds main to dist/main/index.js,
  // and WeSight may launch the binary with an app path or cwd that does not
  // point at the repo root. Collect every plausible location and pick the
  // first one that actually contains assets/inject.
  const thisFile = fileURLToPath(import.meta.url);
  const argvEntry = process.argv[1];
  const candidates: string[] = [];

  const add = (dir: string) => {
    const normalized = path.resolve(dir);
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  // 1. cwd (repo root for `npm run dev` / `electron .`)
  add(process.cwd());

  // 2. This module's source tree (works in dev and direct dist launch)
  for (let up = 2; up <= 4; up++) {
    add(path.join(thisFile, ...Array(up).fill("..")));
  }

  // 3. Entry script location (e.g. dist/main/index.js) and its parent trees
  if (argvEntry) {
    add(path.dirname(argvEntry));
    for (let up = 1; up <= 3; up++) {
      add(path.join(argvEntry, ...Array(up + 1).fill("..")));
    }
  }

  // 4. Electron's own app path as a last resort
  try {
    add(app.getAppPath());
  } catch {
    // app.getAppPath() may throw before the app is ready in some launch modes.
  }

  // eslint-disable-next-line no-console
  console.log("[paths] resolving assets root, candidates:", candidates);
  for (const candidate of candidates) {
    if (await hasAssetsTree(candidate)) {
      // eslint-disable-next-line no-console
      console.log("[paths] using assets root:", candidate);
      return path.join(candidate, "assets");
    }
  }

  // 5. Final fallback: walk up from this module until we find assets/inject.
  let walkDir = path.dirname(thisFile);
  for (let i = 0; i < 6; i++) {
    const next = path.dirname(walkDir);
    if (next === walkDir) break;
    walkDir = next;
    if (await hasAssetsTree(walkDir)) {
      // eslint-disable-next-line no-console
      console.log("[paths] found assets root by walking up:", walkDir);
      return path.join(walkDir, "assets");
    }
  }

  throw new Error(
    `无法找到 assets/inject 目录。已尝试: ${candidates.join(", ")}`
  );
}

export async function resolveAppPaths(): Promise<AppPaths> {
  const assetsRoot = await resolveAssetsRoot();
  const userDataRoot = app.getPath("userData");
  const home = app.getPath("home");
  return {
    assetsRoot,
    injectDir: path.join(assetsRoot, "inject"),
    presetsRoot: path.join(assetsRoot, "presets"),
    trayIconPath: path.join(assetsRoot, "tray", "iconTemplate.png"),
    skillsRoot: path.join(assetsRoot, "skills", "generate-codex-theme"),
    userDataRoot,
    userThemesRoot: path.join(userDataRoot, "themes"),
    aiJobsRoot: path.join(userDataRoot, "ai-jobs"),
    downloadsDir: path.join(userDataRoot, "downloads"),
    settingsFile: path.join(userDataRoot, "settings.json"),
    stateFile: path.join(userDataRoot, "state.json"),
    configBackupFile: path.join(userDataRoot, "config-backup.json"),
    codexConfigPath: path.join(home, ".codex", "config.toml"),
  };
}
