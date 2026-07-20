/**
 * ThemeController — the stateful heart of the main process.
 *
 * Owns the full apply/restore lifecycle:
 *   discover Codex → reuse a healthy CDP port or (with consent) restart
 *   Codex with one → build the injection payload → run the in-process
 *   watcher → back up config.toml appearance keys → soft-verify → persist.
 *
 * Safety rails enforced here (DESIGN §7):
 *  - a stored port is only reused after the listener is proven to be the
 *    Codex process itself (portBelongsToCodex) plus an HTTP health check;
 *  - force-killing Codex requires confirmRestart from the UI;
 *  - the config.toml backup is written once and never overwritten.
 */

import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import type { AppState, ApplyResult, ApplyStatus, CodexCliStatus, LayoutKind, LogLine } from "./shared/types";
import type { AppPaths } from "./paths";
import { PREFERRED_CDP_PORT, SKIN_VERSION } from "./engine/constants";
import { buildPayload } from "./engine/payload";
import { removeFromSession, waitForVerifiedSession } from "./engine/verify";
import { ThemeWatcher } from "./engine/watcher";
import { connectCodexTargets } from "./engine/cdp";
import {
  codexIsRunning,
  discoverCodexApp,
  launchCodexNormally,
  launchCodexWithCdp,
  selectAvailablePort,
  stopCodex,
  verifiedCdpEndpoint,
  waitForCdp,
  type CodexInstall,
} from "./platform/codex-macos";
import { backupAppearanceKeys, restoreAppearanceKeys } from "./config/codex-config";
import { SettingsStore } from "./settings";
import { ThemeStore } from "./themes/store";
import { CodexCliStatusService } from "./codex-cli/status";
import { AiThemeJobService } from "./ai/job-service";
import type { AiThemeJob, AiThemeJobSummary, CodexApprovalDecision, ThemeGenerationRequest } from "./shared/types";

interface PersistedState {
  activeThemeId: string | null;
  activeThemeName: string | null;
  activeLayout: LayoutKind | null;
  cdpPort: number | null;
  appliedAt: string | null;
}

/** Minimum delay between two auto-apply attempts. */
const AUTO_APPLY_COOLDOWN_MS = 60_000;
/** Codex must have been up this long before we restart it for auto-apply. */
const AUTO_APPLY_SETTLE_MS = 4_000;

const EMPTY_PERSISTED: PersistedState = {
  activeThemeId: null,
  activeThemeName: null,
  activeLayout: null,
  cdpPort: null,
  appliedAt: null,
};

export class ThemeController extends EventEmitter {
  private install: CodexInstall | null = null;
  private watcher: ThemeWatcher | null = null;
  private persisted: PersistedState = { ...EMPTY_PERSISTED };
  private applying = false;
  private lastError: string | null = null;
  private codexRunning = false;
  private cdpHealthy = false;
  private autoApplyRunningSince: number | null = null;
  private lastAutoApplyAt = 0;
  private cliService: CodexCliStatusService;
  private jobService: AiThemeJobService;

  constructor(
    private paths: AppPaths,
    private store: ThemeStore,
    private settings: SettingsStore,
  ) {
    super();
    this.cliService = new CodexCliStatusService(settings);
    this.cliService.on("log", (level, message) => this.log(level, message));
    this.cliService.on("changed", () => this.emitState());
    this.jobService = new AiThemeJobService(paths, this.cliService, store);
    this.jobService.on("log", (level, message) => this.log(level, message));
    this.jobService.on("jobChanged", (job) => this.emit("aiJobChanged", job));
    this.jobService.on("approvalRequested", (req) => this.emit("codexApprovalRequested", req));
  }

  // ------------------------------------------------------------- lifecycle

  async init(): Promise<void> {
    this.persisted = await this.readPersisted();
    await this.refreshStatus();
    await this.jobService.init();
    this.refreshCliStatus().catch((err) =>
      this.log("warn", `初始 Codex CLI 状态探测失败:${(err as Error).message}`),
    );
    if (!this.install) return;

    // Resume a previously applied theme if its debug port is still ours.
    const { activeThemeId, cdpPort } = this.persisted;
    if (!activeThemeId || !cdpPort) return;
    if (!(await verifiedCdpEndpoint(cdpPort, this.install.executable))) {
      this.log("info", "Codex 未在调试端口上运行,主题将在下次应用时恢复。");
      return;
    }
    try {
      const dir = await this.store.resolveThemeDir(activeThemeId);
      if (!dir) throw new Error("theme directory is gone");
      await this.startWatcher(dir, cdpPort);
      this.log("info", `已恢复主题「${this.persisted.activeThemeName ?? activeThemeId}」的注入守护。`);
    } catch (error) {
      this.log("warn", `恢复上次主题失败:${(error as Error).message}`);
      this.persisted = { ...EMPTY_PERSISTED, cdpPort };
      await this.writePersisted();
    }
  }

