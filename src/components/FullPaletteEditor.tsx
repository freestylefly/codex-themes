import type { ThemePalette } from "../../electron/shared/types";

const FIELDS: { key: keyof ThemePalette; label: string }[] = [
  { key: "background", label: "背景" },
  { key: "panel", label: "面板" },
  { key: "panelAlt", label: "面板次" },
  { key: "surface", label: "表面" },
  { key: "text", label: "文字" },
  { key: "muted", label: "次要文字" },
  { key: "border", label: "边框" },
  { key: "accent", label: "强调" },
  { key: "accentAlt", label: "强调次" },
  { key: "secondary", label: "辅助" },
  { key: "highlight", label: "高光" },
];

interface Props {
  light: ThemePalette;
  dark: ThemePalette;
  onChange(light: ThemePalette, dark: ThemePalette): void;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const v = Number.parseInt(m[1], 16);
  const rsRGB = ((v >> 16) & 255) / 255;
  const gsRGB = ((v >> 8) & 255) / 255;
  const bsRGB = (v & 255) / 255;
  const adjust = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * adjust(rsRGB) + 0.7152 * adjust(gsRGB) + 0.0722 * adjust(bsRGB);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function FullPaletteEditor({ light, dark, onChange }: Props) {
  const update = (mode: "light" | "dark", key: keyof ThemePalette, value: string) => {
    const next = mode === "light" ? { ...light, [key]: value } : { ...dark, [key]: value };
    onChange(mode === "light" ? next : light, mode === "dark" ? next : dark);
  };

  const warnings: { mode: string; text: string; ratio: number }[] = [];
  for (const [mode, palette] of [
    ["亮色", light],
    ["暗色", dark],
  ] as const) {
    const textBg = contrast(palette.text, palette.background);
    if (textBg < 4.5) {
      warnings.push({ mode, text: `文字/背景对比度 ${textBg.toFixed(2)}:1`, ratio: textBg });
    }
    const mutedBg = contrast(palette.muted, palette.background);
    if (mutedBg < 3) {
      warnings.push({ mode, text: `次要文字/背景对比度 ${mutedBg.toFixed(2)}:1`, ratio: mutedBg });
    }
  }

  return (
    <div className="full-palette-editor">
      <div className="palette-modes">
        {(["light", "dark"] as const).map((mode) => {
          const palette = mode === "light" ? light : dark;
          const label = mode === "light" ? "亮色" : "暗色";
          return (
            <div key={mode} className="palette-mode">
              <div className="palette-mode-title">{label}</div>
              <div className="palette-grid compact">
                {FIELDS.map(({ key, label: fieldLabel }) => (
                  <label className="color-field" key={key}>
                    <input
                      type="color"
                      value={palette[key]}
                      onChange={(e) => update(mode, key, e.target.value)}
                    />
                    <span className="color-meta">
                      <span className="color-name">{fieldLabel}</span>
                      <span className="color-hex">{palette[key]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {warnings.length > 0 && (
        <div className="contrast-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="contrast-warning">
              {w.mode}: {w.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
