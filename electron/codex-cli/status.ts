/**
 * Maintains the live Codex CLI status: discovery, version check, App Server
 * connection, and capability/account probes.
 */

import { EventEmitter } from "node:events";
import type { CodexCliStatus } from "../shared/types";
import type { SettingsStore } from "../settings";
import { CodexAppServerClient, MIN_CODEX_CLI_VERSION } from "./app-server";
import { cliVersionSupported, locateCodexCli } from "./locator";

const EMPTY_STATUS: CodexCliStatus = {
  installed: false,
  executablePath: null,
  version: null,
  supported: false,
  appServerRunning: false,
  authenticated: false,
  authMode: null,
  imageGeneration: null,
  error: null,
};

export class CodexCliStatusService extends EventEmitter {
  private status: CodexCliStatus = { ...EMPTY_STATUS };
  private client: CodexAppServerClient | null = null;
  private refreshing = false;

  constructor(private settings: SettingsStore) {
    super();
  }

  getStatus(): CodexCliStatus {
    return { ...this.status };
  }

  async refresh(): Promise<CodexCliStatus> {
    if (this.refreshing) return this.getStatus();
    this.refreshing = true;
    try {
      const next = await this.probe();
      this.status = next;
      this.emit("changed", next);
      return next;
    } finally {
      this.refreshing = false;
    }
  }

  async selectExecutable(filePath: string): Promise<CodexCliStatus> {
    await this.settings.update({ codexCliPath: filePath });
    return this.refresh();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this.status = { ...EMPTY_STATUS };
  }

  async getConnectedClient(): Promise<CodexAppServerClient> {
    const status = await this.refresh();
    if (!status.appServerRunning || !this.client) {
      throw new Error(status.error ?? "Codex CLI / App Server 未连接");
    }
    return this.client;
  }

  private async probe(): Promise<CodexCliStatus> {
    const located = await locateCodexCli(this.settings.current.codexCliPath);
    if (!located) {
      return { ...EMPTY_STATUS, error: "未找到 Codex CLI。请通过设置手动选择路径。" };
    }

    const { executablePath, version } = located;
    if (!version) {
      return {
        ...EMPTY_STATUS,
        installed: true,
        executablePath,
        error: "无法读取 Codex CLI 版本。",
      };
    }

    const supported = cliVersionSupported(version, MIN_CODEX_CLI_VERSION);
    if (!supported) {
      return {
        ...EMPTY_STATUS,
        installed: true,
        executablePath,
        version,
        error: `Codex CLI ${version} 过低,最低要求 ${MIN_CODEX_CLI_VERSION}。`,
      };
    }

    if (!this.client) {
      this.client = new CodexAppServerClient();
      this.client.on("log", (level: "info" | "warn" | "error", message: string) =>
        this.emit("log", level, message),
      );
      this.client.on("notification", (method: string, params: unknown) =>
        this.emit("notification", method, params),
      );
      this.client.on("serverRequest", (id: number | string, method: string, params: unknown) =>
        this.emit("serverRequest", id, method, params),
      );
      this.client.on("close", (reason: string) => {
        this.status = { ...this.status, appServerRunning: false, error: `App Server 断开: ${reason}` };
        this.emit("changed", this.status);
      });
    }

    try {
      if (!this.client.isRunning) {
        await this.client.connect(executablePath);
      }
    } catch (err) {
      return {
        ...EMPTY_STATUS,
        installed: true,
        executablePath,
        version,
        supported: true,
        error: `无法启动 App Server:${(err as Error).message}`,
      };
    }

    let account: { account?: { type?: string; email?: string; planType?: string }; requiresOpenaiAuth?: boolean } = {};
    let capabilities: { imageGeneration?: boolean } = {};
    try {
      account = (await this.client.request("account/read", {})) as typeof account;
    } catch (err) {
      this.client.disconnect().catch(() => {});
      return {
        ...EMPTY_STATUS,
        installed: true,
        executablePath,
        version,
        supported: true,
        error: `账号读取失败:${(err as Error).message}`,
      };
    }

    try {
      capabilities = (await this.client.request("modelProvider/capabilities/read", {})) as typeof capabilities;
    } catch {
      // capability endpoint may be unavailable in some versions; leave null.
    }

    const authMode = account.account?.type ?? null;
    const authenticated = Boolean(authMode) || account.requiresOpenaiAuth === false;

    return {
      installed: true,
      executablePath,
      version,
      supported: true,
      appServerRunning: true,
      authenticated,
      authMode,
      imageGeneration: capabilities.imageGeneration ?? null,
      error: authenticated ? null : "Codex CLI 尚未登录。",
    };
  }
}