  /** Refresh install/running/CDP health and notify listeners. */
  async refreshStatus(): Promise<AppState> {
    this.install = await discoverCodexApp();
    if (this.install) {
      this.codexRunning = await codexIsRunning(this.install.executable);
      this.cdpHealthy = this.persisted.cdpPort
        ? await verifiedCdpEndpoint(this.persisted.cdpPort, this.install.executable)
        : false;
    } else {
      this.codexRunning = false;
      this.cdpHealthy = false;
    }
    const state = this.getState();
    this.emit("stateChanged", state);
    return state;
  }

  /** Probe the local Codex CLI and update the renderer-facing status. */
  async refreshCliStatus(): Promise<CodexCliStatus> {
    const status = await this.cliService.refresh();
    this.emitState();
    return status;
  }

  /** Set a user-selected Codex CLI executable path and refresh status. */
  async selectCodexCliPath(filePath: string): Promise<CodexCliStatus> {
    const status = await this.cliService.selectExecutable(filePath);
    this.emitState();
    return status;
  }

  // --------------------------------------------------------------- AI jobs

  createAiThemeJob(input: ThemeGenerationRequest): Promise<AiThemeJob> {
    return this.jobService.createJob(input);
  }

  startAiThemeJob(jobId: string): Promise<void> {
    return this.jobService.startJob(jobId);
  }

  selectAiThemeCandidate(jobId: string, candidateId: string): Promise<void> {
    return this.jobService.selectCandidate(jobId, candidateId);
  }

  refineAiThemeJob(jobId: string, instruction: string, regenerateImage: boolean): Promise<void> {
    return this.jobService.refineJob(jobId, instruction, regenerateImage);
  }

  cancelAiThemeJob(jobId: string): Promise<void> {
    return this.jobService.cancelJob(jobId);
  }

  retryAiThemeJob(jobId: string): Promise<void> {
    return this.jobService.retryJob(jobId);
  }

  getAiThemeJob(jobId: string): Promise<AiThemeJob> {
    return this.jobService.getJob(jobId);
  }

  listAiThemeJobs(): Promise<AiThemeJobSummary[]> {
    return this.jobService.listJobs();
  }

  deleteAiThemeJob(jobId: string): Promise<void> {
    return this.jobService.deleteJob(jobId);
  }

  respondToCodexApproval(requestId: string, decision: CodexApprovalDecision): Promise<void> {
    return this.jobService.respondToApproval(requestId, decision);
  }

  /** Periodic driver (called from main): keeps status fresh and, when the
   * autoApply preference is on, restores the active theme onto a Codex
   * instance that came up without its debug port. Enabling autoApply in
   * Settings is the standing consent for the required Codex restart, so
   * applyTheme runs with confirmRestart here (DESIGN §3/§7).
   */
  async tick(): Promise<void> {
    await this.refreshStatus();
    if (!this.settings?.current.autoApply) {
      this.autoApplyRunningSince = null;
      return;
    }
    const { activeThemeId } = this.persisted;
    if (!activeThemeId || this.applying || this.watcher?.active) return;
    if (!this.install || !this.codexRunning || this.cdpHealthy) {
      this.autoApplyRunningSince = null;
      return;
    }
    if (Date.now() - this.lastAutoApplyAt < AUTO_APPLY_COOLDOWN_MS) return;

    // Let Codex settle for a couple of ticks before restarting it.
    if (!this.autoApplyRunningSince) {
      this.autoApplyRunningSince = Date.now();
      return;
    }
    if (Date.now() - this.autoApplyRunningSince < AUTO_APPLY_SETTLE_MS) return;

    this.lastAutoApplyAt = Date.now();
    this.autoApplyRunningSince = null;
    this.log("info", "检测到 Codex 未带调试端口启动,按偏好设置自动恢复主题…");
    const result = await this.applyTheme(activeThemeId, { confirmRestart: true });
    if (!result.ok) {
      this.log("warn", `自动应用失败(将在冷却期后重试):${result.error ?? "未知错误"}`);
    }
  }

