# Theme Recipe Schema

The Theme Recipe is the only structured output the `generate-codex-theme` skill produces. It describes a Codex Themes v2 theme without containing any CSS, JavaScript, shell commands, or arbitrary file paths.

```json
{
  "schemaVersion": 1,
  "name": "string (max 80 chars)",
  "description": "string (max 160 chars)",
  "tagline": "string (max 160 chars)",
  "tags": ["string"],
  "layout": "dream-banner | split-studio | full-canvas | terminal-grid | paper-board | minimal-focus | retro-messenger",
  "hero": {
    "fit": "cover | contain",
    "focusX": 0.0,
    "focusY": 0.0,
    "zoom": 1.0,
    "height": 252,
    "textAlign": "left | center | right",
    "scrim": 0.62
  },
  "wallpaper": {
    "enabled": false,
    "focusX": 0.5,
    "focusY": 0.5,
    "opacity": 0.15,
    "blur": 0
  },
  "appearance": {
    "radius": "none | sm | md | lg | xl",
    "density": "compact | normal | spacious",
    "fontPreset": "system | rounded | mono",
    "glass": false,
    "shadow": "none | sm | md | lg",
    "decoration": 0.8
  },
  "effects": {
    "particles": 0.0,
    "aurora": 0.0,
    "glow": 0.0,
    "noise": 0.0,
    "grid": 0.0,
    "float": 0.0
  },
  "copy": {
    "brandSubtitle": "string (max 80)",
    "projectPrefix": "string (max 80)",
    "projectLabel": "string (max 80)",
    "statusText": "string (max 80)",
    "quote": "string (max 80)"
  },
  "paletteIntent": {
    "appearance": "light | dark",
    "contrast": "soft | normal | high",
    "temperature": "cool | neutral | warm"
  }
}
```

## Value ranges

- `hero.focusX`, `hero.focusY`, `wallpaper.focusX`, `wallpaper.focusY`: `[0, 1]`
- `hero.zoom`: `[0.5, 2]`
- `hero.height`: `[200, 360]`
- `hero.scrim`: `[0, 0.85]`
- `wallpaper.opacity`: `[0, 1]`
- `wallpaper.blur`: `[0, 32]`
- `decoration`: `[0, 1]`
- All effect intensities: `[0, 1]`
- `tags`: max 16 entries, each max 32 chars

## Rules

- `schemaVersion` must be `1`.
- All enums must use only the values listed above.
- Unknown fields are ignored by the validator but should not be emitted.
- The app will use `paletteIntent` plus local image analysis to build the final light/dark palettes; do not include literal palette hex colors in the Recipe.
