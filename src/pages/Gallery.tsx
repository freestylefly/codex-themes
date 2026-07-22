import { FolderOpen, RotateCcw, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ThemeCard } from "../components/ThemeCard";
import { ImportPreviewModal } from "../components/ImportPreviewModal";
import { ThemePreviewModal } from "../components/ThemePreviewModal";
import { useApp } from "../store";
import { api } from "../api";
import type {
  CommerceThemeSummary,
  InspectedThemePackage,
  ThemeSummary,
} from "../../electron/shared/types";

/**
 * Curated gallery order: presets with original character or scene artwork and
 * richer, high-resolution previews define the gallery. Palette-only bundled
 * presets are filtered by the main process using theme metadata.
 */
const FEATURED_PRESET_IDS = [
  "moonlit-immortal",
  "mirror-lake-ribbon",
  "shanhai-nexus",
  "starcap-teemo",
  "neon-star-hunter",
  "mecha-cat-studio",
  "potion-workshop",
  "focus-capybara",
  "hacker-zero",
  "blue-window-messenger",
] as const;

const FEATURED_PRESET_RANK = new Map<string, number>(
  FEATURED_PRESET_IDS.map((id, index) => [id, index]),
);

type FilterTab = "all" | "free" | "paid" | "owned" | "local";

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "全部",
  free: "免费",
  paid: "付费",
  owned: "已购",
  local: "本地主题",
};

function rankFor(theme: ThemeSummary): number {
  return FEATURED_PRESET_RANK.get(theme.id) ?? Number.MAX_SAFE_INTEGER;
}

function galleryOrder(items: CommerceThemeSummary[]): CommerceThemeSummary[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftHasPreview = Boolean(left.item.previewUrl);
      const rightHasPreview = Boolean(right.item.previewUrl);
      if (leftHasPreview !== rightHasPreview) return rightHasPreview ? 1 : -1;

      const leftRank = rankFor(left.item);
      const rightRank = rankFor(right.item);
      if (leftRank !== rightRank) return leftRank - rightRank;

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

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
  const downloadPurchasedTheme = useApp((s) => s.downloadPurchasedTheme);
  const purchasingThemeId = useApp((s) => s.purchasingThemeId);
  const pendingOrderId = useApp((s) => s.pendingOrderId);
  const pendingWebThemeId = useApp((s) => s.pendingWebThemeId);

  const [filter, setFilter] = useState<FilterTab>("all");
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

  const merged: CommerceThemeSummary[] = useMemo(() => {
    const entitlementMap = new Map(entitlements.map((e) => [e.themeId, e]));
    const localMap = new Map(themes.map((t) => [t.id, t]));

    const fromProducts: CommerceThemeSummary[] = catalog.map((product) => {
      const local = localMap.get(product.id);
      const entitlement = entitlementMap.get(product.id);
      return {
        ...product,
        id: product.id,
        uuid: local?.uuid ?? product.id,
        name: product.name,
        tagline: product.tagline,
        description: product.description,
        version: local?.version ?? product.version,
        layout: product.layout,
        source: local?.source ?? (entitlement ? "purchased" : "preset"),
        readOnly: true,
        valid: true,
        signed: false,
        minEngineVersion: product.minEngineVersion,
        dir: local?.dir ?? "",
        previewUrl: local?.previewUrl ?? product.previewUrl,
        colors: local?.colors ?? {
          background: "#141518",
          panel: "#1e1f23",
          panelAlt: "#25262b",
          surface: "#1e1f23",
          text: "#e8e8e8",
          muted: "#9ca3af",
          border: "#2f3036",
          accent: "#60a5fa",
          accentAlt: "#93c5fd",
          secondary: "#a78bfa",
          highlight: "#fbbf24",
        },
        product,
        entitlement,
        local,
      };
    });

    // Add local-only themes (custom/imported/purchased) not in catalog.
    const fromLocals: CommerceThemeSummary[] = themes
      .filter((t) => !catalog.some((p) => p.id === t.id))
      .map((t) => ({
        ...t,
        product: undefined,
        entitlement: entitlementMap.get(t.id),
        local: t,
      }));

    return galleryOrder([...fromProducts, ...fromLocals]);
  }, [themes, catalog, entitlements]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "free":
        return merged.filter((item) => !item.product);
      case "paid":
        return merged.filter((item) => item.product && !item.entitlement);
      case "owned":
        return merged.filter((item) => item.entitlement);
      case "local":
        return merged.filter((item) => item.local && item.local.source !== "preset");
      default:
        return merged;
    }
  }, [merged, filter]);

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

  const handlePurchase = async (theme: CommerceThemeSummary) => {
    if (!theme.product) return;
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
              if (key === "paid" || key === "owned" || key === "all") {
                void refreshCatalog();
                void refreshEntitlements();
              }
            }}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      {pendingOrderId && (
        <div className="payment-banner">
          订单处理中,请在浏览器中完成支付。支付完成后会自动同步到客户端。
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-gallery">
          {filter === "owned"
            ? "还没有已购主题,去「付费」标签看看吧。"
            : filter === "paid"
              ? "暂无付费主题。"
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
              onPurchase={() => void handlePurchase(theme)}
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
          onPurchase={() => void handlePurchase(previewTheme)}
          onDownload={() => void handleDownload(previewTheme)}
        />
      )}
    </div>
  );
}