  getState(): AppState {
    return {
      codexDesktop: {
        installed: Boolean(this.install),
        bundlePath: this.install?.bundle ?? null,
        version: this.install?.version ?? null,
        running: this.codexRunning,
        cdpPort: this.persisted.cdpPort,
        cdpHealthy: this.cdpHealthy,
      },
      codexCli: this.cliService.getStatus(),
      activeThemeId: this.persisted.activeThemeId,
      activeThemeName: this.persisted.activeThemeName,
      activeLayout: this.persisted.activeLayout,
      watcherActive: this.watcher?.active ?? false,
      applying: this.applying,
      lastError: this.lastError,
      engineVersion: SKIN_VERSION,
    };
  }

  /** Grace period for renderer shutdown before the process exits. */
  async shutdown(opts: { cleanup: boolean }): Promise<void> {
    if (this.watcher) {
      await this.watcher.stop({ cleanupSessions: opts.cleanup });
      this.watcher = null;
    }
    await this.jobService.shutdown();
    await this.cliService.disconnect();
  }

  // ----------------------------------------------------------------- apply

  async applyTheme(themeId: string, opts: { confirmRestart?: boolean } = {}): Promise<ApplyResult> {
    if (this.applying) {
      return this.result("failed", false, false, [], "另一个主题正在应用中,请稍候。");
    }
    this.applying = true;
    this.lastError = null;
    this.emitState();
    const notes: string[] = [];
    try {
      if (!this.install) this.install = await discoverCodexApp();
      if (!this.install) {
        return this.result("failed", false, false, notes, "未找到 Codex 桌面端(ChatGPT.app)。");
      }
      const dir = await this.store.resolveThemeDir(themeId);
      if (!dir) {
        return this.result("failed", false, false, notes, "主题不存在或已损坏。");
      }

      // 1) Make sure Codex is running with a verified loopback CDP port.
      let restarted = false;
      let port = this.persisted.cdpPort;
      if (port && (await verifiedCdpEndpoint(port, this.install.executable))) {
        this.log("info", `复用现有调试端口 ${port}。`);
      } else {
        const running = await codexIsRunning(this.install.executable);
        if (running && !opts.confirmRestart) {
          // UI must ask first — never restart the user's app silently.
          return this.result("failed", false, true, notes);
        }
        port = await selectAvailablePort(PREFERRED_CDP_PORT);
        if (running) {
          this.log("info", "正在退出 Codex(用户已授权重启)…");
          await stopCodex(this.install.executable, { force: true });
        }
        this.log("info", `以调试模式重启 Codex(端口 ${port})…`);
        await launchCodexWithCdp(this.install, port);
        await waitForCdp(port, this.install.executable);
        this.persisted.cdpPort = port;
        restarted = true;
      }
      this.cdpHealthy = true;
      this.codexRunning = true;

      // 2) Build the payload and (re)start the watcher on this port.
      let themeName: string;
      let themeLayout: LayoutKind | null = null;
      if (this.watcher?.active && this.persisted.activeThemeId !== themeId) {
        const { payload, theme } = await buildPayload(this.paths.injectDir, dir);
        await this.watcher.setPayload(payload);
        themeName = theme.name;
        themeLayout = theme.layout;
      } else if (!this.watcher?.active) {
        const started = await this.startWatcher(dir, port);
        themeName = started.name;
        themeLayout = started.layout;
      } else {
        themeName = this.persisted.activeThemeName ?? themeId;
        themeLayout = this.persisted.activeLayout;
      }

      // 3) Back up appearance keys exactly once; restore uses them.
      await backupAppearanceKeys(this.paths.codexConfigPath, this.paths.configBackupFile);

      // 4) Persist, then soft-verify against a live session.
      this.persisted.activeThemeId = themeId;
      this.persisted.activeThemeName = themeName;
      this.persisted.activeLayout = themeLayout;
      this.persisted.appliedAt = new Date().toISOString();
      await this.writePersisted();

      let status: ApplyStatus = "applied";
      try {
        const session = await this.watcher!.waitForSession(30_000);
        const verification = await waitForVerifiedSession(session, 15_000);
        if (!verification.pass) {
          status = "partial";
          notes.push("部分界面元素未完成验证(Codex 版本差异),主题可能部分生效。");
          if (verification.softNotes.projectButtonOptional) {
            notes.push("项目选择器未命中,这是已知的软性差异。");
          }
        }
      } catch (error) {
        status = "partial";
        notes.push(`验证未完全通过:${(error as Error).message}`);
      }

      this.log("info", `主题已应用(${status})。Codex 刷新或新开窗口会自动重新注入。`);
      return this.result(status, restarted, false, notes);
    } catch (error) {
      this.lastError = (error as Error).message;
      this.log("error", `应用主题失败:${this.lastError}`);
      return this.result("failed", false, false, notes, this.lastError);
    } finally {
      this.applying = false;
      this.emitState();
    }
  }

