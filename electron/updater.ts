/**
 * Auto-update wiring (M4). Only runs in packaged builds; in dev it is a
 * no-op. Checks once shortly after launch and then periodically, downloads
 * silently, and asks before restarting to install. macOS auto-update
 * requires a signed build — on unsigned DMGs the check simply logs a
 * warning and stays out of the way.
 */

import { app, dialog, type BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import type { LogLine } from "./shared/types";

const { autoUpdater } = electronUpdater;

/** Check again every 4 hours in long-running tray sessions. */
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

type Logger = (level: LogLine["level"], message: string) => void;

export function initAutoUpdater(getWindow: () => BrowserWindow | null, log: Logger): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => log("info", "正在检查应用更新…"));
  autoUpdater.on("update-available", (info) =>
    log("info", `发现新版本 v${info.version},开始后台下载。`),
  );
  autoUpdater.on("update-not-available", () => log("info", "已是最新版本。"));
  autoUpdater.on("error", (error) => {
    log("warn", `自动更新检查失败:${error.message}`);
  });
  autoUpdater.on("update-downloaded", (info) => {
    log("info", `新版本 v${info.version} 已下载完成。`);
    const win = getWindow();
    const options = {
      type: "info" as const,
      title: "更新已就绪",
      message: `Codex Themes v${info.version} 已下载完成`,
      detail: "重启应用即可完成更新。重启不会影响已在 Codex 中生效的主题。",
      buttons: ["立即重启", "稍后"],
      defaultId: 0,
      cancelId: 1,
    };
    const prompt = win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
    void prompt.then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((error: Error) => {
      log("warn", `自动更新检查失败:${error.message}`);
    });
  };

  // Give the app a moment to finish booting before the first check.
  setTimeout(check, 15_000);
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}
