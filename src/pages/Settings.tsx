import { FolderOpen, RefreshCw, RotateCcw, ShieldAlert, Terminal } from "lucide-react";
import { api } from "../api";
import { useApp } from "../store";

export function Settings() {
  const state = useApp((s) => s.state);
  const settings = useApp((s) => s.settings);
  const logs = useApp((s) => s.logs);
  const restore = useApp((s) => s.restore);
  const updateSettings = useApp((s) => s.updateSettings);

  if (!state) return null;

  const cli = state.codexCli;
  const cliStatusText = !cli.installed
    ? "未安装"
    : !cli.supported
      ? `版本过低 (${cli.version ?? "unknown"})`
      : cli.appServerRunning
        ? cli.authenticated
          ? `已登录 · ${cli.authMode ?? "未知账号"} · 图片生成 ${cli.imageGeneration ? "可用" : "不可用"}`
          : "未登录"
        : cli.error ?? "App Server 未运行";

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-sub">运行状态、安全说明与应用偏好。</p>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Codex 桌面端</div>
        <div className="kv-row">
          <span className="kv-key">安装</span>
          <span className={`kv-value${state.codexDesktop.installed ? "" : " faint"}`}>
            {state.codexDesktop.installed
              ? `${state.codexDesktop.bundlePath}(v${state.codexDesktop.version})`
              : "未检测到 ChatGPT.app(bundle id com.openai.codex)"}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-key">运行状态</span>
          <span className="kv-value">{state.codexDesktop.running ? "运行中" : "未运行"}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">调试端口</span>
          <span className={`kv-value${state.codexDesktop.cdpPort ? " mono" : " faint"}`}>
            {state.codexDesktop.cdpPort
              ? `127.0.0.1:${state.codexDesktop.cdpPort}(${state.codexDesktop.cdpHealthy ? "健康" : "未就绪"})`
              : "尚未开启"}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-key">注入守护</span>
          <span className="kv-value">
            {state.watcherActive ? "运行中(刷新/新窗口自动重注入)" : "未运行"}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-key">引擎版本</span>
          <span className="kv-value mono">{state.engineVersion}</span>
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => void api.openCodex()}>
            <FolderOpen size={14} />
            打开 Codex
          </button>
          <button className="btn" disabled={!state.activeThemeId} onClick={() => void restore()}>
            <RotateCcw size={14} />
            还原官方外观
          </button>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Codex CLI / AI 主题</div>
        <div className="kv-row">
          <span className="kv-key">CLI 路径</span>
          <span className={`kv-value${cli.executablePath ? " mono" : " faint"}`}>
            {cli.executablePath ?? "自动探测"}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-key">CLI 版本</span>
          <span className="kv-value">{cli.version ?? "-"}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">AI 状态</span>
          <span className={`kv-value${cli.error ? " faint" : ""}`}>{cliStatusText}</span>
        </div>
        {cli.error && (
          <div className="kv-row">
            <span className="kv-key">提示</span>
            <span className="kv-value faint">{cli.error}</span>
          </div>
        )}
        <div className="row-actions">
          <button className="btn" onClick={() => void api.selectCodexCli()}>
            <Terminal size={14} />
            选择 Codex CLI
          </button>
          <button className="btn" onClick={() => void api.refreshCodexCliStatus()}>
            <RefreshCw size={14} />
            重新检测
          </button>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">偏好</div>
        <div className="kv-row">
          <span className="kv-key">开机自动启动</span>
          <span className="kv-value faint">登录 macOS 后常驻菜单栏</span>
          <button
            className={`toggle${settings?.launchAtLogin ? " on" : ""}`}
            onClick={() => void updateSettings({ launchAtLogin: !settings?.launchAtLogin })}
            aria-label="开机自动启动"
          />
        </div>
        <div className="kv-row">
          <span className="kv-key">Codex 启动自动应用</span>
          <span className="kv-value faint">检测到 Codex 以普通模式启动时自动恢复当前主题</span>
          <button
            className={`toggle${settings?.autoApply ? " on" : ""}`}
            disabled={!state.activeThemeId && !settings?.autoApply}
            onClick={() => void updateSettings({ autoApply: !settings?.autoApply })}
            aria-label="Codex 启动自动应用"
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">安全说明</div>
        <div className="note-block" style={{ borderTop: 0 }}>
          <ShieldAlert size={16} />
          <div>
            本应用通过 Chrome DevTools Protocol(CDP)向本机 Codex 注入装饰层,不修改
            Codex 安装包、代码签名或任何 API Key。调试端口仅监听 127.0.0.1,且应用会校验
            端口进程必须属于 Codex 本身才连接。端口开启期间,本机其他程序理论上可访问该
            调试接口;不使用主题时可「还原官方外观」并重启 Codex 关闭端口。
          </div>
        </div>
        <div className="note-block">
          <ShieldAlert size={16} />
          <div>
            主题为纯视觉装饰(pointer-events: none),不影响 Codex 原生交互;还原会同时恢复
            ~/.codex/config.toml 中被备份的外观键。退出本应用后,主题保留到 Codex 下次刷新。
          </div>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="settings-group">
          <div className="settings-group-title">运行日志</div>
          <div className="log-list">
            {[...logs].reverse().map((line, i) => (
              <div className={`log-line ${line.level}`} key={i}>
                <span className="log-time mono">{line.at.slice(11, 19)}</span>
                <span>{line.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
