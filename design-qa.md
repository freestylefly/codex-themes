# 蓝窗信使 Design QA

## Source visual truth

- Reference: `/Users/canghe/Library/Containers/at.EternalStorms.Yoink/Data/Documents/YoinkPromisedFiles.noIndex/yoinkFilePromiseCreationFolder7D3018CF-CA75-40E5-9F3A-1CE897CF3790/add7D3018CF-CA75-40E5-9F3A-1CE897CF3790/WecomSave_62db42e880bd9924483d51639eace46b.png`
- Target state: 2007-style blue desktop messenger, task page, three-column shell, buddy rail open.

## Implementation evidence

- Store preview: `assets/presets/blue-window-messenger/preview.png`
- Desktop renderer capture: `tmp/blue-window-v2-render.png`
- Narrow renderer capture: `tmp/blue-window-v2-narrow.png`
- Full reference/implementation comparison: `tmp/blue-window-reference-vs-render.png`
- Focused header/right-rail comparison: `tmp/blue-window-focused-compare.png`
- Desktop viewport: 1065 × 780 CSS px, captured at 2× device scale.
- Narrow viewport: 760 × 570 CSS px, captured at 2× device scale.

## Findings

- No actionable P0/P1/P2 visual findings remain.
- Layout and spacing: the implementation matches the reference's dark XP title bar, large task toolbar, approximately 22/58/20 three-column body, dense left project tree, dominant white task surface, right buddy rail, composer, and bottom status bar.
- Typography: Tahoma/Segoe UI/Microsoft YaHei fallbacks, compact line heights, and the final larger type scale reproduce the source density without sacrificing readability.
- Colors and surfaces: glossy cobalt title chrome, pale blue panels, sharp cyan borders, white content surfaces, green online indicators, and restrained amber highlights track the reference palette.
- Content: the center task copy and three migration command blocks match the reference hierarchy. Product labels were adapted to current Codex concepts rather than copying obsolete messenger functions literally.
- Images: `mascot.png`, `background-v2.png`, and `stamp.png` are original theme assets. The second buddy is an original adult developer character; no reference character, logo, or third-party UI asset was copied.
- Icons: visible controls use the project's existing Lucide icon system. Decorative injected runtime labels remain non-interactive so they cannot impersonate native Codex navigation.
- Interaction: toolbar selection and composer send were exercised in the rendered preview; both state changes completed successfully.
- Console: no application errors were emitted during desktop or narrow rendering. The temporary offscreen QA harness produced only Electron's expected development CSP warning.
- Accessibility: interactive elements are native buttons, inputs, and textarea controls with accessible labels where needed. Decorative window controls are marked `aria-hidden`; text contrast is strong on all primary surfaces.

## Responsive verification

- 1065px: full three-column layout, complete buddy rail and composer, no horizontal overflow.
- 760px: compact icon-only task toolbar, readable center task flow, three-column personality retained.
- Runtime injection: right rail hides below 900px; task toolbar hides below 720px. A short-window media rule reduces mascot and buddy art heights at 760px viewport height or below.

## Comparison history

1. The earlier theme preview was a simplified two-column browser-like shell. It did not match the supplied task toolbar, left project tree, title chrome, or structured right buddy rail (P1).
2. Rebuilt the preview and injected chrome as a three-column XP messenger shell and added a reference-derived pale blue star/bubble texture.
3. First combined comparison showed undersized typography and excessive information density (P2). Increased title, toolbar, navigation, document, code, composer, and status type scales.
4. Second comparison showed the lower buddy panel was too short and used a generic icon (P2). Added an original full-body developer buddy asset, routed the theme stamp asset through the runtime injection payload, and enlarged the friend panel.
5. Final combined and focused comparisons show the target hierarchy, scale, palette, and right-rail personality are aligned. Remaining differences are intentional product substitutions: current Codex icons/content and original character art.

## Test gap

- [P3] The injected theme source, payload assembly, responsive rules, and package assets are covered by build/tests, but a fresh screenshot inside the live Codex window was not captured in this pass because the local Mac UI session was locked. This does not block the store preview or package implementation.

## Final result

final result: passed

---

# Codex Themes 官网 Design QA

## Source visual truth

- Reference home capture: `/tmp/codex-themes-qa/reference-home.png`
- Reference detail capture: `/tmp/codex-themes-qa/reference-detail.png`
- Reference: `https://codexthemes.ai/`，仅用于编辑式标题、大留白、主题大图和详情页节奏；品牌、文案、主题与安装路径均为本项目原创实现。

## Implementation evidence

- Home capture: `/tmp/codex-themes-qa/implementation-home.png`
- Theme detail capture: `/tmp/codex-themes-qa/implementation-detail.png`
- Full home comparison: `/tmp/codex-themes-qa/home-comparison.jpg`
- Detail comparison: `/tmp/codex-themes-qa/detail-comparison.jpg`
- Browser-rendered viewport: 1229 × 720 CSS px.
- States checked: Chinese home, Chinese Blue Window detail, English theme gallery, 11-card gallery inventory, canonical/alternate metadata, and production download URLs.
- Browser console: no warnings or errors.

## Findings

- No actionable P0/P1/P2 visual findings remain.
- Fonts and typography: editorial Songti/Times display stacks reproduce the reference hierarchy while the sans/mono stacks keep product copy and metadata compact and readable.
- Spacing and layout rhythm: the implementation retains the reference's quiet header, oversized two-column hero, image-led gallery, and image/install-panel detail composition. Section spacing is intentionally generous and card chrome remains minimal.
- Colors and tokens: the reference lavender field is adapted to the product's warm paper, Blue Window cobalt, pale cyan, and navy tokens. Contrast remains strong for primary copy and actions.
- Image quality: all visible product imagery comes from the real built-in theme previews. Astro emits responsive WebP variants; the Blue Window mascot is used as the real brand mark.
- Copy and content: the site explains the actual local injection model, Codex CLI generation, unsigned Beta limitation, Apple-silicon scope, and explicit confirmation before applying a web-requested theme.
- Accessibility and interaction: semantic navigation, skip link, native buttons/details, focus-visible states, labeled dialog, Escape dismissal, reduced-motion handling, and keyboard-restored focus are implemented.

## Comparison history

1. First browser capture showed the Hero preview retaining its intrinsic 1560px height, which pushed the headline below the fold (P1).
2. Added global proportional image sizing, recaptured the page, and confirmed the headline, primary actions, release note, and Blue Window preview all share the first viewport.
3. Replaced the previous near-empty gradient app icon with the real Blue Window mascot after the focused header comparison showed weak brand recognition (P2).
4. Final home and detail comparisons show the intended reference rhythm with project-specific brand, copy, imagery, and one-click app flow.

## Responsive and interaction verification

- CSS breakpoints cover three-, two-, and one-column galleries at 1080px, 820px, and 590px, collapse feature/step grids, move the detail install panel below the preview, and replace desktop navigation with a labeled menu.
- The connected browser's temporary viewport override did not change its fixed in-app viewport, so a mobile browser screenshot could not be captured in this run. The responsive rules remain production-built and type-checked; this is a P3 evidence gap rather than an observed responsive defect.
- The browser security policy blocked executing the external `codexthemes://` protocol. URL parsing, malicious-input rejection, queued delivery, and renderer confirmation are covered by code tests and production builds; the native installed-app round trip remains a real-machine release smoke test.

## Final result

final result: passed
