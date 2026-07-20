/**
 * Dist build wrapper that works even when the user's `node` binary is a
 * WeSight/Electron-as-Node wrapper.  It bypasses the electron-builder CLI
 * (which trips over a non-standard `process.title` / `process.argv[0]`) and
 * calls the programmatic API directly.  If it detects it is running inside an
 * Electron-as-Node process, it re-executes itself with a real Node binary.
 *
 * Usage:
 *   node scripts/build-dist.mjs           # full DMG + zip
 *   node scripts/build-dist.mjs --dir     # unpacked directory only
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function isWrappedNode() {
  // WeSight sets ELECTRON_RUN_AS_NODE=1 and execPath points to the helper app.
  return (
    process.versions?.electron != null ||
    process.execPath.includes("WeSight") ||
    process.env.ELECTRON_RUN_AS_NODE === "1"
  );
}

function findRealNode() {
  const candidates = [];
  const nvmDir = path.join(os.homedir(), ".nvm", "versions", "node");
  if (fs.existsSync(nvmDir)) {
    const versions = fs
      .readdirSync(nvmDir)
      .filter((d) => fs.existsSync(path.join(nvmDir, d, "bin", "node")))
      .sort();
    for (const v of versions) candidates.push(path.join(nvmDir, v, "bin", "node"));
  }
  for (const p of ["/opt/homebrew/bin/node", "/usr/local/bin/node"]) {
    if (fs.existsSync(p)) candidates.push(p);
  }
  for (const c of candidates) {
    try {
      const result = spawnSync(c, ["--version"], { encoding: "utf8" });
      if (result.status === 0 && result.stdout.includes("v")) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

if (isWrappedNode()) {
  const realNode = findRealNode();
  if (!realNode) {
    console.error(
      "当前 `node` 是 WeSight/Electron-as-Node 包装器,且未找到可用的真实 Node 二进制文件。"
    );
    console.error("请通过 nvm 或 Homebrew 安装 Node >=22 后再运行打包。");
    process.exit(1);
  }
  console.log(`检测到 Electron-as-Node 包装器,使用真实 Node: ${realNode}`);
  const result = spawnSync(realNode, [process.argv[1], ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
  process.exit(result.status ?? 1);
}

const { build } = await import("electron-builder");

const dir = process.argv.includes("--dir");
const publish = process.argv.includes("--publish") ? "onTagOrDraft" : "never";

await build({
  mac: [],
  publish,
  ...(dir ? { dir: true } : {}),
});
