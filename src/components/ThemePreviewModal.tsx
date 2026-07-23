import { Check, Coins, CreditCard, Loader2, Play, Download, X } from "lucide-react";
import { useEffect } from "react";
import type { CommerceThemeSummary } from "../../electron/shared/types";
import { useApp } from "../store";

const SOURCE_LABEL = { preset: "内置预设", custom: "我的主题", imported: "已导入", purchased: "已购主题" } as const;

interface ThemePreviewModalProps {
  theme: CommerceThemeSummary;
  onClose(): void;
  onPurchase?(): void;
  onAlipay?(): void;
  onDownload?(): void;
}

export function ThemePreviewModal({ theme, onClose, onPurchase, onAlipay, onDownload }: ThemePreviewModalProps) {
  const state = useApp((s) => s.state);
  const applyingId = useApp((s) => s.applyingId);
  const apply = useApp((s) => s.apply);
  const isActive = state?.activeThemeId === theme.id;
  const isApplying = applyingId === theme.id;
  const isOwned = Boolean(theme.entitlement);
  const isPaid = Boolean(theme.product);
  const isInstalled = Boolean(theme.local);
  const hasUpdate = isInstalled && theme.local && theme.product && theme.local.version !== theme.product.version;
  const catalogOnly = theme.catalogOnly && !isOwned;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const applyTheme = () => {
    onClose();
    void apply(theme.id);
  };

  return (
    <div className="modal-backdrop theme-preview-backdrop" onMouseDown={onClose}>
      <section
        className="theme-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="theme-preview-modal__header">
          <div>
            <span>{SOURCE_LABEL[theme.source]}</span>
            <h2 id="theme-preview-title">{theme.name}</h2>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="关闭主题大图预览" autoFocus>
            <X size={17} />
          </button>
        </header>

        <div className="theme-preview-modal__stage">
          <img src={theme.previewUrl} alt={`${theme.name}主题大图预览`} draggable={false} />
        </div>

        <div className="theme-preview-modal__details">
          <div className="theme-preview-modal__copy">
            <strong>{theme.tagline}</strong>
            {theme.description && <p>{theme.description}</p>}
          </div>
          <div className="theme-preview-modal__badges" aria-label="主题信息">
            <span className="badge badge-layout">{theme.layout}</span>
            {theme.version && <span className="badge badge-version">v{theme.version}</span>}
            {theme.readOnly && <span className="badge badge-readonly">只读</span>}
            {isPaid && !isOwned && theme.product && (
              <span className="badge badge-paid">
                {theme.product.pricePoints > 0 ? `${theme.product.pricePoints} 积分` : "免费"}
              </span>
            )}
            {catalogOnly && !theme.product && (
              <span className="badge badge-paid">付费</span>
            )}
          </div>
        </div>

        <footer className="theme-preview-modal__footer">
          <button type="button" className="btn" onClick={onClose}>关闭</button>
          {isActive ? (
            <span className="btn-active">
              <Check size={13} strokeWidth={2.5} />当前主题
            </span>
          ) : isPaid && !isOwned ? (
            <div className="marketplace-actions">
              <button type="button" className="btn btn-primary" onClick={() => {
                onClose();
                onPurchase?.();
              }}>
                <Coins size={14} strokeWidth={2.5} />
                {theme.product?.pricePoints ? `${theme.product.pricePoints} 积分解锁` : "免费解锁"}
              </button>
              {theme.product && theme.product.priceCents > 0 && (
                <button type="button" className="btn btn-secondary" onClick={() => {
                  onClose();
                  onAlipay?.();
                }}>
                  <CreditCard size={14} />
                  支付宝 ¥{(theme.product.priceCents / 100).toFixed(2)}
                </button>
              )}
            </div>
          ) : catalogOnly ? (
            <button type="button" className="btn btn-primary" onClick={() => {
              onClose();
              onPurchase?.();
            }}>
              <Coins size={14} strokeWidth={2.5} />
              解锁
            </button>
          ) : isOwned && !isInstalled ? (
            <button type="button" className="btn btn-primary" onClick={() => {
              onClose();
              onDownload?.();
            }}>
              <Download size={14} strokeWidth={2.5} />
              下载主题
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(applyingId) || !state?.codexDesktop.installed}
              onClick={applyTheme}
              title={state?.codexDesktop.installed ? "应用到 Codex" : "未检测到 Codex"}
            >
              {isApplying ? <Loader2 size={14} className="spin" /> : <Play size={14} strokeWidth={2.5} />}
              {hasUpdate ? "更新后应用" : "应用该主题"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
