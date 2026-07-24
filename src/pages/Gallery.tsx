import { FolderOpen, RotateCcw, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ThemeCard } from "../components/ThemeCard";
import { ImportPreviewModal } from "../components/ImportPreviewModal";
import { ThemePreviewModal } from "../components/ThemePreviewModal";
import { useApp } from "../store";
import { api } from "../api";
import { mergeGalleryThemes } from "../galleryThemes";
import type {
  CommerceThemeSummary,
  InspectedThemePackage,
} from "../../electron/shared/types";

type FilterTab = "official" | "community" | "owned" | "local";

const FILTER_LABELS: Record<FilterTab, string> = {
  official: "官方精选",
  community: "社区广场",
  owned: "已拥有",
  local: "本地作品",
};

export function Gallery() {
  const themes = useApp((s) => s.themes);
  const catalog = useApp((s) => s.catalog);
  const entitlements = useApp((s) => s.entitlements);
  const auth = useApp((s) => s.auth);
  const state = useApp((s) => s.state);
  const refreshThemes = useApp((s) => s.refreshThemes);
  const refreshCatalog = useApp((s) => s.refreshCatalog);
  const refreshEntitlements = useApp((s) => s.refreshEntitlements);
  const toast = useApp((s) => s.toast);
  const restore = useApp((s) => s.restore);
  const apply = useApp((s) => s.apply);
  const purchaseTheme = useApp((s) => s.purchaseTheme);
  const unlockTheme = useApp((s) => s.unlockTheme);
  const downloadPurchasedTheme = useApp((s) => s.downloadPurchasedTheme);
  const purchasingThemeId = useApp((s) => s.purchasingThemeId);
  const pendingOrderId = useApp((s) => s.pendingOrderId);
  const pendingWebThemeId = useApp((s) => s.pendingWebThemeId);

  const [filter, setFilter] = useState<FilterTab>("official");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"latest" | "popular" | "price">("latest");
  const [inspection, setInspection] = useState<InspectedThemePackage | null>(null);
  const [previewTheme, setPreviewTheme] = useState<CommerceThemeSummary | null>(null);

  useEffect(() => {
    if (!pendingWebThemeId) return;
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-theme-id="${CSS.escape(pendingWebThemeId)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [pendingWebThemeId]);

  const merged: CommerceThemeSummary[] = useMemo(
    () => mergeGalleryThemes(themes, catalog, entitlements),
    [themes, catalog, entitlements],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "community":
        return merged
          .filter((item) => item.product?.origin === "community")
          .filter((item) => {
            const needle = search.trim().toLowerCase();
            return !needle || `${item.name} ${item.tagline} ${item.product?.author?.displayName ?? ""}`
              .toLowerCase()
              .includes(needle);
          })
          .sort((a, b) => {
            if (sort === "popular") return (b.product?.unlockCount ?? 0) - (a.product?.unlockCount ?? 0);
            if (sort === "price") return (a.product?.pricePoints ?? 0) - (b.product?.pricePoints ?? 0);
            return Date.parse(b.product?.publishedAt ?? "0") - Date.parse(a.product?.publishedAt ?? "0");
          });
      case "owned":
        return merged.filter((item) => item.entitlement);
      case "local":
        return merged.filter((item) => item.local?.source === "custom");
      default:
        return merged.filter((item) => item.product?.origin !== "community");
    }
  }, [merged, filter, search, sort]);

  const closeInspection = () => {
    if (inspection) void api.discardInspection(inspection.tempDir).catch(() => {});
    setInspection(null);
  };

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

  const handleUnlock = async (theme: CommerceThemeSummary) => {
    if (!theme.product) return;
    if (auth?.status !== "authenticated") {
      toast("info", "请先登录账号。");
      return;
    }
    await unlockTheme(theme.id);
  };

  const handleAlipay = async (theme: CommerceThemeSummary) => {
    if (!theme.product || theme.product.priceCents <= 0) return;
    if (auth?.status !== "authenticated") {
      toast("info", "请先登录账号。");
      return;
    }
    await purchaseTheme(theme.id);
  };

  const handleDownload = async (theme: CommerceThemeSummary) => {
    if (!theme.entitlement) return;
    await downloadPurchasedTheme(theme.id);
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

      <div className="gallery-filters">
        {(Object.keys(FILTER_LABELS) as FilterTab[]).map((key) => (
          <button
            key={key}
            className={`gallery-filter${filter === key ? " active" : ""}`}
            onClick={() => {
              setFilter(key);
              void refreshCatalog();
              if (auth?.status === "authenticated") void refreshEntitlements();
            }}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      {filter === "community" && (
        <div className="marketplace-toolbar">
          <label className="account-field marketplace-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索主题或创作者"
            />
          </label>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="latest">最新上架</option>
            <option value="popular">使用人数</option>
            <option value="price">积分价格</option>
          </select>
        </div>
      )}

      {pendingOrderId && (
        <div className="payment-banner">
          订单处理中,请在浏览器中完成支付。支付完成后会自动同步到客户端。
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-gallery">
          {filter === "owned"
            ? "还没有已拥有的广场主题。"
            : filter === "community"
              ? "暂时没有符合条件的社区作品。"
              : "暂无主题。"}
        </div>
      ) : (
        <div className="theme-grid theme-grid--curated-presets">
          {filtered.map((theme) => (
            <ThemeCard
              theme={theme}
              key={theme.id}
              isPurchasing={purchasingThemeId === theme.id}
              onPreview={setPreviewTheme}
              onPurchase={() => void handleUnlock(theme)}
              onAlipay={() => void handleAlipay(theme)}
              onDownload={() => void handleDownload(theme)}
            />
          ))}
        </div>
      )}

      {inspection && (
        <ImportPreviewModal
          inspection={inspection}
          onClose={closeInspection}
          onImport={handleImport}
          onInstallAsCopy={handleInstallAsCopy}
        />
      )}

      {previewTheme && (
        <ThemePreviewModal
          theme={previewTheme}
          onClose={() => setPreviewTheme(null)}
          onPurchase={() => void handleUnlock(previewTheme)}
          onAlipay={() => void handleAlipay(previewTheme)}
          onDownload={() => void handleDownload(previewTheme)}
        />
      )}
    </div>
  );
}
