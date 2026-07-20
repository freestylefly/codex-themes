/**
 * macOS integration: discover the official Codex desktop app, stop/launch it
 * with a loopback CDP port, and verify port ownership. Node/TypeScript port
 * of common-macos.sh from Codex-Dream-Skin (MIT).
 *
 * Safety invariants kept from the shell original:
 *  - only bundles whose CFBundleIdentifier is exactly com.openai.codex;
 *  - graceful quit first (AppleScript), force kill only with explicit
 *    authorization from the UI layer;
 *  - a CDP port is only trusted when its listener is the Codex process or a
 *    descendant of it (lsof + ps ancestry walk).
 */

import { execFile, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CODEX_BUNDLE_ID = "com.openai.codex";
export const CODEX_APP_CANDIDATES = [
  "/Applications/ChatGPT.app",
  path.join(os.homedir(), "Applications/ChatGPT.app"),
];

export interface CodexInstall {
  bundle: string;
  executable: string;
  version: string;
}

async function run(file: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(file, args, { maxBuffer: 4 * 1024 * 1024 });
  return stdout;
}

async function plistString(plist: string, key: string): Promise<string | null> {
  try {
    const out = await run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plist]);
    return out.trim() || null;
  } catch {
    return null;
  }
}

async function checkCandidate(bundle: string): Promise<CodexInstall | null> {
  const plist = path.join(bundle, "Contents/Info.plist");
  const identifier = await plistString(plist, "CFBundleIdentifier");
  if (identifier !== CODEX_BUNDLE_ID) return null;
  const executableName = await plistString(plist, "CFBundleExecutable");
  if (!executableName) return null;
  const executable = path.join(bundle, "Contents/MacOS", executableName);
  const version = (await plistString(plist, "CFBundleShortVersionString")) ?? "unknown";
  return { bundle, executable, version };
}

/** Locate the official Codex app bundle; null when not installed. */
export async function discoverCodexApp(configured?: string): Promise<CodexInstall | null> {
  const candidates = [configured, ...CODEX_APP_CANDIDATES].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const found = await checkCandidate(candidate);
    if (found) return found;
  }
  try {
    const out = await run("/usr/bin/mdfind", [`kMDItemCFBundleIdentifier == "${CODEX_BUNDLE_ID}"`]);
    const first = out.split("\n").map((line) => line.trim()).find(Boolean);
    if (first) {
      const found = await checkCandidate(first);
      if (found) return found;
    }
  } catch {
    // Spotlight unavailable — treat as not installed
  }
  return null;
}

async function psTable(): Promise<{ pid: number; command: string }[]> {
  const out = await run("/bin/ps", ["-axo", "pid=,command="]);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+)\s+(.*)$/.exec(line);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter((row): row is { pid: number; command: string } => row !== null);
}

/** PIDs whose command line starts with the Codex executable path. */
export async function codexMainPids(executable: string): Promise<number[]> {
  const table = await psTable();
  return table.filter((row) => row.command.startsWith(executable)).map((row) => row.pid);
}

export async function codexIsRunning(executable: string): Promise<boolean> {
  return (await codexMainPids(executable)).length > 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Graceful quit (AppleScript, up to 15 s); only when `force` is true escalate
 * to TERM then KILL. `force` must come from an explicit user confirmation.
 */
export async function stopCodex(executable: string, opts: { force: boolean }): Promise<void> {
  if (!(await codexIsRunning(executable))) return;
  await run("/usr/bin/osascript", ["-e", `tell application id "${CODEX_BUNDLE_ID}" to quit`]).catch(
    () => {},
  );
  let deadline = Date.now() + 15_000;
  while ((await codexIsRunning(executable)) && Date.now() < deadline) await sleep(250);
  if (!(await codexIsRunning(executable))) return;

  if (!opts.force) {
    throw new Error(
      "Codex did not close within 15 seconds; explicit restart authorization is required for a forced stop.",
    );
  }
  for (const pid of await codexMainPids(executable)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  deadline = Date.now() + 5_000;
  while ((await codexIsRunning(executable)) && Date.now() < deadline) await sleep(250);
  if (await codexIsRunning(executable)) {
    for (const pid of await codexMainPids(executable)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
  await sleep(500);
  if (await codexIsRunning(executable)) throw new Error("Codex could not be stopped safely.");
}

async function listenerPids(port: number): Promise<number[]> {
  try {
    const out = await run("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    return [...new Set(out.split("\n").map((line) => Number(line.trim())).filter((n) => n > 0))];
  } catch {
    return []; // lsof exits non-zero when nothing matches
  }
}

export async function portIsAvailable(port: number): Promise<boolean> {
  return (await listenerPids(port)).length === 0;
}

async function pidIsCodexDescendant(pid: number, executable: string): Promise<boolean> {
  let current = pid;
  for (let depth = 0; current > 1 && depth < 32; depth += 1) {
    const command = await run("/bin/ps", ["-p", String(current), "-o", "command="]).catch(() => "");
    if (command.trim().startsWith(executable)) return true;
    const parentOut = await run("/bin/ps", ["-p", String(current), "-o", "ppid="]).catch(() => "");
    const parent = Number(parentOut.trim());
    if (!Number.isInteger(parent) || parent <= 1 || parent === current) return false;
    current = parent;
  }
  return false;
}

/** True only when every listener on the port is Codex or a Codex descendant. */
export async function portBelongsToCodex(port: number, executable: string): Promise<boolean> {
  const pids = await listenerPids(port);
  if (pids.length === 0) return false;
  let foundDirect = false;
  for (const pid of pids) {
    const command = await run("/bin/ps", ["-p", String(pid), "-o", "command="]).catch(() => "");
    if (command.trim().startsWith(executable)) foundDirect = true;
    else if (!(await pidIsCodexDescendant(pid, executable))) return false;
  }
  return foundDirect;
}

/** Cheap health check: loopback DevTools HTTP endpoint answers. */
export async function cdpHttpReady(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** HTTP healthy AND the listener chain traces back to the Codex executable. */
export async function verifiedCdpEndpoint(port: number, executable: string): Promise<boolean> {
  if (!(await portBelongsToCodex(port, executable))) return false;
  return cdpHttpReady(port);
}

/** First free loopback port in [preferred, preferred+100]. */
export async function selectAvailablePort(preferred: number): Promise<number> {
  const last = Math.min(preferred + 100, 65535);
  for (let candidate = preferred; candidate <= last; candidate += 1) {
    if (await portIsAvailable(candidate)) return candidate;
  }
  throw new Error(`No free loopback port was found between ${preferred} and ${last}.`);
}

export async function waitForCdp(port: number, executable: string, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdpHttpReady(port)) {
      if ((await portBelongsToCodex(port, executable)) || (await codexIsRunning(executable))) return;
    }
    await sleep(350);
  }
  throw new Error(`Timed out waiting for the Codex debug port ${port}.`);
}

export async function launchCodexWithCdp(install: CodexInstall, port: number): Promise<void> {
  try {
    await run("/usr/bin/open", [
      "-na",
      install.bundle,
      "--args",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
    ]);
  } catch {
    // fall through to direct exec below
  }
  if (!(await codexIsRunning(install.executable))) {
    // Fallback when `open` fails to forward args on some builds.
    const child = spawn(
      install.executable,
      ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
  }
}

export async function launchCodexNormally(bundle: string): Promise<void> {
  await run("/usr/bin/open", ["-na", bundle]);
}
