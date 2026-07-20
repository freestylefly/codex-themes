# NOTICE

Codex Themes incorporates code ported from
[Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin),
licensed under the MIT License:

```
MIT License

Copyright (c) 2026 Codex Dream Skin Studio contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Ported components:

- `assets/inject/renderer-inject.js` — in-renderer theming runtime (idempotent
  injection, MutationObserver re-apply, cleanup), carried over nearly verbatim.
- `assets/inject/dream-skin.css` — decorative stylesheet.
- `electron/engine/*` — TypeScript port of `macos/scripts/injector.mjs`
  (CDP session, loopback validation, Codex shell probing, payload assembly,
  watch loop, soft verification).
- `electron/platform/codex-macos.ts` — Node/TypeScript port of the discovery,
  stop/launch and port-ownership logic from `macos/scripts/common-macos.sh`.
- `electron/config/codex-config.ts` — port of `macos/scripts/theme-config.mjs`
  (appearance key backup/restore for `~/.codex/config.toml`).
- `electron/themes/store.ts` — validation rules ported from
  `macos/scripts/write-theme.mjs` and `injector.mjs` (schema v1, text
  truncation, color whitelist, 16 MB image cap, path-traversal guard).
