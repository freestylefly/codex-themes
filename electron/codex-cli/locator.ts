/**
 * [INPUT]: 依赖文件系统、PATH/PATHEXT、macOS bundle 发现与统一 CLI runner
 * [OUTPUT]: 对外提供独立 Codex CLI 定位、版本读取与最低版本比较
 * [POS]: electron/codex-cli 的发现模块，Windows 只接受可执行 exe 与 npm cmd shim
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import fs from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { discoverCodexApp } from "../platform/codex-macos";
import { execCodexCli } from "./runner";

function commonCliPaths(platform: NodeJS.Platform, home: string): string[] {
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    return [
      path.join(home, ".bun", "bin", "codex.exe"),
      path.join(home, ".bun", "bin", "codex.cmd"),
      path.join(home, ".local", "bin", "codex.exe"),
      path.join(localAppData, "Programs", "codex", "codex.exe"),
      path.join(localAppData, "Microsoft", "WinGet", "Links", "codex.exe"),
      path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "npm", "codex.cmd"),
    ];
  }
  return [
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    path.join(home, ".local", "bin", "codex"),
  ];
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return false;
    await fs.access(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findInPath(
  platform: NodeJS.Platform,
  envPath = process.env.PATH ?? "",
  pathExt = process.env.PATHEXT ?? ".EXE;.CMD",
): Promise<string | null> {
  const platformPath = platform === "win32" ? path.win32 : path;
  const delimiter = platform === "win32" ? ";" : path.delimiter;
  const executableNames = platform === "win32"
    ? [...new Set(pathExt.split(";")
        .map((extension) => extension.toLowerCase())
        .filter((extension) => extension === ".exe" || extension === ".cmd")
        .map((extension) => `codex${extension}`))]
    : ["codex"];
  for (const dir of envPath.split(delimiter).filter(Boolean)) {
    for (const executableName of executableNames) {
      const candidate = platformPath.join(dir, executableName);
      if (await isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

export interface LocatedCli {
  executablePath: string;
  version: string | null;
}

export interface LocateCodexCliOptions {
  /**
   * Override desktop discovery in tests. `undefined` discovers the verified
   * official bundle; `null` explicitly skips the bundled CLI candidate.
   */
  desktopBundlePath?: string | null;
  commonPaths?: string[];
  envPath?: string;
  platform?: NodeJS.Platform;
  home?: string;
  pathExt?: string;
  readVersion?: (executablePath: string) => Promise<string | null>;
}

export function bundledCodexCliPath(bundlePath: string): string {
  return path.join(bundlePath, "Contents", "Resources", "codex");
}

export function codexCliPathSupported(file: string, platform: NodeJS.Platform): boolean {
  if (platform !== "win32") return true;
  const extension = path.win32.extname(file).toLowerCase();
  return extension === ".exe" || extension === ".cmd";
}

export async function locateCodexCli(
  preferredPath?: string | null,
  options: LocateCodexCliOptions = {},
): Promise<LocatedCli | null> {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const platformPath = platform === "win32" ? path.win32 : path;
  let executable: string | null = null;

  if (
    preferredPath
    && platformPath.isAbsolute(preferredPath)
    && codexCliPathSupported(preferredPath, platform)
    && (await isExecutable(preferredPath))
  ) {
    executable = preferredPath;
  }

  if (!executable && platform === "darwin") {
    const desktopBundlePath = options.desktopBundlePath === undefined
      ? (await discoverCodexApp())?.bundle ?? null
      : options.desktopBundlePath;
    if (desktopBundlePath) {
      const bundled = bundledCodexCliPath(desktopBundlePath);
      if (await isExecutable(bundled)) executable = bundled;
    }
  }

  if (!executable) {
    for (const candidate of options.commonPaths ?? commonCliPaths(platform, home)) {
      if (codexCliPathSupported(candidate, platform) && await isExecutable(candidate)) {
        executable = candidate;
        break;
      }
    }
  }

  if (!executable) {
    executable = await findInPath(platform, options.envPath, options.pathExt);
  }
  if (!executable) return null;

  const version = await (options.readVersion ?? readCodexCliVersion)(executable);

  return { executablePath: executable, version };
}

export async function readCodexCliVersion(executablePath: string): Promise<string | null> {
  try {
    const { stdout } = await execCodexCli(executablePath, ["--version"], { timeout: 10_000 });
    const match = stdout.trim().match(/(\d+\.\d+(?:\.\d+)?)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Loose semver comparison: true when `actual` >= `minimum`. */
export function cliVersionSupported(actual: string, minimum: string): boolean {
  const parse = (v: string) => v.split(".").map((n) => parseInt(n, 10));
  const a = parse(actual);
  const b = parse(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}
