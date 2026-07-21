import { Check, ImageOff, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LayoutKind, LoadedThemeDraft, ThemeSummary } from "../../electron/shared/types";
import { api } from "../api";
import {
  findLayoutPreviewTheme,
  LAYOUT_CATALOG,
  type LayoutCatalogItem,
} from "../layoutCatalog";
import { getLayoutPreviewAsset } from "../layoutPreviewAssets";
import { previewThemeFromLoadedDraft } from "../themePreview";
import { PreviewCanvas } from "./PreviewCanvas";

export interface LayoutCardSelectorProps {
  value: LayoutKind | undefined;
  onChange: (layout: LayoutKind | undefined) => void;
  themes: ThemeSummary[];
  allowAuto?: boolean;
  name: string;
}

function LayoutPreviewImage({ item, theme }: { item: LayoutCatalogItem; theme: ThemeSummary | undefined }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState<LoadedThemeDraft | null>(null);
  const previewAsset = getLayoutPreviewAsset(item.id);

  useEffect(() => {
    setFailed(false);
    setLoaded(null);
    if (previewAsset || !theme) return;
    let cancelled = false;
    void api
      .loadThemeDraft(theme.id)
      .then((draft) => {
        if (!cancelled) setLoaded(draft);
      })
      .catch(() => {
        // Keep the packaged preview image as a graceful fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [previewAsset, theme?.id, theme?.previewUrl]);

  if (previewAsset && !failed) {
    return (
      <img
        src={previewAsset.src}
        alt={`${previewAsset.name}：${item.name}布局案例图`}
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }

  if (!theme || failed) {
    return (
      <span className="layout-option__fallback" aria-label="暂无参考图">
        <ImageOff size={20} aria-hidden="true" />
        <span>暂无参考图</span>
      </span>
    );
  }

  if (loaded) {
    return <LiveLayoutPreview item={item} theme={theme} loaded={loaded} />;
  }

  return (
    <img
      src={theme.previewUrl}
      alt={`${theme.name}：${item.name}布局参考图`}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

const LAYOUT_PREVIEW_WIDTH = 1280;
const LAYOUT_PREVIEW_HEIGHT = 800;

function LiveLayoutPreview({
  item,
  theme,
  loaded,
}: {
  item: LayoutCatalogItem;
  theme: ThemeSummary;
  loaded: LoadedThemeDraft;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inertRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const previewTheme = useMemo(() => previewThemeFromLoadedDraft(loaded), [loaded]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const inertRoot = inertRef.current;
    if (!host || !inertRoot) return;
    inertRoot.inert = true;
    const update = () => {
      const rect = host.getBoundingClientRect();
      setBounds({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const scale = bounds.width && bounds.height
    ? Math.min(bounds.width / LAYOUT_PREVIEW_WIDTH, bounds.height / LAYOUT_PREVIEW_HEIGHT)
    : 0;
  const offsetX = (bounds.width - LAYOUT_PREVIEW_WIDTH * scale) / 2;
  const offsetY = (bounds.height - LAYOUT_PREVIEW_HEIGHT * scale) / 2;

  return (
    <div
      className="layout-option__live-preview"
      ref={hostRef}
      role="img"
      aria-label={`${theme.name}：${item.name}布局案例`}
    >
      <div
        className="layout-option__live-viewport"
        ref={inertRef}
        style={{
          width: LAYOUT_PREVIEW_WIDTH,
          height: LAYOUT_PREVIEW_HEIGHT,
          opacity: scale ? 1 : 0,
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
        }}
      >
        <PreviewCanvas
          theme={previewTheme}
          heroUrl={loaded.heroPreviewUrl}
          wallpaperUrl={loaded.wallpaperPreviewUrl}
          stampUrl={loaded.stampPreviewUrl}
        />
      </div>
    </div>
  );
}

export function LayoutCardSelector({
  value,
  onChange,
  themes,
  allowAuto = false,
  name,
}: LayoutCardSelectorProps) {
  const selected = value ? LAYOUT_CATALOG.find((item) => item.id === value) : undefined;

  return (
    <fieldset className="layout-selector">
      <legend className="sr-only">选择布局骨架</legend>
      <div className="layout-card-grid">
        {allowAuto && (
          <label className={`layout-option layout-option--auto${value === undefined ? " is-selected" : ""}`}>
            <input
              className="layout-option__input"
              type="radio"
              name={name}
              value="auto"
              checked={value === undefined}
              onChange={() => onChange(undefined)}
            />
            <span className="layout-option__auto-icon" aria-hidden="true">
              <Sparkles size={17} />
            </span>
            <span className="layout-option__auto-copy">
              <span className="layout-option__heading">
                <strong>自动选择</strong>
                <code>推荐</code>
              </span>
              <span className="layout-option__description">
                由 Codex 根据提示词和图片构图选择布局。
              </span>
            </span>
            {value === undefined && (
              <span className="layout-option__check" aria-hidden="true">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </label>
        )}

        {LAYOUT_CATALOG.map((item) => {
          const isSelected = value === item.id;
          const previewAsset = getLayoutPreviewAsset(item.id);
          const previewTheme = findLayoutPreviewTheme(item, themes);
          return (
            <label
              className={`layout-option${isSelected ? " is-selected" : ""}`}
              key={item.id}
            >
              <input
                className="layout-option__input"
                type="radio"
                name={name}
                value={item.id}
                checked={isSelected}
                onChange={() => onChange(item.id)}
              />
              <div className="layout-option__media">
                <LayoutPreviewImage item={item} theme={previewTheme} />
              </div>
              <span className="layout-option__body">
                <span className="layout-option__heading">
                  <strong>{item.name}</strong>
                  <code>{item.id}</code>
                </span>
                <span className="layout-option__description">{item.description}</span>
                <span className="layout-option__example">
                  {previewAsset
                    ? `示例 · ${previewAsset.name}`
                    : previewTheme
                      ? `示例 · ${previewTheme.name}`
                      : "示例主题暂不可用"}
                </span>
              </span>
              {isSelected && (
                <span className="layout-option__check" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="layout-guidance" aria-live="polite">
        <span className="layout-guidance__label">画面建议</span>
        <span>
          {selected?.guidance ?? "Codex 会结合提示词、参考图片主体位置和阅读安全区自动判断。"}
        </span>
      </div>
      <p className="layout-selector-note">
        参考图展示布局骨架，实际配色、图片和专属样式由主题设置决定。
      </p>
    </fieldset>
  );
}
