/**
 * [INPUT]: 依赖 Electron Tray/Menu、AppState 与 ThemeController 操作
 * [OUTPUT]: 提供跨平台托盘生命周期、状态菜单、打开窗口与退出动作
 * [POS]: Electron 常驻入口，在隐藏启动和主窗口关闭后维持应用可达
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Menu, Tray, nativeImage } from "electron";
import type { AppState } from "./shared/types";
import type { ThemeController } from "./controller";

export class AppTray {
  private tray: Tray;
  private state: AppState;

  constructor(
    iconPath: string,
    private controller: ThemeController,
    private showWindow: () => void,
    private quit: () => void,
  ) {
    const image = nativeImage.createFromPath(iconPath);
    if (process.platform === "darwin") image.setTemplateImage(true);
    this.tray = new Tray(image);
    this.tray.setToolTip("Codex Themes");
    this.state = controller.getState();
    this.controller.on("stateChanged", (state: AppState) => {
      this.state = state;
      this.rebuild();
    });
    this.tray.on("click", () => this.showWindow());
    this.rebuild();
  }

  private rebuild(): void {
    const active = this.state.activeThemeName;
    const statusLabel = this.state.applying
      ? "正在应用主题…"
      : active
        ? `主题已激活:${active}`
        : "官方外观(未应用主题)";
    const codexLabel = !this.state.codexDesktop.installed
      ? "未安装 Codex"
      : this.state.codexDesktop.cdpHealthy
        ? `调试端口 ${this.state.codexDesktop.cdpPort}(健康)`
        : this.state.codexDesktop.running
          ? "运行中(无调试端口)"
          : "未运行";

    const menu = Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { label: `Codex:${codexLabel}`, enabled: false },
      { type: "separator" },
      { label: "显示主窗口", click: () => this.showWindow() },
      { label: "打开 Codex", click: () => void this.controller.openCodex() },
      {
        label: "还原官方外观",
        enabled: Boolean(active),
        click: () => void this.controller.restoreOfficial(),
      },
      { type: "separator" },
      { label: "退出 Codex Themes", click: () => this.quit() },
    ]);
    this.tray.setContextMenu(menu);
  }
}
