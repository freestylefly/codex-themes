import { Check, Coins, Copy, CreditCard, Download, Loader2, Lock, Maximize2, Pencil, Play, Store, Trash2, Users } from "lucide-react";
import type { CommerceThemeSummary } from "../../electron/shared/types";
import { useApp } from "../store";
import { api } from "../api";

const SOURCE_LABEL = { preset: "预设", custom: "自定义", imported: "导入", purchased: "已购" } as const;

interface ThemeCardProps {
  theme: CommerceThemeSummary;
  isPurchasing?: boolean;
  onPreview(theme: CommerceThemeSummary): void;
  onPurchase?(): void;
  onAlipay?(): void;
  onDownload?(): void;
}

export function ThemeCard({
  theme,
  isPurchasing,
  onPreview,
  onPurchase,
  onAlipay,
  onDownload,
}: ThemeCardProps) {
  const state = useApp((s) => s.state);
  const applyingId = useApp((s) => s.applyingId);
  const apply = useApp((s) => s.apply);
  const refreshThemes = useApp((s) => s.refreshThemes);
  const toast = useApp((s) => s.toast);
  const editTheme = useApp((s) => s.editTheme);
  const duplicateAndEdit = useApp((s) => s.duplicateAndEdit);
  const pendingWebThemeId = useApp((s) => s.pendingWebThemeId);
  const setPage = useApp((s) => s.setPage);

  const isActive = state?.activeThemeId === theme.id;
  const isApplying = applyingId === theme.id;
  const isOwned = Boolean(theme.entitlement);
  const isMarketplace = Boolean(theme.product);
  const requiresPoints = (theme.product?.pricePoints ?? 0) > 0;
  const isInstalled = isMarketplace
    ? theme.local?.source === "purchased"
    : Boolean(theme.local);
  const isLimitedEdition = theme.id === "moonlit-immortal";
  const isPopular = theme.id === "blue-window-messenger";
  const hasUpdate = isInstalled && theme.local && theme.product && theme.local.version !== theme.product.version;
  const catalogOnly = theme.catalogOnly && !isOwned;

  const onDelete = async () => {
    if (!theme.local) return;
    const result = await api.deleteTheme(theme.id);
    if (result.ok) {
      toast("ok", `已删除「${theme.name}」。`);
      await refreshThemes();
    } else {
      toast("err", `删除失败:${result.error}`);
    }
  };

  const onExport = async () => {
    if (!theme.local) return;
    const out = await api.exportThemePackage(theme.id);
    if (out) toast("ok", `已导出到 ${out}`);
  };

  const actionButton = () => {
    if (isActive) {
      return (
        <span className="btn-active">
          <Check size={13} strokeWidth={2.5} />
          当前主题
        </span>
      );
    }

    if (isOwned && !isInstalled) {
      return (
        <button className="btn btn-primary" onClick={() => onDownload?.()}>
          <Download size={13} strokeWidth={2.5} />
          下载主题
        </button>
      );
    }

    if (!isOwned && (isMarketplace || catalogOnly)) {
      return (
        <div className="marketplace-actions">
          <button
            className="btn btn-primary"
            disabled={Boolean(isPurchasing)}
            onClick={() => onPurchase?.()}
          >
            {isPurchasing ? <Loader2 size={13} className="spin" /> : <Coins size={13} strokeWidth={2.5} />}
            {theme.product?.pricePoints ? `${theme.product.pricePoints} 积分` : "免费解锁"}
          </button>
          {theme.product && theme.product.priceCents > 0 && (
            <button
              className="btn btn-secondary"
              disabled={Boolean(isPurchasing)}
              onClick={() => onAlipay?.()}
            >
              <CreditCard size={13} />
              支付宝 ¥{(theme.product.priceCents / 100).toFixed(2)}
            </button>
          )}
        </div>
      );
    }

    return (
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
        {hasUpdate ? "更新后应用" : "应用"}
      </button>
    );
  };

  return (
    <div
      className={`theme-card${isActive ? " active" : ""}${
        pendingWebThemeId === theme.id ? " web-target" : ""
      }`}
      data-theme-id={theme.id}
    >
      <button
        type="button"
        className="card-preview"
        onClick={() => onPreview(theme)}
        aria-label={`放大查看${theme.name}`}
      >
        <img src={theme.previewUrl} alt={theme.name} draggable={false} />
        <span className="card-preview-expand" aria-hidden="true">
          <Maximize2 size={14} />
          放大查看
        </span>
        {isActive && (
          <span className="active-ribbon">
            <Check size={11} strokeWidth={3} />
            使用中
          </span>
        )}
        {!isActive && isOwned && (
          <span className="owned-ribbon">
            <Check size={11} strokeWidth={3} />
            已购
          </span>
        )}
        {(isLimitedEdition || isPopular || (requiresPoints && !isOwned)) && (
          <span className="card-preview-badges" aria-hidden="true">
            {isLimitedEdition && <span className="limited-ribbon">限定款</span>}
            {isPopular && <span className="popular-ribbon">热门</span>}
            {requiresPoints && !isOwned && (
              <span className="paid-ribbon">
                <Lock size={10} />
                {theme.product?.pricePoints} 积分
              </span>
            )}
          </span>
        )}
      </button>
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
        {theme.product?.origin === "community" && (
          <div className="card-community-meta">
            <span>@{theme.product.author?.handle ?? "creator"}</span>
            <span><Users size={11} /> {theme.product.unlockCount} 人使用</span>
          </div>
        )}
        <div className="card-footer">
          {actionButton()}
          {theme.source === "custom" && theme.local && (
            <>
              <button className="btn btn-ghost btn-icon" title="编辑" onClick={() => void editTheme(theme.id)}>
                <Pencil size={14} />
              </button>
              <button className="btn btn-ghost btn-icon" title="发布到广场" onClick={() => setPage("creator")}>
                <Store size={14} />
              </button>
            </>
          )}
          {theme.source !== "preset" && theme.source !== "purchased" && theme.local && (
            <>
              <button className="btn btn-ghost btn-icon" title="复制并编辑" onClick={() => void duplicateAndEdit(theme.id)}>
                <Copy size={14} />
              </button>
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
