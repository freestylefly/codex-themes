/**
 * Discover the local Codex CLI executable and read its version.
 *
 * Resolution order:
 *   1. User-selected absolute path from settings.
 *   2. Codex CLI bundled with the verified official ChatGPT / Codex app.
 *   3. Common installation paths (/opt/homebrew/bin/codex, /usr/local/bin/codex,
 *      ~/.local/bin/codex).
 *   4. Directories in the launch environment PATH.
 *
 * No shell string interpolation is used; all paths are checked with fs.access.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { createCodexDesktopAdapter } from "../platform";

const execFileAsync = promisify(execFile);

function commonPaths(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local");
    return [
      path.join(appData, "npm", "codex.cmd"),
      path.join(appData, "npm", "codex.exe"),
      path.join(localAppData, "Programs", "codex", "codex.exe"),
      path.join(homedir(), ".local", "bin", "codex.exe"),
    ];
  }
  return [
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    path.join(homedir(), ".local", "bin", "codex"),
  ];
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return false;
    await fs.access(file, process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findInPath(envPath = process.env.PATH ?? ""): Promise<string | null> {
  const dirs = envPath.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const names = process.platform === "win32"
      ? ["codex.exe", "codex.cmd", "codex"]
      : ["codex"];
    for (const name of names) {
      const candidate = path.join(dir, name);
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
}

export function bundledCodexCliPath(
  installPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32"
    ? path.win32.join(installPath, "resources", "codex.exe")
    : path.join(installPath, "Contents", "Resources", "codex");
}

export async function locateCodexCli(
  preferredPath?: string | null,
  options: LocateCodexCliOptions = {},
): Promise<LocatedCli | null> {
  let executable: string | null = null;

  if (preferredPath && path.isAbsolute(preferredPath) && (await isExecutable(preferredPath))) {
    executable = preferredPath;
  }

  if (!executable) {
    const desktopBundlePath = options.desktopBundlePath === undefined
      ? (await createCodexDesktopAdapter().discover())?.installPath ?? null
      : options.desktopBundlePath;
    if (desktopBundlePath) {
      const bundled = bundledCodexCliPath(desktopBundlePath);
      if (await isExecutable(bundled)) executable = bundled;
    }
  }

  if (!executable) {
    for (const candidate of options.commonPaths ?? commonPaths()) {
      if (await isExecutable(candidate)) {
        executable = candidate;
        break;
      }
    }
  }

  if (!executable) {
    executable = await findInPath(options.envPath);
  }

  if (!executable) return null;

  const version = await readCodexCliVersion(executable);
  return { executablePath: executable, version };
}

export async function readCodexCliVersion(executablePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(executablePath, ["--version"], { timeout: 10_000 });
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
