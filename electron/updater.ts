/**
 * User-driven application updates.
 *
 * Packaged builds check GitHub shortly after launch and every four hours.
 * Finding an update only announces it to the renderer; downloading and
 * installing always require explicit user actions in the update dialog.
 */

import { app, shell, type BrowserWindow } from "electron";
import { EventEmitter } from "node:events";
import electronUpdater from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";
import type { AppUpdateState, LogLine } from "./shared/types";
import {
  normalizeReleaseNotes,
  releaseUrlForVersion,
} from "./updater-state";

const { autoUpdater } = electronUpdater;

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FIRST_UPDATE_CHECK_DELAY_MS = 5_000;
const LATEST_RELEASE_URL =
  "https://github.com/freestylefly/codex-themes/releases/latest";
const LATEST_DMG_URL =
  "https://theme.codexguide.ai/api/v1/downloads/latest?format=dmg";

type Logger = (level: LogLine["level"], message: string) => void;

function initialState(): AppUpdateState {
  return {
    status: app.isPackaged ? "idle" : "disabled",
    currentVersion: app.getVersion(),
    availableVersion: null,
    releaseName: null,
    releaseNotes: null,
    releaseDate: null,
    releaseUrl: null,
    progressPercent: null,
    transferredBytes: null,
    totalBytes: null,
    bytesPerSecond: null,
    error: null,
  };
}

function availableState(
  current: AppUpdateState,
  info: UpdateInfo,
): AppUpdateState {
  return {
    ...current,
    status: "available",
    availableVersion: info.version,
    releaseName: info.releaseName ?? `Codex Themes v${info.version}`,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseDate: info.releaseDate || null,
    releaseUrl: releaseUrlForVersion(info.version),
    progressPercent: null,
    transferredBytes: null,
    totalBytes: null,
    bytesPerSecond: null,
    error: null,
  };
}

