import { FolderOpen, RotateCcw, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeCard } from "../components/ThemeCard";
import { ImportPreviewModal } from "../components/ImportPreviewModal";
import { useApp } from "../store";
import { api } from "../api";
import type { InspectedThemePackage } from "../../electron/shared/types";

export function Gallery() {
  const themes = useApp((s) => s.themes);
  const state = useApp((s) => s.state);
  const refreshThemes = useApp((s) => s.refreshThemes);
  const toast = useApp((s) => s.toast);
  const restore = useApp((s) => s.restore);
  const apply = useApp((s) => s.apply);
  const pendingWebThemeId = useApp((s) => s.pendingWebThemeId);

  const [inspection, setInspection] = useState<InspectedThemePackage | null>(null);

  useEffect(() => {
    if (!pendingWebThemeId) return;
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-theme-id="${CSS.escape(pendingWebThemeId)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [pendingWebThemeId]);

  const closeInspection = () => {
    if (inspection) void api.discardInspection(inspection.tempDir).catch(() => {});
    setInspection(null);
  };

  const presets = themes.filter((t) => t.source === "preset");
  const mine = themes.filter((t) => t.source === "custom");
  const imported = themes.filter((t) => t.source === "imported");

  const onImport = async () => {
    try {
      const inspected = await api.inspectThemePackage();
      if (inspected) setInspection(inspected);
    } catch (error) {
      toast("err", `读取包失败:${(error as Error).message}`);
    }
  };

  const handleImport = async () => {
    if (!inspection) return;
    try {
      const installed = await api.importInspectedTheme(inspection);
      setInspection(null);
      await refreshThemes();
      toast("ok", `已导入「${installed.name}」。`);
      void apply(installed.id);
    } catch (error) {
      toast("err", `导入失败:${(error as Error).message}`);
    }
  };

  const handleInstallAsCopy = async () => {
    if (!inspection) return;
    try {
      const installed = await api.importInspectedTheme(inspection, {
        newId: `${inspection.summary.id}-import-${Date.now()}`,
      });
      setInspection(null);
      await refreshThemes();
      toast("ok", `已安装为副本「${installed.name}」。`);
    } catch (error) {
      toast("err", `安装失败:${(error as Error).message}`);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">主题画廊</h1>
          <p className="page-sub">
            {state?.activeThemeName
              ? `当前主题:${state.activeThemeName}${state.activeLayout ? ` · ${state.activeLayout}` : ""}`
              : "选择一款主题,一键让 Codex 变身。"}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => void onImport()}>
            <Upload size={14} />
            导入主题包
          </button>
          <button className="btn" onClick={() => void api.openCodex()}>
            <FolderOpen size={14} />
            打开 Codex
          </button>
          {state?.activeThemeId && (
            <button className="btn" onClick={() => void restore()}>
              <RotateCcw size={14} />
              还原官方外观
            </button>
          )}
        </div>
      </div>

      <div className="section-label">内置预设</div>
      <div className="theme-grid">
        {presets.map((theme) => (
          <ThemeCard theme={theme} key={theme.id} />
        ))}
      </div>

      {mine.length > 0 && (
        <>
          <div className="section-label">我的主题</div>
          <div className="theme-grid">
            {mine.map((theme) => (
              <ThemeCard theme={theme} key={theme.id} />
            ))}
          </div>
        </>
      )}

      {imported.length > 0 && (
        <>
          <div className="section-label">已导入</div>
          <div className="theme-grid">
            {imported.map((theme) => (
              <ThemeCard theme={theme} key={theme.id} />
            ))}
          </div>
        </>
      )}

      {inspection && (
        <ImportPreviewModal
          inspection={inspection}
          onClose={closeInspection}
          onImport={handleImport}
          onInstallAsCopy={handleInstallAsCopy}
        />
      )}
    </div>
  );
}
