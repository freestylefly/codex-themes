import { useApp } from "../store";

/** Sidebar footer: live mirror of Codex + theme state. */
export function StatusCard() {
  const state = useApp((s) => s.state);
  if (!state) return null;

  const themeRow = state.activeThemeName
    ? { dot: "ok", text: state.activeThemeName }
    : { dot: "", text: "官方外观" };
  const codexRow = !state.codexDesktop.installed
    ? { dot: "err", text: "未安装 Codex" }
    : state.codexDesktop.cdpHealthy
      ? { dot: "ok", text: `调试端口 ${state.codexDesktop.cdpPort}` }
      : state.codexDesktop.running
        ? { dot: "warn", text: "运行中 · 无调试端口" }
        : { dot: "", text: "未运行" };

  return (
    <div className="status-card">
      <div className="status-row">
        <span className={`dot ${themeRow.dot}`} />
        <span className="grow" title={themeRow.text}>
          {themeRow.text}
        </span>
        {state.watcherActive && <span style={{ color: "var(--text-faint)", fontSize: 10.5 }}>守护中</span>}
      </div>
      <div className="status-row">
        <span className={`dot ${codexRow.dot}`} />
        <span className="grow">Codex · {codexRow.text}</span>
      </div>
    </div>
  );
}