export class AppUpdaterService extends EventEmitter {
  private state = initialState();
  private started = false;
  private checking = false;
  private downloading = false;
  private checkTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly log: Logger,
  ) {
    super();
  }

  getState(): AppUpdateState {
    return { ...this.state };
  }

  start(): void {
    if (this.started || !app.isPackaged) return;
    this.started = true;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.fullChangelog = false;

    autoUpdater.on("checking-for-update", () => {
      this.log("info", "正在检查应用更新…");
      this.patchState({ status: "checking", error: null });
    });
    autoUpdater.on("update-available", (info) => {
      this.log("info", `发现新版本 v${info.version}。`);
      this.setState(availableState(this.state, info));
      void this.hydrateGitHubRelease(info.version);
    });
    autoUpdater.on("update-not-available", () => {
      this.log("info", "已是最新版本。");
      this.patchState({
        status: "idle",
        availableVersion: null,
        releaseName: null,
        releaseNotes: null,
        releaseDate: null,
        releaseUrl: null,
        progressPercent: null,
        transferredBytes: null,
        totalBytes: null,
        bytesPerSecond: null,
        error: null,
      });
    });
    autoUpdater.on("download-progress", (progress) => {
      this.patchState(this.progressState(progress));
    });
    autoUpdater.on("update-downloaded", (info) => {
      this.downloading = false;
      this.log("info", `新版本 v${info.version} 已下载完成,等待用户安装。`);
      this.patchState({
        status: "downloaded",
        availableVersion: info.version,
        progressPercent: 100,
        transferredBytes: this.state.totalBytes,
        error: null,
      });
      this.showWindow();
    });
    autoUpdater.on("error", (error) => {
      this.downloading = false;
      this.log("warn", `自动更新失败:${error.message}`);
      this.patchState({
        status: "error",
        error:
          "自动更新暂时无法完成。你可以重试，或直接下载最新版 DMG 安装包。",
      });
      if (this.state.availableVersion) this.showWindow();
    });

    this.checkTimer = setTimeout(() => {
      void this.checkForUpdates();
    }, FIRST_UPDATE_CHECK_DELAY_MS);
    this.intervalTimer = setInterval(() => {
      void this.checkForUpdates();
    }, UPDATE_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.checkTimer) clearTimeout(this.checkTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.checkTimer = null;
    this.intervalTimer = null;
  }

  async checkForUpdates(): Promise<AppUpdateState> {
    if (!app.isPackaged || this.checking || this.downloading) return this.getState();
    this.checking = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      const message = (error as Error).message;
      this.log("warn", `自动更新检查失败:${message}`);
      this.patchState({
        status: "error",
        error: this.state.availableVersion
          ? "检查更新失败。可以重试，或直接下载最新版 DMG。"
          : "检查更新失败，请稍后重试。",
      });
    } finally {
      this.checking = false;
    }
    return this.getState();
  }

  async downloadUpdate(): Promise<AppUpdateState> {
    if (!app.isPackaged || this.downloading) return this.getState();
    if (!this.state.availableVersion) {
      return this.checkForUpdates();
    }
    if (this.state.status === "downloaded") return this.getState();

    this.downloading = true;
    this.patchState({
      status: "downloading",
      progressPercent: 0,
      transferredBytes: 0,
      totalBytes: null,
      bytesPerSecond: null,
      error: null,
    });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      const message = (error as Error).message;
      this.log("warn", `下载应用更新失败:${message}`);
      this.patchState({
        status: "error",
        error:
          "自动下载失败。可以重试，或直接下载最新版 DMG 安装包。",
      });
    } finally {
      this.downloading = false;
    }
    return this.getState();
  }

  installUpdate(): { ok: boolean; error?: string } {
    if (this.state.status !== "downloaded") {
      return { ok: false, error: "更新尚未下载完成。" };
    }
    this.log("info", `正在安装 Codex Themes v${this.state.availableVersion}。`);
    autoUpdater.quitAndInstall();
    return { ok: true };
  }

  async openReleasePage(): Promise<void> {
    await shell.openExternal(this.state.releaseUrl ?? LATEST_RELEASE_URL);
  }

  async openManualDownload(): Promise<void> {
    await shell.openExternal(LATEST_DMG_URL);
  }

  private progressState(progress: ProgressInfo): Partial<AppUpdateState> {
    return {
      status: "downloading",
      progressPercent: Math.max(0, Math.min(100, progress.percent)),
      transferredBytes: progress.transferred,
      totalBytes: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
      error: null,
    };
  }

  private async hydrateGitHubRelease(version: string): Promise<void> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/freestylefly/codex-themes/releases/tags/v${encodeURIComponent(version)}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "codex-themes-app-updater",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );
      if (!response.ok) return;
      const release = await response.json() as {
        body?: unknown;
        html_url?: unknown;
        name?: unknown;
        published_at?: unknown;
      };
      if (this.state.availableVersion !== version) return;
      this.patchState({
        releaseName:
          typeof release.name === "string" ? release.name : this.state.releaseName,
        releaseNotes:
          typeof release.body === "string" && release.body.trim()
            ? release.body.trim()
            : this.state.releaseNotes,
        releaseDate:
          typeof release.published_at === "string"
            ? release.published_at
            : this.state.releaseDate,
        releaseUrl:
          typeof release.html_url === "string"
            ? release.html_url
            : this.state.releaseUrl,
      });
    } catch {
      // electron-updater release data remains available as the fallback.
    }
  }

  private showWindow(): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  private setState(next: AppUpdateState): void {
    this.state = next;
    this.emit("stateChanged", this.getState());
  }

  private patchState(patch: Partial<AppUpdateState>): void {
    this.setState({ ...this.state, ...patch });
  }
}

export function initAutoUpdater(
  getWindow: () => BrowserWindow | null,
  log: Logger,
): AppUpdaterService {
  const updater = new AppUpdaterService(getWindow, log);
  updater.start();
  return updater;
}
