import fs from "node:fs/promises";
import path from "node:path";

import { connectCodexTargets } from "../electron/engine/cdp";
import { PREFERRED_CDP_PORT } from "../electron/engine/constants";
import { buildPayload } from "../electron/engine/payload";
import { removeFromSession, waitForVerifiedSession } from "../electron/engine/verify";
import { ThemeWatcher } from "../electron/engine/watcher";
import {
  discoverCodexApp,
  codexIsRunning,
  launchCodexWithCdp,
  selectAvailablePort,
  stopCodex,
  verifiedCdpEndpoint,
  waitForCdp,
} from "../electron/platform/codex-macos";
import { parseRuntimeCommand } from "./happy-coding-runtime-core";

const runtimeRoot = path.dirname(process.execPath);
const injectDir = path.join(runtimeRoot, "inject");
const themeDir = path.join(runtimeRoot, "theme");
const statusFile = path.join(runtimeRoot, "status.json");

async function writeStatus(status: string, detail?: string): Promise<void> {
  await fs.writeFile(statusFile, `${JSON.stringify({ status, detail, at: new Date().toISOString() })}\n`);
}

async function activePort(executable: string): Promise<number | null> {
  for (let port = PREFERRED_CDP_PORT; port <= PREFERRED_CDP_PORT + 100; port += 1) {
    if (await verifiedCdpEndpoint(port, executable)) return port;
  }
  return null;
}

async function ensureCodexWithCdp(): Promise<{ port: number }> {
  const install = await discoverCodexApp();
  if (!install) throw new Error("未找到官方 ChatGPT/Codex 桌面应用。");
  const existing = await activePort(install.executable);
  if (existing) return { port: existing };

  const port = await selectAvailablePort(PREFERRED_CDP_PORT);
  if (await codexIsRunning(install.executable)) {
    await stopCodex(install.executable, { force: true });
  }
  await launchCodexWithCdp(install, port);
  await waitForCdp(port, install.executable, 45_000);
  return { port };
}

async function runWatcher(once: boolean): Promise<void> {
  await writeStatus("starting");
  const { port } = await ensureCodexWithCdp();
  const { payload, theme } = await buildPayload(injectDir, themeDir);
  const watcher = new ThemeWatcher(port, payload);
  watcher.on("log", (_level, message) => console.log(message));
  watcher.start();
  const session = await watcher.waitForSession(45_000);
  const verification = await waitForVerifiedSession(session, 20_000);
  await writeStatus(verification.pass ? "applied" : "partial", theme.name);

  if (once) {
    await watcher.stop();
    return;
  }

  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await watcher.stop();
}

async function cleanup(): Promise<void> {
  const install = await discoverCodexApp();
  if (!install) return;
  const port = await activePort(install.executable);
  if (!port) return;
  const targets = await connectCodexTargets(port, 5_000).catch(() => []);
  for (const { session } of targets) {
    await removeFromSession(session).catch(() => false);
    session.close();
  }
  await writeStatus("removed");
}

async function main(): Promise<void> {
  try {
    const command = parseRuntimeCommand(process.argv.slice(2));
    if (command === "cleanup") await cleanup();
    else await runWatcher(command === "apply-once");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeStatus("failed", message).catch(() => {});
    console.error(message);
    process.exitCode = 1;
  }
}

void main();
