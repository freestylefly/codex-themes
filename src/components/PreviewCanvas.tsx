import { ArrowUp, LayoutGrid, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import type { NormalizedTheme } from "../../electron/shared/types";
import { compileTheme } from "../../electron/engine/compiler";
import { RetroMessengerPreview } from "./RetroMessengerPreview";
import { SilkScrollPreview } from "./SilkScrollPreview";
import { MoonlitImmortalPreview } from "./MoonlitImmortalPreview";

export interface PreviewCanvasProps {
  theme: NormalizedTheme;
  /** Optional hero image URL for the preview (defaults to a gradient). */
  heroUrl?: string | null;
  /** Optional wallpaper image URL. */
  wallpaperUrl?: string | null;
  /** Optional stamp or secondary character image URL. */
  stampUrl?: string | null;
}

/**
 * Static mock of the Codex home screen rendered with the same design tokens
 * the injected skin uses — close enough to judge a theme before applying it.
 */
export function PreviewCanvas({ theme, heroUrl, wallpaperUrl, stampUrl }: PreviewCanvasProps) {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [compact, setCompact] = useState(false);

  if (theme.layout === "retro-messenger") {
    return <RetroMessengerPreview theme={theme} heroUrl={heroUrl} wallpaperUrl={wallpaperUrl} stampUrl={stampUrl} page="home" />;
  }

  if (theme.layout === "silk-scroll") {
    return <SilkScrollPreview theme={theme} heroUrl={heroUrl} wallpaperUrl={wallpaperUrl} stampUrl={stampUrl} page="home" />;
  }

  if (theme.id === "moonlit-immortal") {
    return <MoonlitImmortalPreview theme={theme} heroUrl={heroUrl} wallpaperUrl={wallpaperUrl} stampUrl={stampUrl} page="home" />;
  }

  const compiled = compileTheme(theme, { mode, compact });
  const c = theme[mode];
  const artUrl = heroUrl ?? undefined;

  // Deep scrim tone the injected skin derives as --ds-hero-ink.
  const heroInk = compiled.variables["--ds-hero-ink"];
  const artName = /[A-Za-z][A-Za-z' ]+/.exec(theme.name)?.[0].trim() || theme.name;

  const wrapperStyle: React.CSSProperties = {
    ...Object.fromEntries(
      Object.entries(compiled.variables).map(([k, v]) => [k, v]),
    ),
    "--dream-skin-art": artUrl ? `url("${artUrl}")` : "none",
    "--dream-skin-wallpaper": wallpaperUrl ? `url("${wallpaperUrl}")` : "none",
  } as React.CSSProperties;

  return (
    <div className="preview-frame">
      <div className="preview-frame-bar">
        <span className="tl-dot" style={{ background: "#ff5f57" }} />
        <span className="tl-dot" style={{ background: "#febc2e" }} />
        <span className="tl-dot" style={{ background: "#28c840" }} />
        <span className="preview-caption">Codex 首页 · 近似预览 · {theme.layout}</span>
        <div className="preview-toggles">
          <button className={`preview-toggle${mode === "light" ? " on" : ""}`} onClick={() => setMode("light")}>
            亮色
          </button>
          <button className={`preview-toggle${mode === "dark" ? " on" : ""}`} onClick={() => setMode("dark")}>
            暗色
          </button>
          <button className={`preview-toggle${compact ? " on" : ""}`} onClick={() => setCompact(!compact)}>
            紧凑
          </button>
        </div>
      </div>
      <div
        className={`mock codex-dream-skin codex-dream-skin--${theme.layout} codex-dream-skin--${mode} ${compact ? "codex-dream-skin--compact" : "codex-dream-skin--wide"}`}
        data-dream-theme={theme.id}
        style={wrapperStyle}
      >
        {artUrl && (
          <div className="mock-bg" style={{ backgroundImage: `url("${artUrl}")` }} />
        )}
        <div
          className="mock-tint"
          style={{
            background: `linear-gradient(112deg, rgba(${hexToRgb(c.background).join(",")},0.96) 30%, rgba(${hexToRgb(c.background).join(",")},0.62) 60%, rgba(${hexToRgb(c.highlight).join(",")},0.22) 100%)`,
          }}
        />
        <div className="mock-inner">
          <div className="mock-rail" style={{ background: c.panel, borderColor: `rgba(${hexToRgb(c.text).join(",")},0.07)` }}>
            <div className="mock-rail-item" style={{ background: `rgba(${hexToRgb(c.accent).join(",")},0.12)`, color: c.accent }}>
              <Sparkles size={13} />
            </div>
            <div className="mock-rail-item" style={{ color: c.muted }}>
              <LayoutGrid size={13} />
            </div>
            <div className="mock-rail-item" style={{ color: c.muted }}>
              <Plus size={13} />
            </div>
          </div>
          <div className={`mock-main mock-main--${theme.layout}`}>
            <div className="mock-hero-header">
              <span
                className="mock-hero-icon"
                style={{ background: `linear-gradient(145deg, ${c.accentAlt}, ${c.accent})`, color: "#fff" }}
              >
                ✦
              </span>
              <span className="mock-hero-title">
                <b style={{ color: c.text }}>{theme.name}</b>
                <small style={{ color: c.muted }}>{theme.copy.brandSubtitle}</small>
              </span>
            </div>

            <div
              className="mock-hero-card"
              style={{
                backgroundColor: heroInk,
                backgroundImage: artUrl
                  ? `url("${artUrl}")`
                  : `linear-gradient(135deg, ${c.accentAlt}, ${c.highlight})`,
                backgroundSize: "cover",
                backgroundPosition: `${Math.round(theme.hero.focusX * 100)}% ${Math.round(theme.hero.focusY * 100)}%`,
                borderColor: `rgba(${hexToRgb(c.accent).join(",")},0.5)`,
                boxShadow: `0 18px 44px rgba(${hexToRgb(c.highlight).join(",")},0.26), 0 0 26px rgba(${hexToRgb(c.accent).join(",")},0.22), inset 0 0 0 1px rgba(255,255,255,.28)`,
                height: theme.hero.height,
                borderRadius: `calc(var(--ds-radius) + 4px)`,
              }}
            >
              <div
                className="mock-hero-tint"
                style={{
                  background: `linear-gradient(100deg, ${hexToRgba(heroInk, 0.92)} 0%, ${hexToRgba(heroInk, 0.72)} 46%, ${hexToRgba(heroInk, 0.34)} 74%, transparent 100%)`,
                  opacity: 0.3 + theme.hero.scrim * 0.7,
                }}
              />
              <div className="mock-hero-art-name">{artName}</div>
              <span
                className="mock-status"
                style={{ position: "absolute", right: 14, top: 10, zIndex: 1, color: "rgba(255,255,255,.85)" }}
              >
                <span className="pulse" style={{ background: c.accentAlt }} />
                {theme.copy.statusText}
              </span>
              <div className="mock-hero-content" style={{ textAlign: theme.hero.textAlign }}>
                <span
                  className="mock-hero-badge"
                  style={{
                    background: `linear-gradient(120deg, ${c.accentAlt}, ${c.accent})`,
                    boxShadow: `0 4px 14px rgba(${hexToRgb(c.accent).join(",")},0.3), inset 0 0 0 1px rgba(255,255,255,.35)`,
                  }}
                >
                  {theme.name}
                </span>
                <div className="mock-brand" style={{ color: "#ffffff", textShadow: "0 2px 14px rgba(0,0,0,.45)" }}>
                  我们该构建什么?
                </div>
                <div className="mock-tagline" style={{ color: "rgba(255,255,255,.88)" }}>{theme.tagline}</div>
                <span
                  className="mock-quote"
                  style={{
                    color: "#ffffff",
                    borderColor: "rgba(255,255,255,.55)",
                    background: "rgba(255,255,255,.16)",
                  }}
                >
                  {theme.copy.quote}
                </span>
              </div>
              <span className="mock-deco" style={{ color: "rgba(255,255,255,.8)" }}>✦</span>
            </div>

            <div className="mock-suggestions" style={{ borderColor: `rgba(${hexToRgb(c.text).join(",")},0.06)` }}>
              {[
                { label: "探索并理解代码", desc: "把想法写成可运行代码" },
                { label: "构建新功能", desc: "新功能、应用或工具" },
                { label: "审查代码", desc: "审查并给出修改建议" },
                { label: "修复问题", desc: "修复问题与失败" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="mock-suggestion-card"
                  style={{
                    background: c.panel,
                    borderColor: `rgba(${hexToRgb(c.text).join(",")},0.06)`,
                    boxShadow: `0 9px 22px rgba(${hexToRgb(c.text).join(",")},0.05)`,
                    borderRadius: "var(--ds-radius)",
                  }}
                >
                  <span
                    className="mock-suggestion-icon"
                    style={{ background: `linear-gradient(145deg, ${c.accentAlt}, ${c.accent})`, color: "#fff" }}
                  >
                    <Sparkles size={16} />
                  </span>
                  <span style={{ color: c.text }}>{item.label}</span>
                  <span className="mock-suggestion-desc" style={{ color: c.muted }}>{item.desc}</span>
                  <span className="mock-suggestion-heart" style={{ color: c.secondary }}>♥</span>
                </div>
              ))}
            </div>

            <div
              className="mock-composer"
              style={{
                background: c.panelAlt,
                borderColor: c.border.startsWith("#") ? hexToRgba(c.border, 0.5) : c.border,
                color: c.muted,
                boxShadow: `0 10px 28px rgba(${hexToRgb(c.text).join(",")},0.06)`,
              }}
            >
              <span
                className="mock-composer-mark"
                style={{ background: `linear-gradient(145deg, ${c.accentAlt}, ${c.accent})`, color: "#fff" }}
              >
                ✦
              </span>
              <Plus size={13} />
              <span className="grow">给 Codex 派个任务…</span>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: c.accent,
                  color: c.background,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <ArrowUp size={12} strokeWidth={2.6} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const v = Number.parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
