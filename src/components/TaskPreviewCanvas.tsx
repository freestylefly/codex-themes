import { useState } from "react";
import type { NormalizedTheme } from "../../electron/shared/types";
import { compileTheme } from "../../electron/engine/compiler";
import { RetroMessengerPreview } from "./RetroMessengerPreview";
import { SilkScrollPreview } from "./SilkScrollPreview";
import { MoonlitImmortalPreview } from "./MoonlitImmortalPreview";

export interface TaskPreviewCanvasProps {
  theme: NormalizedTheme;
  heroUrl?: string | null;
  wallpaperUrl?: string | null;
  stampUrl?: string | null;
}

/**
 * Static mock of the Codex task page rendered with the same design tokens
 * the injected skin uses — lets users judge how a theme looks during an
 * actual conversation before applying it.
 */
export function TaskPreviewCanvas({ theme, heroUrl, wallpaperUrl, stampUrl }: TaskPreviewCanvasProps) {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [compact, setCompact] = useState(false);

  if (theme.layout === "retro-messenger") {
    return <RetroMessengerPreview theme={theme} heroUrl={heroUrl} wallpaperUrl={wallpaperUrl} stampUrl={stampUrl} page="task" />;
  }

  if (theme.layout === "silk-scroll") {
    return <SilkScrollPreview theme={theme} heroUrl={heroUrl} wallpaperUrl={wallpaperUrl} stampUrl={stampUrl} page="task" />;
  }

  if (theme.id === "moonlit-immortal") {
    return <MoonlitImmortalPreview theme={theme} heroUrl={heroUrl} wallpaperUrl={wallpaperUrl} stampUrl={stampUrl} page="task" />;
  }

  const compiled = compileTheme(theme, { mode, compact });
  const c = theme[mode];

  const wrapperStyle: React.CSSProperties = {
    ...Object.fromEntries(
      Object.entries(compiled.variables).map(([k, v]) => [k, v]),
    ),
    "--dream-skin-art": heroUrl ? `url("${heroUrl}")` : "none",
    "--dream-skin-wallpaper": wallpaperUrl ? `url("${wallpaperUrl}")` : "none",
  } as React.CSSProperties;

  return (
    <div className="preview-frame">
      <div className="preview-frame-bar">
        <span className="tl-dot" style={{ background: "#ff5f57" }} />
        <span className="tl-dot" style={{ background: "#febc2e" }} />
        <span className="tl-dot" style={{ background: "#28c840" }} />
        <span className="preview-caption">Codex 对话页 · 近似预览 · {theme.layout}</span>
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
        {heroUrl && (
          <div className="mock-bg" style={{ backgroundImage: `url("${heroUrl}")` }} />
        )}
        <div
          className="mock-tint"
          style={{
            background: `linear-gradient(112deg, rgba(${hexToRgb(c.background).join(",")},0.96) 30%, rgba(${hexToRgb(c.background).join(",")},0.62) 60%, rgba(${hexToRgb(c.highlight).join(",")},0.22) 100%)`,
          }}
        />
        <div className="mock-inner">
          <div
            className="mock-rail"
            style={{
              background: c.panel,
              borderColor: `rgba(${hexToRgb(c.text).join(",")},0.07)`,
              justifyContent: "flex-start",
              gap: 10,
              paddingTop: 14,
            }}
          >
            <div className="mock-rail-item" style={{ color: c.muted, fontSize: 11 }}>
              ◀ 返回
            </div>
            <div
              className="mock-rail-item"
              style={{
                background: `rgba(${hexToRgb(c.accent).join(",")},0.12)`,
                color: c.accent,
                borderRadius: 6,
              }}
            >
              当前任务
            </div>
            <div className="mock-rail-item" style={{ color: c.muted }}>
              历史
            </div>
          </div>

          <div
            className={`mock-main mock-task-main mock-task-main--${theme.layout}`}
            style={{ padding: compact ? 14 : 22, gap: 14 }}
          >
            <div
              className="mock-thread-header"
              style={{
                color: c.text,
                fontSize: compact ? 16 : 20,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: `linear-gradient(145deg, ${c.accentAlt}, ${c.accent})`,
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  fontSize: 13,
                }}
              >
                ✦
              </span>
              优化主题生成配色
            </div>

            <div
              className="mock-message user"
              style={{
                alignSelf: "flex-end",
                maxWidth: "72%",
                background: c.accent,
                color: "#fff",
                padding: "10px 14px",
                borderRadius: "var(--ds-radius)",
                borderBottomRightRadius: 4,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              帮我把暗色模式的背景再压暗一点,让文字更醒目。
            </div>

            <div
              className="mock-message agent"
              style={{
                alignSelf: "flex-start",
                maxWidth: "80%",
                background: c.panel,
                color: c.text,
                padding: "12px 14px",
                borderRadius: "var(--ds-radius)",
                borderBottomLeftRadius: 4,
                border: `1px solid rgba(${hexToRgb(c.text).join(",")},0.08)`,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <div style={{ marginBottom: 8, color: c.accent, fontWeight: 600 }}>Codex</div>
              <div>已调整暗色背景并提升对比度。你可以通过右侧面板实时预览效果。</div>
              <div
                className="mock-code-block"
                style={{
                  marginTop: 10,
                  background: c.panelAlt,
                  border: `1px solid ${c.border}`,
                  borderRadius: "calc(var(--ds-radius) - 2px)",
                  padding: 10,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  color: c.muted,
                }}
              >
                <div style={{ color: c.accentAlt }}>// 暗色调色板</div>
                <div>background: {theme.dark?.background ?? c.background};</div>
                <div>text: {theme.dark?.text ?? c.text};</div>
              </div>
            </div>

            <div
              className="mock-message user"
              style={{
                alignSelf: "flex-end",
                maxWidth: "60%",
                background: c.accent,
                color: "#fff",
                padding: "10px 14px",
                borderRadius: "var(--ds-radius)",
                borderBottomRightRadius: 4,
                fontSize: 13,
              }}
            >
              看起来不错,保存吧。
            </div>

            <div
              className="mock-composer"
              style={{
                marginTop: "auto",
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
              <span className="grow">继续对话…</span>
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
                ▲
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
