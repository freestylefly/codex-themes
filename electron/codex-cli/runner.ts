/**
 * [INPUT]: 依赖 Node child_process 与 Windows ComSpec
 * [OUTPUT]: 提供 exe/无扩展程序和 npm .cmd shim 的统一命令规格、exec 与 spawn
 * [POS]: electron/codex-cli 的进程启动深模块，集中 Windows 引号和隐藏控制台策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { execFile, spawn, type ChildProcess, type ExecFileOptions } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CodexCliCommand {
  file: string;
  args: string[];
}
function quoteCmdValue(value: string): string {
  if (/[\r\n%]/.test(value)) throw new Error("Codex CLI 路径或参数包含不安全的 Windows 命令字符。");
  return `"${value.replaceAll('"', '""')}"`;
}

export function codexCliCommand(
  executablePath: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): CodexCliCommand {
  const extension = path.extname(executablePath).toLowerCase();
  if (platform !== "win32" || extension !== ".cmd") return { file: executablePath, args };
  const shell = process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe";
  const invocation = `call ${[executablePath, ...args].map(quoteCmdValue).join(" ")}`;
  return { file: shell, args: ["/d", "/s", "/c", invocation] };
}

export async function execCodexCli(
  executablePath: string,
  args: string[],
  options: ExecFileOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const command = codexCliCommand(executablePath, args);
  const result = await execFileAsync(command.file, command.args, {
    ...options,
    encoding: "utf8",
    windowsHide: true,
  });
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}

export function spawnCodexCli(executablePath: string, args: string[]): ChildProcess {
  const command = codexCliCommand(executablePath, args);
  return spawn(command.file, command.args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
    windowsHide: true,
  });
}
