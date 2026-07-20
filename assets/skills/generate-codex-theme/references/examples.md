# Example Prompts

These examples show the expected level of detail and the resulting Recipe decisions.

## Dark rainy night

Prompt: "A moody rainy night in a futuristic city, neon reflections on wet streets, deep blues and purples, the main glow on the right side."

Expected decisions:
- `layout`: `dream-banner`
- `paletteIntent.appearance`: `dark`
- `paletteIntent.contrast`: `high`
- `paletteIntent.temperature`: `cool`
- `hero.textAlign`: `left`
- `hero.scrim`: `0.65`
- `appearance.glass`: `true`, `shadow`: `md`

## Bright paper workspace

Prompt: "A clean bright paper desk with soft sunlight, warm cream tones, a few handwritten sticky notes, minimal."

Expected decisions:
- `layout`: `paper-board`
- `paletteIntent.appearance`: `light`
- `paletteIntent.contrast`: `normal`
- `paletteIntent.temperature`: `warm`
- `appearance.glass`: `false`, `shadow`: `sm`, `decoration`: `0.5`

## Terminal grid

Prompt: "A high-contrast terminal grid theme, dark background, green phosphor glow, low radius, monospace feel."

Expected decisions:
- `layout`: `terminal-grid`
- `paletteIntent.appearance`: `dark`
- `paletteIntent.contrast`: `high`
- `paletteIntent.temperature`: `cool`
- `appearance.radius`: `none`, `fontPreset`: `mono`, `shadow`: `none`

## Recipe-only from a reference image

Prompt: "Use my uploaded image of a sunset beach. Make a warm, relaxed theme."

Expected behavior:
- Do not generate a new image.
- Produce a Recipe with `layout` `full-canvas`, warm neutral palette intent, moderate scrim.

## Refine without new image

Prompt: "The image is good, but make the whole theme feel more premium and cooler."

Expected behavior:
- Keep the existing image path.
- Update `paletteIntent.temperature` to `cool`, `appearance.glass` to `true`, `shadow` to `lg`, effects slightly higher.
