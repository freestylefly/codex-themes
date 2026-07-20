import { Check, Copy, Download, Loader2, Pencil, Play, Trash2 } from "lucide-react";
import type { ThemeSummary } from "../../electron/shared/types";
import { useApp } from "../store";
import { api } from "../api";

const SOURCE_LABEL = { preset: "预设", custom: "自定义", imported: "导入" } as const;

export function ThemeCard({ theme }: { theme: ThemeSummary }) {
  const state = useApp((s) => s.state);
  const applyingId = useApp((s) => s.applyingId);
  const apply = useApp((s) => s.apply);
  const refreshThemes = useApp((s) => s.refreshThemes);
  const toast = useApp((s) => s.toast);
  const editTheme = useApp((s) => s.editTheme);
  const duplicateAndEdit = useApp((s) => s.duplicateAndEdit);
  const pendingWebThemeId = useApp((s) => s.pendingWebThemeId);

  const isActive = state?.activeThemeId === theme.id;
  const isApplying = applyingId === theme.id;

  const onDelete = async () => {
    const result = await api.deleteTheme(theme.id);
    if (result.ok) {
      toast("ok", `已删除「${theme.name}」。`);
      await refreshThemes();
    } else {
      toast("err", `删除失败:${result.error}`);
    }
  };

  const onExport = async () => {
    const out = await api.exportThemePackage(theme.id);
    if (out) toast("ok", `已导出到 ${out}`);
  };


  return (
    <div
      className={`theme-card${isActive ? " active" : ""}${
        pendingWebThemeId === theme.id ? " web-target" : ""
      }`}
      data-theme-id={theme.id}
    >
      <div className="card-preview">
        <img src={theme.previewUrl} alt={theme.name} draggable={false} />
        {isActive && (
          <span className="active-ribbon">
            <Check size={11} strokeWidth={3} />
            使用中
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="card-title-row">
          <span className="card-name" title={theme.name}>
            {theme.name}
          </span>
          <span className={`badge badge-${theme.source}`}>{SOURCE_LABEL[theme.source]}</span>
        </div>
        <div className="card-meta">
          <span className="badge badge-layout">{theme.layout}</span>
          {theme.version && <span className="badge badge-version">v{theme.version}</span>}
          {theme.readOnly && <span className="badge badge-readonly">只读</span>}
          {!theme.valid && <span className="badge badge-warning">待校验</span>}
        </div>
        <div className="card-tagline">{theme.tagline}</div>
        <div className="card-footer">
          {isActive ? (
            <span className="btn-active">
              <Check size={13} strokeWidth={2.5} />
              当前主题
            </span>
          ) : (
            <button
              className="btn btn-primary"
              disabled={Boolean(applyingId) || !state?.codexDesktop.installed}
              onClick={() => void apply(theme.id)}
              title={state?.codexDesktop.installed ? "应用到 Codex" : "未检测到 Codex"}
            >
              {isApplying ? (
                <Loader2 size={13} className="spin" />
              ) : (
                <Play size={13} strokeWidth={2.5} />
              )}
              应用
            </button>
          )}
          {theme.source === "custom" && (
            <button className="btn btn-ghost btn-icon" title="编辑" onClick={() => void editTheme(theme.id)}>
              <Pencil size={14} />
            </button>
          )}
          <button className="btn btn-ghost btn-icon" title="复制并编辑" onClick={() => void duplicateAndEdit(theme.id)}>
            <Copy size={14} />
          </button>
          {theme.source !== "preset" && (
            <>
              <button className="btn btn-ghost btn-icon" title="导出主题包" onClick={() => void onExport()}>
                <Download size={14} />
              </button>
              <button
                className="btn btn-ghost btn-icon btn-danger"
                title="删除主题"
                onClick={() => void onDelete()}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
