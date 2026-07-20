import { TriangleAlert } from "lucide-react";
import { useApp } from "../store";

/** Shown when Codex runs without CDP — restarting needs explicit consent. */
export function ConfirmRestartModal() {
  const pendingId = useApp((s) => s.pendingRestartThemeId);
  const confirm = useApp((s) => s.confirmRestartAndApply);
  const cancel = useApp((s) => s.cancelRestart);
  const themes = useApp((s) => s.themes);
  if (!pendingId) return null;
  const name = themes.find((t) => t.id === pendingId)?.name ?? pendingId;

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <TriangleAlert size={17} style={{ color: "var(--warn)" }} />
          需要重启 Codex
        </div>
        <div className="modal-body">
          应用「{name}」需要 Codex 以调试模式运行。Codex 当前已在运行,
          将被退出并立即自动重启;未保存的会话状态可能丢失。之后再次切换主题无需重启。
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={cancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void confirm()}>
            重启并应用
          </button>
        </div>
      </div>
    </div>
  );
}
