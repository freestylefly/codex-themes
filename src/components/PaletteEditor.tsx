import type { ExtractedPalette } from "../../electron/shared/types";

const FIELDS: { key: keyof ExtractedPalette; label: string }[] = [
  { key: "accent", label: "主强调色" },
  { key: "accentAlt", label: "次强调色" },
  { key: "secondary", label: "辅助色" },
  { key: "highlight", label: "高光色" },
];

interface Props {
  value: ExtractedPalette;
  onChange(next: ExtractedPalette): void;
}

export function PaletteEditor({ value, onChange }: Props) {
  return (
    <div className="palette-grid">
      {FIELDS.map(({ key, label }) => (
        <label className="color-field" key={key}>
          <input
            type="color"
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
          <span className="color-meta">
            <span className="color-name">{label}</span>
            <span className="color-hex">{value[key]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
