/**
 * [INPUT]: 依赖 Windows AppX PowerShell 查询、netstat.exe、CodexActivator 和 AppPaths
 * [OUTPUT]: 对外提供 Windows Codex Adapter、Store 包/进程/监听解析器与可注入依赖
 * [POS]: electron/platform 的 Windows 实现，封装包身份、loopback CDP 与安全进程生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { AppPaths } from "../paths";
import type { CodexInstall, CodexPlatformAdapter } from "./types";

const execFileAsync = promisify(execFile);
const WINDOWS_PACKAGE_NAME = "OpenAI.Codex";
const WINDOWS_PACKAGE_PUBLISHER = "CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B";
const WINDOWS_PACKAGE_FAMILY_SUFFIX = "_2p2nqsd0c76g0";
const WINDOWS_APPLICATION_ID = "App";
const WINDOWS_ENTRY_POINT = "Windows.FullTrustApplication";
const WINDOWS_RELATIVE_EXECUTABLE = "app/ChatGPT.exe";
const WINDOWS_ARCHITECTURE = "x64";
const CODEX_NEW_THREAD_URL = "codex://threads/new";
const GRACEFUL_CLOSE_TIMEOUT_MS = 15_000;
const FORCED_CLOSE_TIMEOUT_MS = 5_000;
const CDP_TIMEOUT_MS = 45_000;
const DISCOVERY_CACHE_MS = 60_000;

export const WINDOWS_CODEX_DISCOVERY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
@(Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction Stop | ForEach-Object {
  $package = $_
  $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
  @($manifest.Package.Applications.Application) | ForEach-Object {
    [PSCustomObject]@{
      Name = $package.Name
      Publisher = $package.Publisher
      PackageFamilyName = $package.PackageFamilyName
      Architecture = $package.Architecture.ToString()
      Version = $package.Version.ToString()
      InstallLocation = $package.InstallLocation
      ApplicationId = $_.Id
      Executable = $_.Executable
      EntryPoint = $_.EntryPoint
    }
  }
}) | ConvertTo-Json -Depth 4 -Compress
`.trim();

export const WINDOWS_PROCESS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
@(Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue | Select-Object @{Name='ProcessId';Expression={[int]$_.Id}}, @{Name='ExecutablePath';Expression={$_.Path}}) | ConvertTo-Json -Depth 2 -Compress
`.trim();

interface WindowsPackageCandidate {
  Name?: unknown;
  Publisher?: unknown;
  PackageFamilyName?: unknown;
  Architecture?: unknown;
  Version?: unknown;
  InstallLocation?: unknown;
  ApplicationId?: unknown;
  Executable?: unknown;
  EntryPoint?: unknown;
}

export interface WindowsProcessRow {
  processId: number;
  executablePath: string | null;
}

export interface WindowsTcpListener {
  localAddress: string;
  localPort: number;
  owningProcess: number;
}

interface HelperResult {
  ok?: unknown;
  error?: unknown;
  pid?: unknown;
  packageFamilyName?: unknown;
  windowsClosed?: unknown;
}

export interface WindowsPlatformDependencies {
  runPowerShell(script: string, args?: string[]): Promise<string>;
  runNetstat(): Promise<string>;
  runHelper(args: string[]): Promise<unknown>;
  killProcessTree(pid: number): Promise<void>;
  httpReady(port: number): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

function asArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseJson(text: string, context: string): unknown {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`${context} returned malformed JSON: ${(error as Error).message}`);
  }
}

function requireString(candidate: WindowsPackageCandidate, key: keyof WindowsPackageCandidate): string {
  const value = candidate[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Codex package ${key} is missing.`);
  }
  return value;
}

function normalizeWindowsPath(value: string): string {
  return path.win32.normalize(value.replaceAll("/", "\\")).toLowerCase();
}

function compareWindowsVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function validatePackageCandidate(candidate: WindowsPackageCandidate): CodexInstall {
  const name = requireString(candidate, "Name");
  if (name !== WINDOWS_PACKAGE_NAME) throw new Error(`Codex package Name mismatch: ${name}.`);
  const publisher = requireString(candidate, "Publisher");
  if (publisher !== WINDOWS_PACKAGE_PUBLISHER) {
    throw new Error(`Codex package Publisher mismatch: ${publisher}.`);
  }
  const packageFamilyName = requireString(candidate, "PackageFamilyName");
  if (packageFamilyName !== `${WINDOWS_PACKAGE_NAME}${WINDOWS_PACKAGE_FAMILY_SUFFIX}`) {
    throw new Error(`Codex package PackageFamilyName mismatch: ${packageFamilyName}.`);
  }
  const architecture = requireString(candidate, "Architecture").toLowerCase();
  if (architecture !== WINDOWS_ARCHITECTURE) {
    throw new Error(`Codex package Architecture mismatch: ${architecture}.`);
  }
  const applicationId = requireString(candidate, "ApplicationId");
  if (applicationId !== WINDOWS_APPLICATION_ID) {
    throw new Error(`Codex package ApplicationId mismatch: ${applicationId}.`);
  }
  const entryPoint = requireString(candidate, "EntryPoint");
  if (entryPoint !== WINDOWS_ENTRY_POINT) {
    throw new Error(`Codex package EntryPoint mismatch: ${entryPoint}.`);
  }
  const relativeExecutable = requireString(candidate, "Executable");
  if (normalizeWindowsPath(relativeExecutable) !== normalizeWindowsPath(WINDOWS_RELATIVE_EXECUTABLE)) {
    throw new Error(`Codex package Executable mismatch: ${relativeExecutable}.`);
  }
  const version = requireString(candidate, "Version");
  if (!/^\d+(?:\.\d+){1,3}$/.test(version)) {
    throw new Error(`Codex package Version is invalid: ${version}.`);
  }
  const installLocation = requireString(candidate, "InstallLocation");
  const aumid = `${packageFamilyName}!${applicationId}`;
  return {
    displayIdentity: packageFamilyName,
    executablePath: path.win32.join(installLocation, ...WINDOWS_RELATIVE_EXECUTABLE.split("/")),
    version,
    packageLaunchIdentity: { packageFamilyName, applicationId, aumid },
  };
}

export function parseWindowsCodexPackages(output: string): CodexInstall[] {
  const rows = asArray(parseJson(output, "Codex package discovery"));
  if (rows.length === 0) return [];
  const valid: CodexInstall[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push("Codex package discovery returned a non-object candidate.");
      continue;
    }
    try {
      valid.push(validatePackageCandidate(row as WindowsPackageCandidate));
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  if (valid.length === 0) throw new Error(errors[0] ?? "No verified Codex package candidate was found.");
  return valid.sort((left, right) => compareWindowsVersions(right.version, left.version));
}

export function parseWindowsProcessTable(output: string): WindowsProcessRow[] {
  return asArray(parseJson(output, "Windows process enumeration")).filter((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Windows process enumeration returned a non-object row.");
    }
    return Number((value as Record<string, unknown>).ProcessId) !== 0;
  }).map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Windows process enumeration returned a non-object row.");
    }
    const row = value as Record<string, unknown>;
    const processId = Number(row.ProcessId);
    if (!Number.isInteger(processId) || processId <= 0) {
      throw new Error("Windows process enumeration returned an invalid process id.");
    }
    return {
      processId,
      executablePath: typeof row.ExecutablePath === "string" ? row.ExecutablePath : null,
    };
  });
}

function parseNetstatEndpoint(endpoint: string): { address: string; port: number } | null {
  const separator = endpoint.lastIndexOf(":");
  if (separator <= 0) return null;
  const port = Number(endpoint.slice(separator + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  const rawAddress = endpoint.slice(0, separator);
  const address = rawAddress.startsWith("[") && rawAddress.endsWith("]")
    ? rawAddress.slice(1, -1)
    : rawAddress;
  return address ? { address, port } : null;
}

export function parseWindowsTcpListeners(output: string): WindowsTcpListener[] {
  const listeners: WindowsTcpListener[] = [];
  for (const rawLine of output.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const columns = rawLine.trim().split(/\s+/);
    if (columns.length < 5 || columns[0]?.toUpperCase() !== "TCP") continue;
    if (columns.at(-2)?.toUpperCase() !== "LISTENING") continue;
    const endpoint = parseNetstatEndpoint(columns[1] ?? "");
    const owningProcess = Number(columns.at(-1));
    if (!endpoint || !Number.isInteger(owningProcess) || owningProcess <= 0) continue;
    listeners.push({
      localAddress: endpoint.address,
      localPort: endpoint.port,
      owningProcess,
    });
  }
  return listeners;
}

export function isLoopbackAddress(address: string): boolean {
  return address === "127.0.0.1" || address === "::1";
}

function assertHelperResult(value: unknown): HelperResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Windows helper returned an invalid response.");
  }
  const result = value as HelperResult;
  if (result.ok !== true) {
    throw new Error(typeof result.error === "string" ? result.error : "Windows helper command failed.");
  }
  return result;
}

async function defaultExec(file: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(file, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  return String(stdout);
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildPowerShellCommand(script: string, args: string[] = []): string {
  const invocation = args.length > 0
    ? ` ${args.map(quotePowerShellLiteral).join(" ")}`
    : "";
  return `& {\n${script}\n}${invocation}`;
}

function defaultDependencies(paths: AppPaths): WindowsPlatformDependencies {
  return {
    runPowerShell: (script, args = []) => defaultExec("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      buildPowerShellCommand(script, args),
    ]),
    runNetstat: () => defaultExec("netstat.exe", ["-ano", "-p", "tcp"]),
    async runHelper(args) {
      const output = await defaultExec(paths.windowsHelperPath, args);
      return parseJson(output, "Windows helper");
    },
    async killProcessTree(pid) {
      await defaultExec("taskkill.exe", ["/PID", String(pid), "/T", "/F"]);
    },
    async httpReady(port) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1_000);
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
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  };
}

function isPackageLaunchInstall(install: CodexInstall): install is CodexInstall & {
  packageLaunchIdentity: NonNullable<CodexInstall["packageLaunchIdentity"]>;
} {
  return Boolean(install.packageLaunchIdentity);
}

function isPotentialCodexProcess(row: WindowsProcessRow, install: CodexInstall): boolean {
  return Boolean(
    row.executablePath
    && path.win32.basename(row.executablePath).toLowerCase() === "chatgpt.exe",
  );
}

async function helperPackageFamily(
  processId: number,
  dependencies: WindowsPlatformDependencies,
): Promise<string | null> {
  const result = assertHelperResult(await dependencies.runHelper(["package-family", String(processId)]));
  if (result.packageFamilyName === null) return null;
  if (typeof result.packageFamilyName !== "string" || result.packageFamilyName.length === 0) {
    throw new Error("Windows helper returned an invalid package family.");
  }
  return result.packageFamilyName;
}

async function processBelongsDirectly(
  row: WindowsProcessRow,
  install: CodexInstall,
  dependencies: WindowsPlatformDependencies,
): Promise<boolean> {
  if (
    !row.executablePath
    || normalizeWindowsPath(row.executablePath) !== normalizeWindowsPath(install.executablePath)
    || !isPotentialCodexProcess(row, install)
    || !install.packageLaunchIdentity
  ) return false;
  return (await helperPackageFamily(row.processId, dependencies).catch(() => null))
    === install.packageLaunchIdentity.packageFamilyName;
}

export function createWindowsCodexPlatformAdapter(
  paths: AppPaths,
  overrides: Partial<WindowsPlatformDependencies> = {},
): CodexPlatformAdapter {
  const dependencies = { ...defaultDependencies(paths), ...overrides };
  let discoveryCache: { expiresAt: number; install: CodexInstall | null } | null = null;

  const getProcesses = async () => parseWindowsProcessTable(
    await dependencies.runPowerShell(WINDOWS_PROCESS_SCRIPT),
  );
  const getListeners = async (port?: number) => {
    const listeners = parseWindowsTcpListeners(await dependencies.runNetstat());
    return port === undefined ? listeners : listeners.filter((listener) => listener.localPort === port);
  };
  const verifiedRows = async (install: CodexInstall): Promise<WindowsProcessRow[]> => {
    const processes = await getProcesses();
    const candidates = processes.filter((row) => isPotentialCodexProcess(row, install));
    const verified: WindowsProcessRow[] = [];
    for (const row of candidates) {
      if (await processBelongsDirectly(row, install, dependencies)) verified.push(row);
    }
    return verified;
  };
  const isRunning = async (install: CodexInstall) => {
    const processes = await getProcesses();
    for (const row of processes) {
      if (await processBelongsDirectly(row, install, dependencies)) return true;
    }
    return false;
  };
  const waitUntilStopped = async (install: CodexInstall, timeoutMs: number): Promise<boolean> => {
    const deadline = dependencies.now() + timeoutMs;
    while (dependencies.now() < deadline) {
      if (!(await isRunning(install))) return true;
      await dependencies.sleep(250);
    }
    return !(await isRunning(install));
  };
  const verifyCdpEndpoint = async (port: number, install: CodexInstall): Promise<boolean> => {
    const listeners = await getListeners(port);
    if (listeners.length === 0) return false;
    if (listeners.some((listener) => !isLoopbackAddress(listener.localAddress))) return false;
    const processes = await getProcesses();
    const byPid = new Map(processes.map((row) => [row.processId, row]));
    for (const listener of listeners) {
      const process = byPid.get(listener.owningProcess);
      if (!process || !(await processBelongsDirectly(process, install, dependencies))) return false;
    }
    return dependencies.httpReady(port);
  };
  const activate = async (install: CodexInstall, argumentsValue: string): Promise<void> => {
    if (!isPackageLaunchInstall(install)) throw new Error("Verified Codex package launch identity is missing.");
    const result = assertHelperResult(await dependencies.runHelper([
      "activate",
      install.packageLaunchIdentity.aumid,
      argumentsValue,
    ]));
    if (!Number.isInteger(result.pid) || Number(result.pid) <= 0) {
      throw new Error("Windows helper returned an invalid activated process id.");
    }
  };

  return {
    metadata: {
      os: "windows",
      displayLabel: "Windows 11",
      desktopInstallHint: "请从 Microsoft Store 安装官方 Codex 应用。",
      manualUpdatePackageLabel: "Windows installer",
    },
    async discover() {
      if (discoveryCache && dependencies.now() < discoveryCache.expiresAt) {
        return discoveryCache.install;
      }
      const installs = parseWindowsCodexPackages(await dependencies.runPowerShell(WINDOWS_CODEX_DISCOVERY_SCRIPT));
      const install = installs[0] ?? null;
      discoveryCache = { install, expiresAt: dependencies.now() + DISCOVERY_CACHE_MS };
      return install;
    },
    isRunning,
    async stop(install, options) {
      let processes = await verifiedRows(install);
      if (processes.length === 0) return;
      for (const process of processes) {
        assertHelperResult(await dependencies.runHelper(["close", String(process.processId)]));
      }
      if (await waitUntilStopped(install, GRACEFUL_CLOSE_TIMEOUT_MS)) return;
      if (!options.force) {
        throw new Error(
          "Codex did not close within 15 seconds; explicit restart authorization is required for a forced stop.",
        );
      }
      processes = await verifiedRows(install);
      for (const process of processes) {
        if (!(await processBelongsDirectly(process, install, dependencies))) continue;
        await dependencies.killProcessTree(process.processId);
      }
      if (!(await waitUntilStopped(install, FORCED_CLOSE_TIMEOUT_MS))) {
        throw new Error("Codex could not be stopped safely.");
      }
    },
    verifyCdpEndpoint,
    async selectAvailablePort(preferredPort) {
      const last = Math.min(preferredPort + 100, 65_535);
      const occupied = new Set((await getListeners()).map((listener) => listener.localPort));
      for (let port = preferredPort; port <= last; port += 1) {
        if (!occupied.has(port)) return port;
      }
      throw new Error(`No free loopback port was found between ${preferredPort} and ${last}.`);
    },
    launchWithCdp: (install, port) => activate(
      install,
      `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`,
    ),
    async waitForCdp(port, install, timeoutMs = CDP_TIMEOUT_MS) {
      const deadline = dependencies.now() + timeoutMs;
      while (dependencies.now() < deadline) {
        if (await verifyCdpEndpoint(port, install)) return;
        await dependencies.sleep(350);
      }
      throw new Error(`Timed out waiting for the verified Codex debug port ${port}.`);
    },
    async openCodexMode() {
      assertHelperResult(await dependencies.runHelper(["open-uri", CODEX_NEW_THREAD_URL]));
    },
    launchNormally: (install) => activate(install, ""),
  };
}
