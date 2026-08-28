import { useApp } from "../store";

/** Titlebar mirror of the active theme and Codex connection state. */
export function StatusCard() {
  const state = useApp((s) => s.state);
  if (!state) return null;

  const themeConnected = state.watcherSessionCount > 0;
  const themeRow = state.activeThemeName
    ? { dot: themeConnected ? "ok" : "warn", text: state.activeThemeName }
    : { dot: "", text: "官方外观" };
  const watcherText = themeConnected
    ? `已注入 ${state.watcherSessionCount}`
    : state.watcherActive
      ? "等待注入"
      : "未守护";
  const codexRow = !state.codexDesktop.installed
    ? { dot: "err", text: "未安装 Codex" }
    : state.codexDesktop.cdpHealthy
      ? { dot: "ok", text: `调试端口 ${state.codexDesktop.cdpPort}` }
      : state.codexDesktop.running
        ? { dot: "warn", text: "运行中 · 无调试端口" }
        : { dot: "", text: "未运行" };

  return (
    <div className="status-card" aria-label="当前主题和 Codex 状态">
      <div className="status-row" title={`当前主题 · ${themeRow.text}`}>
        <span className={`dot ${themeRow.dot}`} />
        <span className="status-prefix">当前主题</span>
        <span className="grow" title={themeRow.text}>
          {themeRow.text}
        </span>
        {state.activeThemeName && <span className="status-watcher">{watcherText}</span>}
      </div>
      <span className="status-divider" aria-hidden="true" />
      <div className="status-row" title={`Codex · ${codexRow.text}`}>
        <span className={`dot ${codexRow.dot}`} />
        <span className="status-prefix">Codex</span>
        <span className="grow">{codexRow.text}</span>
      </div>
    </div>
  );
}
