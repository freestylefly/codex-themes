/**
 * [INPUT]: 依赖 electron-builder afterPack 上下文与已复制的 Windows 激活辅助程序
 * [OUTPUT]: 将辅助程序加入 builder 的 Authenticode 签名队列
 * [POS]: Windows 正式发布签名钩子，与主程序和 NSIS 的 builder 原生签名协作
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { access } from "node:fs/promises";
import path from "node:path";

export default async function signWindowsHelper(context) {
  if (context.electronPlatformName !== "win32") return;
  const helper = path.join(
    context.appOutDir,
    "resources",
    "assets",
    "windows",
    "codex-activator.exe",
  );
  await access(helper);
  await context.packager.signIf(helper);
}
