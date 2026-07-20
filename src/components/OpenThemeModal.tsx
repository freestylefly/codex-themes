import { ExternalLink, Play } from "lucide-react";
import { useApp } from "../store";

/** Requires a second, explicit click before a website deep link applies a theme. */
export function OpenThemeModal() {
  const pendingId = useApp((state) => state.pendingWebThemeId);
  const themes = useApp((state) => state.themes);
  const confirm = useApp((state) => state.confirmWebTheme);
  const cancel = useApp((state) => state.cancelWebTheme);

  if (!pendingId) return null;
  const theme = themes.find((candidate) => candidate.id === pendingId);
  if (!theme) return null;

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div
        className="modal web-theme-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="web-theme-title"
        onClick={(event) => event.stopPropagation()}
      >
        <img className="web-theme-modal-preview" src={theme.previewUrl} alt="" />
        <div className="modal-title" id="web-theme-title">
          <ExternalLink size={17} />
          从官网打开主题
        </div>
        <div className="modal-body">
          是否将「{theme.name}」应用到 Codex？应用前仍会检查 Codex 的运行状态，
          如需重启会再次征求你的确认。
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={cancel}>
            暂不使用
          </button>
          <button className="btn btn-primary" onClick={() => void confirm()}>
            <Play size={13} />
            应用该主题
          </button>
        </div>
      </div>
    </div>
  );
}
