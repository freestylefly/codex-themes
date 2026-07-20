# Image Composition Guide

Hero images are displayed behind or beside Codex UI text. Follow these rules so the generated image works as a real theme.

## Aspect ratio and framing

- Target 16:9 landscape, roughly 1792×1024.
- Important subjects should not touch the very edges; leave breathing room.
- For `dream-banner`, keep the left 60% relatively calm or darker so white Codex text is legible.
- For `split-studio`, place the visual anchor on the left; the right side will be covered by content.
- For `full-canvas`, favor large gradients, bokeh, or subtle textures; avoid fine details behind text.
- For `retro-messenger`, generate one centered mascot or compact object on a
  removable flat background. The runtime places it in the right information
  rail, so keep the full subject visible with generous padding.

## Do not include

- Text, titles, slogans, watermarks, logos, signatures.
- UI controls, buttons, fake window chrome, scrollbars. The app renders the
  registered layout chrome itself.
- People’s faces if it would create an awkward overlap with text.
- Borders or frames that look like app chrome.

## Color and contrast

- Use layered color rather than flat single-color fills.
- Keep saturation moderate to high so the image feels alive, but avoid neon clipping.
- Provide enough tonal range that the app can derive both a light and a dark palette.

## Subject placement

- Keep the hero subject away from the area where Codex renders the welcome text.
- When in doubt, bias the subject to the right or bottom-right.
- Leave generous negative space for the glass scrim to blend with.
