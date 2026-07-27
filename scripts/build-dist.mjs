/**
 * [INPUT]: 依赖宿主 Node、electron-builder、Windows 原生资源和发布环境变量
 * [OUTPUT]: 生成平台制品，并执行 Node/公开配置/体积/ASAR/签名发布门禁
 * [POS]: scripts 的桌面发布组合根，兼容 Electron-as-Node 包装环境但拒绝伪发布
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function isWrappedNode() {
  return (
    process.versions?.electron != null ||
    process.execPath.includes("WeSight") ||
    process.env.ELECTRON_RUN_AS_NODE === "1"
  );
}

function findRealNode() {
  const candidates = new Set();
  if (process.platform === "win32") {
    const result = spawnSync("where.exe", ["node"], { encoding: "utf8", windowsHide: true });
    if (result.status === 0) {
      for (const candidate of result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
        candidates.add(candidate);
      }
    }
    for (const candidate of [
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs", "node.exe"),
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "nodejs", "node.exe"),
    ]) {
      if (candidate && fs.existsSync(candidate)) candidates.add(candidate);
    }
  }
  const nvmDir = path.join(os.homedir(), ".nvm", "versions", "node");
  if (fs.existsSync(nvmDir)) {
    const versions = fs
      .readdirSync(nvmDir)
      .filter((version) => fs.existsSync(path.join(nvmDir, version, "bin", "node")))
      .sort();
    for (const version of versions) {
      candidates.add(path.join(nvmDir, version, "bin", "node"));
    }
  }
  for (const candidate of ["/opt/homebrew/bin/node", "/usr/local/bin/node"]) {
    if (fs.existsSync(candidate)) candidates.add(candidate);
  }
  const current = path.resolve(process.execPath).toLowerCase();
  const usable = [];
  for (const candidate of candidates) {
    if (path.resolve(candidate).toLowerCase() === current) continue;
    try {
      const result = spawnSync(candidate, ["--version"], { encoding: "utf8", windowsHide: true });
      const match = result.status === 0 ? result.stdout.trim().match(/^v(\d+)\.(\d+)\.(\d+)/) : null;
      if (match && Number(match[1]) >= 22) {
        usable.push({ candidate, version: match.slice(1).map(Number) });
      }
    } catch {
      // Try the next known Node installation.
    }
  }
  usable.sort((left, right) => {
    for (let index = 0; index < 3; index += 1) {
      const difference = right.version[index] - left.version[index];
      if (difference !== 0) return difference;
    }
    return 0;
  });
  return usable[0]?.candidate ?? null;
}

function runNodeScript(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: path.resolve(import.meta.dirname, ".."),
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} exited with code ${result.status ?? "unknown"}`);
  }
}

if (isWrappedNode()) {
  const realNode = findRealNode();
  if (!realNode) {
    console.error("当前 `node` 是 WeSight/Electron-as-Node 包装器，且未找到可用的真实 Node 二进制文件。");
    console.error("请安装 Node >=22，并确保 where.exe/node 或 nvm/Homebrew 能找到真实二进制文件。");
    process.exit(1);
  }
  console.log(`检测到 Electron-as-Node 包装器，使用真实 Node: ${realNode}`);
  const result = spawnSync(realNode, [process.argv[1], ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
  process.exit(result.status ?? 1);
}

const explicitMac = process.argv.includes("--mac");
const explicitWindows = process.argv.includes("--win");
if (explicitMac && explicitWindows) {
  throw new Error("Choose only one distribution target: --mac or --win.");
}

const target = explicitMac ? "mac" : explicitWindows ? "win" : process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : null;
if (!target) {
  throw new Error(`Unsupported distribution host: ${process.platform}. Use macOS for --mac or Windows for --win.`);
}
if ((target === "mac" && process.platform !== "darwin") || (target === "win" && process.platform !== "win32")) {
  throw new Error(`Cross-building --${target} from ${process.platform} is not supported.`);
}

const dir = process.argv.includes("--dir");
const publishing = process.argv.includes("--publish");
const publish = publishing ? "onTagOrDraft" : "never";

if (!dir) {
  const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_COMMERCE_API_URL"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Release package is missing public runtime configuration: ${missing.join(", ")}.`);
  }
}
if (publishing && target === "win") {
  if (!(process.env.WIN_CSC_LINK || process.env.CSC_LINK)) {
    throw new Error("Publishing Windows requires WIN_CSC_LINK or CSC_LINK for Authenticode signing.");
  }
  if (!(process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD)) {
    throw new Error("Publishing Windows requires WIN_CSC_KEY_PASSWORD or CSC_KEY_PASSWORD.");
  }
}

if (target === "win") {
  runNodeScript("scripts/generate-windows-icons.mjs");
  runNodeScript("scripts/build-windows-helper.mjs");
}

const { build } = await import("electron-builder");
const artifacts = await build({
  [target]: [],
  publish,
  ...(dir ? { dir: true } : {}),
});

if (target === "win") verifyWindowsArtifacts({ dir, publishing, artifacts });

function directorySize(root) {
  let total = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    total += entry.isDirectory() ? directorySize(file) : fs.statSync(file).size;
  }
  return total;
}

function verifyWindowsArtifacts({ dir: directoryOnly, publishing: isPublishing, artifacts: builtArtifacts }) {
  const root = path.resolve(import.meta.dirname, "..", "release");
  const unpacked = path.join(root, "win-unpacked");
  const asar = path.join(unpacked, "resources", "app.asar");
  if (!fs.existsSync(unpacked) || !fs.existsSync(asar)) {
    throw new Error("Windows artifact verification could not find release/win-unpacked/resources/app.asar.");
  }

  const unpackedBytes = directorySize(unpacked);
  if (unpackedBytes > 350 * 1024 * 1024) {
    throw new Error(`Windows unpacked app exceeds 350 MiB: ${(unpackedBytes / 1024 / 1024).toFixed(1)} MiB.`);
  }

  const asarCli = path.resolve(import.meta.dirname, "..", "node_modules", "@electron", "asar", "bin", "asar.js");
  const listed = spawnSync(process.execPath, [asarCli, "list", asar], { encoding: "utf8", windowsHide: true });
  if (listed.status !== 0) throw new Error(`Unable to inspect app.asar: ${listed.stderr || listed.error}`);
  const denied = ["node_modules/typescript/", "node_modules/@vercel/", "node_modules/alipay-sdk/", "node_modules/tsx/"];
  const normalizedListing = listed.stdout.replaceAll("\\", "/").toLowerCase();
  const leaked = denied.filter((value) => normalizedListing.includes(value));
  if (leaked.length > 0) throw new Error(`app.asar contains forbidden build/server dependencies: ${leaked.join(", ")}.`);

  const packageJson = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "package.json"), "utf8"));
  const installer = path.join(root, `Codex-Themes-${packageJson.version}-win-x64.exe`);
  if (!directoryOnly) {
    if (!fs.existsSync(installer)) throw new Error(`Windows installer is missing: ${installer}.`);
    const installerBytes = fs.statSync(installer).size;
    if (installerBytes > 120 * 1024 * 1024) {
      throw new Error(`Windows installer exceeds 120 MiB: ${(installerBytes / 1024 / 1024).toFixed(1)} MiB.`);
    }
  }

  if (!isPublishing) return;
  const files = [
    path.join(unpacked, "Codex Themes.exe"),
    path.join(unpacked, "resources", "assets", "windows", "codex-activator.exe"),
    ...builtArtifacts.filter((file) => file.toLowerCase().endsWith(".exe")),
  ].filter((file, index, values) => fs.existsSync(file) && values.indexOf(file) === index);
  const signatureScript = [
    "$bad = @($args | ForEach-Object {",
    "  $signature = Get-AuthenticodeSignature -LiteralPath $_",
    "  if ($signature.Status -ne 'Valid') { \"$($_):$($signature.Status)\" }",
    "})",
    "if ($bad.Count -gt 0) { $bad | Write-Error; exit 1 }",
  ].join("\n");
  const signatures = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", signatureScript, ...files], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (signatures.status !== 0) {
    throw new Error(`Windows Authenticode verification failed: ${signatures.stderr || signatures.stdout}`);
  }
}
