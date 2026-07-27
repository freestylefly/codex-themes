/**
 * [INPUT]: 依赖 node:path、深链白名单解析器与共享动作类型
 * [OUTPUT]: 对外提供单实例启动参数分类和 Windows 隐藏登录启动标记
 * [POS]: electron 组合根的命令行信任边界，只放行主题包与结构化 codexthemes 动作
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import path from "node:path";
import {
  CODEX_THEMES_PROTOCOL,
  parseAuthCallbackUrl,
  parseOpenThemeUrl,
  parsePaymentResultUrl,
  type AuthCallbackAction,
  type PaymentResultAction,
} from "./deep-links";
import type { OpenThemeAction } from "./shared/types";

export const HIDDEN_LOGIN_ARGUMENT = "--hidden";

export type LaunchArgument =
  | { type: "theme-file"; filePath: string }
  | { type: "auth"; rawUrl: string; action: AuthCallbackAction }
  | { type: "payment"; rawUrl: string; action: PaymentResultAction }
  | { type: "theme-link"; rawUrl: string; action: OpenThemeAction };

export function classifyLaunchArgument(raw: string): LaunchArgument | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const value = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
    ? raw.slice(1, -1)
    : raw;
  if (path.extname(value).toLowerCase() === ".codextheme" && path.isAbsolute(value)) {
    return { type: "theme-file", filePath: value };
  }
  if (!value.startsWith(CODEX_THEMES_PROTOCOL)) return null;
  const auth = parseAuthCallbackUrl(value);
  if (auth) return { type: "auth", rawUrl: value, action: auth };
  const payment = parsePaymentResultUrl(value);
  if (payment) return { type: "payment", rawUrl: value, action: payment };
  const theme = parseOpenThemeUrl(value);
  return theme ? { type: "theme-link", rawUrl: value, action: theme } : null;
}

export function classifyLaunchArguments(argv: readonly string[]): LaunchArgument[] {
  const actions: LaunchArgument[] = [];
  const seen = new Set<string>();
  for (const raw of argv) {
    const action = classifyLaunchArgument(raw);
    if (!action) continue;
    const key = action.type === "theme-file" ? action.filePath : action.rawUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
  }
  return actions;
}
