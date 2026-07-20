/**
 * Discover the local Codex CLI executable and read its version.
 *
 * Resolution order:
 *   1. User-selected absolute path from settings.
 *   2. Common installation paths (/opt/homebrew/bin/codex, /usr/local/bin/codex,
 *      ~/.local/bin/codex).
 *   3. Directories in the launch environment PATH.
 *
 * No shell string interpolation is used; all paths are checked with fs.access.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const COMMON_PATHS = [
  "/opt/homebrew/bin/codex",
  "/usr/local/bin/codex",
  path.join(homedir(), ".local", "bin", "codex"),
];

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

async function findInPath(): Promise<string | null> {
  const envPath = process.env.PATH ?? "";
  const dirs = envPath.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, "codex");
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

export interface LocatedCli {
  executablePath: string;
  version: string | null;
}

export async function locateCodexCli(preferredPath?: string | null): Promise<LocatedCli | null> {
  let executable: string | null = null;

  if (preferredPath && path.isAbsolute(preferredPath) && (await isExecutable(preferredPath))) {
    executable = preferredPath;
  }

  if (!executable) {
    for (const candidate of COMMON_PATHS) {
      if (await isExecutable(candidate)) {
        executable = candidate;
        break;
      }
    }
  }

  if (!executable) {
    executable = await findInPath();
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