  // --------------------------------------------------------------- restore

  async restoreOfficial(): Promise<{ ok: boolean; error?: string }> {
    try {
      let cleaned = 0;
      if (this.watcher?.active) {
        cleaned = await this.watcher.cleanupAllSessions();
        await this.watcher.stop({ cleanupSessions: true });
        this.watcher = null;
      } else if (this.install && this.persisted.cdpPort) {
        // No watcher (fresh launch) — push cleanup once into live targets.
        try {
          const connected = await connectCodexTargets(this.persisted.cdpPort, 5_000);
          for (const { session } of connected) {
            if (await removeFromSession(session)) cleaned += 1;
            session.close();
          }
        } catch {
          // Codex not reachable — nothing to clean in the renderer.
        }
      }
      await restoreAppearanceKeys(this.paths.codexConfigPath, this.paths.configBackupFile);
      this.persisted.activeThemeId = null;
      this.persisted.activeThemeName = null;
      this.persisted.activeLayout = null;
      this.persisted.appliedAt = null;
      await this.writePersisted();
      this.log("info", `已还原官方外观(清理了 ${cleaned} 个窗口)。Codex 刷新后完全生效。`);
      this.emitState();
      return { ok: true };
    } catch (error) {
      const message = (error as Error).message;
      this.log("error", `还原失败:${message}`);
      return { ok: false, error: message };
    }
  }

  async openCodex(): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!this.install) this.install = await discoverCodexApp();
      if (!this.install) throw new Error("未找到 Codex 桌面端。");
      await launchCodexNormally(this.install.bundle);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------- intern

  private async startWatcher(themeDir: string, port: number): Promise<{ name: string; layout: LayoutKind }> {
    const { payload, theme } = await buildPayload(this.paths.injectDir, themeDir);
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }
    const watcher = new ThemeWatcher(port, payload);
    watcher.on("log", (level: LogLine["level"], message: string) => this.log(level, message));
    watcher.start();
    this.watcher = watcher;
    this.log("info", `注入守护已启动(端口 ${port},主题「${theme.name}」)。`);
    return { name: theme.name, layout: theme.layout };
  }

  private result(
    status: ApplyStatus,
    restarted: boolean,
    needsRestart: boolean,
    notes: string[],
    error?: string,
  ): ApplyResult {
    return { ok: status !== "failed", status, restarted, needsRestart, notes, error };
  }

  private emitState() {
    this.emit("stateChanged", this.getState());
  }

  private log(level: LogLine["level"], message: string) {
    const line: LogLine = { at: new Date().toISOString(), level, message };
    this.emit("log", line);
  }

  private async readPersisted(): Promise<PersistedState> {
    try {
      const raw = JSON.parse(await fs.readFile(this.paths.stateFile, "utf8"));
      return {
        activeThemeId: typeof raw?.activeThemeId === "string" ? raw.activeThemeId : null,
        activeThemeName: typeof raw?.activeThemeName === "string" ? raw.activeThemeName : null,
        activeLayout: typeof raw?.activeLayout === "string" ? raw.activeLayout : null,
        cdpPort: Number.isInteger(raw?.cdpPort) ? raw.cdpPort : null,
        appliedAt: typeof raw?.appliedAt === "string" ? raw.appliedAt : null,
      };
    } catch {
      return { ...EMPTY_PERSISTED };
    }
  }

  private async writePersisted(): Promise<void> {
    const temporary = `${this.paths.stateFile}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(this.persisted, null, 2)}\n`, "utf8");
    await fs.rename(temporary, this.paths.stateFile);
  }
}
