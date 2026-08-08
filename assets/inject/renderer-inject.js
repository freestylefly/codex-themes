((cssText, artDataUrl, wallpaperDataUrl, stampDataUrl, motionDataUrl, motionPosterDataUrl, themeConfig, initialVars, version) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_DREAM_SKIN_DISABLED__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const MOONLIT_WELCOME_ID = "codex-dream-skin-moonlit-welcome";
  const BLUE_WINDOW_HOME_ID = "codex-dream-skin-blue-window-home";
  const MOTION_ID = "codex-dream-skin-motion";
  const CINEMATIC_UI_ID = "codex-dream-skin-cinematic-ui";
  const SHELL_ATTR = "data-dream-shell";
  const VERSION = version || "1.0.0";
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const CUSTOM_HOME_THEME_IDS = new Set([
    "blue-window-messenger",
  ]);
  const PRESERVE_NATIVE_LAYOUT = !CUSTOM_HOME_THEME_IDS.has(THEME.id);
  const isActiveHomeSurface = __DREAM_SKIN_HOME_CLASSIFIER__;
  const WALLPAPER_URL = wallpaperDataUrl || null;
  const MOTION_DATA_URL = motionDataUrl || null;
  const MOTION_POSTER_DATA_URL = motionPosterDataUrl || artDataUrl || null;
  const LAYOUT_CLASSES = [
    "dream-banner",
    "split-studio",
    "full-canvas",
    "cinematic-live",
    "terminal-grid",
    "paper-board",
    "minimal-focus",
    "retro-messenger",
    "silk-scroll",
  ].map((layout) => `codex-dream-skin--${layout}`);
  window[DISABLED_KEY] = false;

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
  if (previous?.mediaHandler && previous?.mediaQuery) {
    try { previous.mediaQuery.removeEventListener("change", previous.mediaHandler); } catch {}
  }
  if (previous?.reducedMotionHandler && previous?.reducedMotionQuery) {
    try { previous.reducedMotionQuery.removeEventListener("change", previous.reducedMotionHandler); } catch {}
  }
  if (previous?.visibilityHandler) document.removeEventListener("visibilitychange", previous.visibilityHandler);
  if (previous?.focusHandler) window.removeEventListener("focus", previous.focusHandler);
  if (previous?.blurHandler) window.removeEventListener("blur", previous.blurHandler);
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);
  if (previous?.wallpaperUrl) URL.revokeObjectURL(previous.wallpaperUrl);
  if (previous?.stampUrl && previous.stampUrl !== previous.artUrl) URL.revokeObjectURL(previous.stampUrl);
  if (previous?.motionUrl) URL.revokeObjectURL(previous.motionUrl);
  if (previous?.motionPosterUrl && previous.motionPosterUrl !== previous.artUrl) {
    URL.revokeObjectURL(previous.motionPosterUrl);
  }
  document.getElementById(MOTION_ID)?.remove();
  document.getElementById(CINEMATIC_UI_ID)?.remove();

  const dataUrlToBlobUrl = (dataUrl) => {
    if (!dataUrl) return null;
    const comma = dataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || "image/png";
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };

  const artUrl = dataUrlToBlobUrl(artDataUrl);
  const wallpaperUrl = dataUrlToBlobUrl(WALLPAPER_URL);
  const stampUrl = dataUrlToBlobUrl(stampDataUrl) || artUrl;
  const motionUrl = dataUrlToBlobUrl(MOTION_DATA_URL);
  const motionPosterUrl = dataUrlToBlobUrl(MOTION_POSTER_DATA_URL) || artUrl;

  const cssString = (value) => JSON.stringify(String(value ?? ""));

  /**
   * ChatGPT / Work and Codex now share one desktop shell. Brand names remain
   * invariant across locales, so the top-left mode button is a safer boundary
   * than the generic main/sidebar classes shared by every surface.
   */
  const detectProductMode = () => {
    const modeButton = [...document.querySelectorAll("button")].find((button) => {
      const rect = button.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.left > 360 || rect.top > 160) return false;
      const text = (button.textContent || "").trim();
      const label = button.getAttribute("aria-label") || "";
      return text === "Codex" || text === "ChatGPT" ||
        /(?:current mode|当前模式).*(?:Codex|ChatGPT)/i.test(label);
    });
    const text = (modeButton?.textContent || "").trim().toLowerCase();
    if (text === "chatgpt") return "chatgpt";
    if (text === "codex") return "codex";
    const label = (modeButton?.getAttribute("aria-label") || "").toLowerCase();
    if (label.includes("chatgpt")) return "chatgpt";
    if (label.includes("codex")) return "codex";
    const title = (document.title || "").trim().toLowerCase();
    if (title === "chatgpt" || title.startsWith("chatgpt ")) return "chatgpt";
    return title === "codex" || title.startsWith("codex ") ? "codex" : "unknown";
  };

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const m = String(value).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  };

  const luminance = ({ r, g, b }) => {
    const lin = [r, g, b].map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  /** Detect Codex app light/dark shell for CSS branching. */
  const detectShellMode = () => {
    const root = document.documentElement;
    const body = document.body;
    const cls = `${root.className || ""} ${body?.className || ""}`.toLowerCase();

    if (/\b(dark|theme-dark|appearance-dark)\b/.test(cls)) return "dark";
    if (/\b(light|theme-light|appearance-light)\b/.test(cls)) return "light";

    const dataTheme = (
      root.getAttribute("data-theme") ||
      root.getAttribute("data-appearance") ||
      root.getAttribute("data-color-mode") ||
      body?.getAttribute("data-theme") ||
      body?.getAttribute("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    const checked = document.querySelector('input[name="appearance-theme"]:checked');
    if (checked) {
      const label = (checked.getAttribute("aria-label") || checked.value || "").toLowerCase();
      if (label.includes("暗") || label.includes("dark")) return "dark";
      if (label.includes("浅") || label.includes("light")) return "light";
      if (label.includes("系统") || label.includes("system")) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    }

    try {
      const cs = getComputedStyle(root).colorScheme || "";
      if (cs.includes("dark") && !cs.includes("light")) return "dark";
      if (cs.includes("light") && !cs.includes("dark")) return "light";
    } catch {}

    const samples = [
      body,
      document.querySelector("main.main-surface") ||
        document.querySelector('main[class*="_MainContentSurface_"]') ||
        document.querySelector("main"),
      document.querySelector("aside.app-shell-left-panel"),
    ].filter(Boolean);
    let votesLight = 0;
    let votesDark = 0;
    for (const el of samples) {
      try {
        const rgb = parseRgb(getComputedStyle(el).backgroundColor);
        if (!rgb) continue;
        const L = luminance(rgb);
        if (L >= 0.55) votesLight += 1;
        else if (L <= 0.25) votesDark += 1;
      } catch {}
    }
    if (votesLight > votesDark) return "light";
    if (votesDark > votesLight) return "dark";

    try {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch {}
    return "light";
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clamp01 = (v) => clamp(Number(v) || 0, 0, 1);

  const hexToRgb = (hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const v = Number.parseInt(m[1], 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  };

  const rgbToHex = ({ r, g, b }) =>
    `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;

  const hexToHsl = (hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const { r, g, b } = rgb;
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l };
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    return { h: (h * 60 + 360) % 360, s, l };
  };

  const hslToHex = ({ h, s, l }) => {
    const hh = ((h % 360) + 360) % 360;
    const ss = clamp(s, 0, 1);
    const ll = clamp(l, 0, 1);
    const chroma = (1 - Math.abs(2 * ll - 1)) * ss;
    const x = chroma * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = ll - chroma / 2;
    const [rn, gn, bn] =
      hh < 60 ? [chroma, x, 0]
      : hh < 120 ? [x, chroma, 0]
      : hh < 180 ? [0, chroma, x]
      : hh < 240 ? [0, x, chroma]
      : hh < 300 ? [x, 0, chroma]
      : [chroma, 0, x];
    return rgbToHex({
      r: Math.round((rn + m) * 255),
      g: Math.round((gn + m) * 255),
      b: Math.round((bn + m) * 255),
    });
  };

  const mixHex = (a, b, t) => {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    if (!ca || !cb) return a;
    return rgbToHex({
      r: Math.round(ca.r * t + cb.r * (1 - t)),
      g: Math.round(ca.g * t + cb.g * (1 - t)),
      b: Math.round(ca.b * t + cb.b * (1 - t)),
    });
  };

  const hexToRgba = (hex, alpha) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  };

  const darkenForInk = (hex) => {
    const hsl = hexToHsl(hex);
    if (!hsl) return "#14101a";
    return hslToHex({ h: hsl.h, s: Math.min(hsl.s * 1.1, 1), l: Math.max(hsl.l * 0.28, 0.08) });
  };

  const radiusMap = { none: "0px", sm: "8px", md: "16px", lg: "24px", xl: "32px" };
  const shadowMap = { none: "none", sm: "0 4px 12px rgba(0,0,0,.08)", md: "0 10px 28px rgba(0,0,0,.10)", lg: "0 18px 44px rgba(0,0,0,.14)" };

  const compileVariables = (mode) => {
    const palette = (THEME[mode] || THEME.light || THEME.colors || {});
    const layout = THEME.layout || "dream-banner";
    const hero = THEME.hero || {};
    const wallpaper = THEME.wallpaper || {};
    const appearance = THEME.appearance || {};
    const effects = THEME.effects || {};
    const copy = THEME.copy || {};

    const heroInk = mixHex(darkenForInk(palette.highlight || "#c9b18a"), "#14101a", 0.62);
    const heroPosition = `${Math.round(clamp01(hero.focusX) * 100)}% ${Math.round(clamp01(hero.focusY) * 100)}%`;
    const wallpaperPosition = `${Math.round(clamp01(wallpaper.focusX || 0.5) * 100)}% ${Math.round(clamp01(wallpaper.focusY || 0.5) * 100)}%`;

    return {
      "--ds-bg": palette.background || "#f7f4ef",
      "--ds-panel": palette.panel || "#ffffff",
      "--ds-panel-2": palette.panelAlt || "#faf7f2",
      "--ds-surface": palette.surface || (palette.panel || "#ffffff"),
      "--ds-green": palette.accent || "#8a9a6d",
      "--ds-lime": palette.accentAlt || "#a8b894",
      "--ds-cyan": palette.secondary || "#d4a5a5",
      "--ds-purple": palette.highlight || "#c9b18a",
      "--ds-text": palette.text || "#3d3630",
      "--ds-muted": palette.muted || "#7d756b",
      "--ds-line": palette.border || "rgba(138, 154, 109, .22)",
      "--ds-ink-shadow": hexToRgba(palette.text || "#3d3630", 0.12),
      "--ds-accent-glow": hexToRgba(palette.accent || "#8a9a6d", 0.24),
      "--ds-card-border": mixHex(palette.accent || "#8a9a6d", palette.panel || "#ffffff", 0.18),
      "--ds-hero-ink": heroInk,
      "--ds-layout": layout,
      "--ds-hero-fit": hero.fit || "cover",
      "--ds-hero-position": heroPosition,
      "--ds-hero-zoom": String(clamp(hero.zoom || 1, 1, 2)),
      "--ds-hero-height": `${Math.round(clamp(hero.height || 252, 200, 360))}px`,
      "--ds-hero-text-align": hero.textAlign || "left",
      "--ds-hero-scrim": String(clamp01(hero.scrim ?? 0.62)),
      "--ds-retro-title-height": layout === "retro-messenger" ? "26px" : "0px",
      "--ds-retro-toolbar-height": layout === "retro-messenger" ? "38px" : "0px",
      "--ds-retro-rail-width": layout === "retro-messenger" ? "184px" : "0px",
      "--ds-retro-border": layout === "retro-messenger" ? (palette.accent || "#2f88cc") : (palette.border || "rgba(138, 154, 109, .22)"),
      "--ds-wallpaper-enabled": (wallpaper.enabled ? "1" : "0"),
      "--ds-wallpaper-position": wallpaperPosition,
      "--ds-wallpaper-opacity": String(clamp01(wallpaper.opacity ?? 0.15)),
      "--ds-wallpaper-blur": `${Math.round(clamp(wallpaper.blur || 0, 0, 20))}px`,
      "--ds-radius": radiusMap[appearance.radius] || radiusMap.lg,
      "--ds-density": appearance.density || "normal",
      "--ds-font-preset": appearance.fontPreset || "system",
      "--ds-glass": appearance.glass ? "1" : "0",
      "--ds-shadow": shadowMap[appearance.shadow] || shadowMap.lg,
      "--ds-decoration": String(clamp01(appearance.decoration ?? 0.8)),
      "--ds-fx-particles": String(clamp01(effects.particles ?? 0)),
      "--ds-fx-aurora": String(clamp01(effects.aurora ?? 0)),
      "--ds-fx-glow": String(clamp01(effects.glow ?? 0)),
      "--ds-fx-noise": String(clamp01(effects.noise ?? 0)),
      "--ds-fx-grid": String(clamp01(effects.grid ?? 0)),
      "--ds-fx-float": String(clamp01(effects.float ?? 0)),
      "--dream-skin-name": cssString(THEME.name || "Codex Theme"),
      "--dream-skin-tagline": cssString(THEME.tagline || "把喜欢的画面变成可交互的 Codex 工作台。"),
      "--dream-skin-project-prefix": cssString(copy.projectPrefix || "选择项目 · "),
      "--dream-skin-project-label": cssString(copy.projectLabel || "◉  选择项目"),
      "--dream-skin-status-text": cssString(copy.statusText || "THEME ONLINE"),
      "--dream-skin-quote": cssString(copy.quote || "MAKE SOMETHING WONDERFUL"),
      "--dream-skin-brand-subtitle": cssString(copy.brandSubtitle || "CODEX THEMES"),
    };
  };

  const applyTheme = (root, shell) => {
    const variables = compileVariables(shell);
    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === "string") root.style.setProperty(name, value);
    }
  };

  /**
   * Replace Codex's generic oversized home headline with the theme's compact
   * welcome conversation. The real suggestion cards and composer stay in the
   * Codex tree, so this decoration never impersonates an app control.
   */
  const ensureMoonlitWelcome = (home) => {
    const existingPanels = [...document.querySelectorAll(`#${MOONLIT_WELCOME_ID}`)];
    if (THEME.id !== "moonlit-immortal" || !home) {
      existingPanels.forEach((panel) => panel.remove());
      return;
    }

    const hero = home.firstElementChild?.firstElementChild?.firstElementChild;
    const content = hero?.firstElementChild?.firstElementChild;
    if (!(content instanceof HTMLElement)) return;

    existingPanels.forEach((panel) => {
      if (panel.parentElement !== content) panel.remove();
    });
    let panel = content.querySelector(`#${MOONLIT_WELCOME_ID}`);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = MOONLIT_WELCOME_ID;
      panel.className = "dream-skin-moonlit-welcome";
      panel.setAttribute("aria-label", "曜月谪仙主题欢迎面板");
      panel.innerHTML = `
        <header class="dream-skin-moonlit-welcome__header">
          <img class="dream-skin-moonlit-welcome__sigil" alt="">
          <b>曜月谪仙</b>
          <span class="dream-skin-moonlit-welcome__rule" aria-hidden="true"></span>
        </header>
        <div class="dream-skin-moonlit-welcome__intro">
          <img alt="曜月谪仙角色头像">
          <p>在月华与云海之间，我将与你共编灵动之代码。</p>
          <time>10:36</time>
        </div>
        <pre class="dream-skin-moonlit-welcome__code" aria-label="ImmortalConfig 示例代码"><code>
<span class="dream-skin-moonlit-welcome__line"><b>01</b><span><i class="is-keyword">interface</i> ImmortalConfig {</span></span>
<span class="dream-skin-moonlit-welcome__line"><b>02</b><span>  realm: <i class="is-string">\"xian\"</i>;</span></span>
<span class="dream-skin-moonlit-welcome__line"><b>03</b><span>  virtue: number;</span></span>
<span class="dream-skin-moonlit-welcome__line"><b>04</b><span>  spirit: number;</span></span>
<span class="dream-skin-moonlit-welcome__line"><b>05</b><span>  swordIntent: string;</span></span>
<span class="dream-skin-moonlit-welcome__line"><b>06</b><span>  skills: string[];</span></span>
<span class="dream-skin-moonlit-welcome__line"><b>07</b><span>}</span></span>
<span class="dream-skin-moonlit-welcome__line"><b>08</b><span>&nbsp;</span></span>
<span class="dream-skin-moonlit-welcome__line"><b>09</b><span><i class="is-keyword">const</i> cultivate = (cfg: ImmortalConfig) =&gt; {</span></span>
<span class="dream-skin-moonlit-welcome__line"><b>10</b><span>  <i class="is-keyword">return</i> ascend(cfg)</span></span>
<span class="dream-skin-moonlit-welcome__line"><b>11</b><span>}</span></span>
        </code></pre>
        <footer class="dream-skin-moonlit-welcome__footer">
          <img class="dream-skin-moonlit-welcome__state" alt="">
          <span>已完成修炼核心逻辑，助你踏月而行，登临绝巅。</span>
          <time>10:37</time>
        </footer>`;
      content.appendChild(panel);
    }
    panel.querySelectorAll("img").forEach((image) => {
      if (image.getAttribute("src") !== stampUrl) image.setAttribute("src", stampUrl);
    });
  };

  /**
   * Blue Window replaces the generic Codex landing composition with a compact
   * 2007-style welcome portal. The visible controls proxy the real Codex home
   * controls underneath, so suggestions, composer submission and task links
   * continue to use the app's own behavior instead of becoming static chrome.
   *
   * The custom composer also mirrors native composer controls (attachments,
   * model selector, permission level, dictation and voice chat) so users do not
   * lose capabilities while using the themed home.
   */
  const ensureBlueWindowHome = (home) => {
    const existingPanels = [...document.querySelectorAll(`#${BLUE_WINDOW_HOME_ID}`)];
    if (THEME.id !== "blue-window-messenger" || !home) {
      existingPanels.forEach((panel) => panel.remove());
      return;
    }

    existingPanels.forEach((panel) => {
      if (panel.parentElement !== home) panel.remove();
    });

    let panel = home.querySelector(`:scope > #${BLUE_WINDOW_HOME_ID}`);

    const labelOf = (node) => `${node.getAttribute("aria-label") || ""} ${node.title || ""} ${node.textContent || ""}`;

    const findNativeSend = () => {
      const buttons = [...home.querySelectorAll("button")]
        .filter((button) => !button.closest(`#${BLUE_WINDOW_HOME_ID}`));
      return buttons.find((button) => /send|submit|发送|提交/i.test(labelOf(button))) || null;
    };

    const findNativeComposerControl = (type) => {
      const composer = home.querySelector(".composer-surface-chrome");
      if (!composer) return null;
      const buttons = [...composer.querySelectorAll("button")]
        .filter((button) => !button.closest(`#${BLUE_WINDOW_HOME_ID}`));
      switch (type) {
        case "attach":
          return buttons.find((b) => /添加文件|附件|attach|file/i.test(labelOf(b))) || null;
        case "permission":
          return buttons.find((b) => /完全访问|full.access|权限|permission|access/i.test(labelOf(b))) || null;
        case "model":
          return buttons.find((b) => /\b(GPT|Codex|Spark|o3|Claude|Sonnet|模型|model)\b/i.test(labelOf(b))) || null;
        case "dictate":
          return buttons.find((b) => /听写|dictate|语音输入|voice.input/i.test(labelOf(b))) || null;
        case "voice":
          return buttons.find((b) => /语音聊天|voice.chat|开始新的/i.test(labelOf(b))) || null;
        default:
          return null;
      }
    };

    const findNativeProjectControl = (type) => {
      const shell =
        document.querySelector("main.main-surface") ||
        document.querySelector('main[class*="_MainContentSurface_"]') ||
        document.querySelector("main");
      const candidates = [...(shell?.querySelectorAll("button") || [])]
        .filter((button) => !button.closest(`#${BLUE_WINDOW_HOME_ID}`));
      switch (type) {
        case "project":
          return candidates.find((b) => /切换项目|switch.project/i.test(b.getAttribute("aria-label") || "")) || null;
        case "clear-project":
          return candidates.find((b) => /不在项目中工作|clear.project/i.test(labelOf(b))) || null;
        case "local-mode":
          return candidates.find((b) => /本地模式|local/i.test(labelOf(b))) || null;
        case "branch":
          return candidates.find((b) => /^main$/.test((b.textContent || "").trim())) || null;
        default:
          return null;
      }
    };

    if (!panel) {
      panel = document.createElement("section");
      panel.id = BLUE_WINDOW_HOME_ID;
      panel.className = "dream-skin-blue-window-home";
      panel.setAttribute("aria-label", "蓝窗信使欢迎工作台");
      panel.innerHTML = `
        <section class="blue-window-home__hero">
          <img class="blue-window-home__mascot" alt="Codex 小蓝">
          <div class="blue-window-home__hero-copy">
            <h1>欢迎回来，苍何</h1>
            <p>今天想和 Codex 一起做什么？</p>
            <button type="button" class="blue-window-home__primary">新建任务 <span aria-hidden="true">›</span></button>
          </div>
        </section>
        <section class="blue-window-home__section blue-window-home__quick-section">
          <h2>快速开始</h2>
          <div class="blue-window-home__quick-actions">
            <button type="button" data-suggestion-index="0"><span class="blue-window-home__action-icon"></span><b>探索并理解代码</b></button>
            <button type="button" data-suggestion-index="1"><span class="blue-window-home__action-icon"></span><b>构建新功能</b></button>
            <button type="button" data-suggestion-index="2"><span class="blue-window-home__action-icon"></span><b>审查代码</b></button>
            <button type="button" data-suggestion-index="3"><span class="blue-window-home__action-icon"></span><b>修复问题</b></button>
          </div>
        </section>
        <section class="blue-window-home__section blue-window-home__continue-section">
          <h2>继续工作</h2>
          <div class="blue-window-home__recent-list">
            <button type="button" data-task-target="检查主图主题定制"><span class="blue-window-home__recent-icon"></span><b>codex-themes</b><i>/</i><span>主题配置优化</span><small>刚刚</small></button>
            <button type="button" data-task-target="codex-themes"><span class="blue-window-home__recent-icon"></span><b>codex-themes</b><i>/</i><span>sidebar-enhancement.ts</span><small>2 小时前</small></button>
            <button type="button" data-task-target="README.md"><span class="blue-window-home__recent-icon"></span><b>codex-themes</b><i>/</i><span>README.md</span><small>昨天</small></button>
          </div>
        </section>
        <section class="blue-window-home__composer-zone">
          <div class="blue-window-home__project-context">
            <button type="button" data-project-target="codex-themes"><span class="blue-window-home__context-icon"></span><b>codex-themes</b></button>
            <button type="button" data-native-action="clear-project" title="不在项目中工作">×</button>
            <button type="button" data-native-action="local-mode" title="本地模式">本地</button>
            <button type="button" data-native-action="branch" title="分支">main</button>
          </div>
          <div class="blue-window-home__composer-actions">
            <button type="button" data-native-action="attach" title="添加文件等内容"><span class="blue-window-home__composer-action-icon"></span><span class="blue-window-home__composer-action-label">附件</span></button>
            <button type="button" data-native-action="permission" title="完全访问"><span class="blue-window-home__composer-action-icon"></span><span class="blue-window-home__composer-action-label">完全访问</span></button>
            <button type="button" data-native-action="model" title="选择模型"><span class="blue-window-home__composer-action-icon"></span><span class="blue-window-home__composer-action-label">模型</span></button>
            <button type="button" data-native-action="dictate" title="听写"><span class="blue-window-home__composer-action-icon"></span><span class="blue-window-home__composer-action-label">听写</span></button>
            <button type="button" data-native-action="voice" title="开始新的语音聊天"><span class="blue-window-home__composer-action-icon"></span><span class="blue-window-home__composer-action-label">语音</span></button>
          </div>
          <div class="blue-window-home__composer">
            <textarea rows="1" aria-label="告诉 Codex 你想完成什么" placeholder="告诉 Codex 你想完成什么…"></textarea>
            <button type="button" class="blue-window-home__send" aria-label="发送任务"><span class="blue-window-home__send-label">发送</span><span class="blue-window-home__send-icon"></span></button>
          </div>
        </section>`;
      home.appendChild(panel);

      const findNativeComposer = () => [...home.querySelectorAll('textarea, [contenteditable="true"]')]
        .find((candidate) => !candidate.closest(`#${BLUE_WINDOW_HOME_ID}`));

      const syncNativeComposer = (value) => {
        const nativeComposer = findNativeComposer();
        if (!nativeComposer) return null;
        if (nativeComposer instanceof HTMLTextAreaElement || nativeComposer instanceof HTMLInputElement) {
          const prototype = nativeComposer instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
          if (setter) setter.call(nativeComposer, value);
          else nativeComposer.value = value;
        } else {
          nativeComposer.textContent = value;
        }
        nativeComposer.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: value,
        }));
        return nativeComposer;
      };

      const focusComposer = () => {
        const input = panel.querySelector("textarea");
        input?.focus();
      };

      panel.querySelector(".blue-window-home__primary")?.addEventListener("click", focusComposer);
      panel.querySelector(".blue-window-home__composer textarea")?.addEventListener("input", (event) => {
        syncNativeComposer(event.currentTarget.value);
      });

      const submitComposer = () => {
        const input = panel.querySelector(".blue-window-home__composer textarea");
        const value = input?.value?.trim() || "";
        if (!value) {
          focusComposer();
          return;
        }
        const nativeComposer = syncNativeComposer(value);
        const nativeSend = findNativeSend();
        if (nativeSend) nativeSend.click();
        else if (nativeComposer) {
          nativeComposer.focus();
          nativeComposer.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            bubbles: true,
            metaKey: true,
          }));
        }
        input.value = "";
      };

      panel.querySelector(".blue-window-home__send")?.addEventListener("click", submitComposer);
      panel.querySelector(".blue-window-home__composer textarea")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submitComposer();
        }
      });

      panel.querySelectorAll("[data-suggestion-index]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.getAttribute("data-suggestion-index"));
          const originals = [...home.querySelectorAll('.group\\/home-suggestions button')]
            .filter((candidate) => !candidate.closest(`#${BLUE_WINDOW_HOME_ID}`));
          if (originals[index]) originals[index].click();
          else focusComposer();
        });
      });

      panel.querySelectorAll("[data-task-target]").forEach((button) => {
        button.addEventListener("click", () => {
          const target = button.getAttribute("data-task-target") || "";
          const original = [...document.querySelectorAll("button, a")].find((candidate) =>
            !candidate.closest(`#${BLUE_WINDOW_HOME_ID}`) &&
            (candidate.textContent || "").includes(target));
          if (original instanceof HTMLElement) original.click();
        });
      });

      panel.querySelector("[data-project-target]")?.addEventListener("click", () => {
        const original = findNativeProjectControl("project") ||
          [...document.querySelectorAll("button")].find((candidate) =>
            !candidate.closest(`#${BLUE_WINDOW_HOME_ID}`) &&
            (candidate.textContent || "").includes("codex-themes"));
        if (original instanceof HTMLElement) original.click();
      });

      panel.querySelectorAll("[data-native-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const action = button.getAttribute("data-native-action") || "";
          const target = findNativeComposerControl(action) || findNativeProjectControl(action);
          if (target instanceof HTMLElement) target.click();
        });
      });
    }

    const mascot = panel.querySelector(".blue-window-home__mascot");
    if (mascot?.getAttribute("src") !== artUrl) mascot?.setAttribute("src", artUrl);

    const originalSuggestions = [...home.querySelectorAll('.group\\/home-suggestions button')]
      .filter((candidate) => !candidate.closest(`#${BLUE_WINDOW_HOME_ID}`));
    const sidebar = document.querySelector("aside.app-shell-left-panel");
    const fallbackIcons = [...(sidebar?.querySelectorAll("svg") || [])];
    panel.querySelectorAll("[data-suggestion-index]").forEach((button) => {
      const iconSlot = button.querySelector(".blue-window-home__action-icon");
      const index = Number(button.getAttribute("data-suggestion-index"));
      const sourceIcon = originalSuggestions[index]?.querySelector("svg") ??
        fallbackIcons[(index + 1) % Math.max(fallbackIcons.length, 1)];
      if (iconSlot && sourceIcon && !iconSlot.querySelector("svg")) {
        iconSlot.appendChild(sourceIcon.cloneNode(true));
      }
    });

    const projectText = [...(sidebar?.querySelectorAll("*") || [])].find((candidate) =>
      candidate.children.length === 0 && (candidate.textContent || "").trim() === "codex-themes");
    const projectTextRect = projectText?.getBoundingClientRect();
    const projectRow = projectText?.closest('button, a, [role="button"]');
    const projectRowIcons = projectTextRect
      ? [...(projectRow?.querySelectorAll("svg") || [])]
          .filter((icon) => icon.getBoundingClientRect().right <= projectTextRect.left + 4)
          .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
      : [];
    const projectLineIcons = projectTextRect
      ? fallbackIcons.filter((icon) => {
          const rect = icon.getBoundingClientRect();
          const iconCenter = rect.top + rect.height / 2;
          const textCenter = projectTextRect.top + projectTextRect.height / 2;
          return Math.abs(iconCenter - textCenter) <= 12;
        }).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      : [];
    const selectedProjectIcon = projectRowIcons[0] ?? projectLineIcons[0] ?? sidebar?.querySelector(
      '[aria-current="page"] svg, [class~="bg-token-list-hover-background"] svg',
    );
    const contextSourceIcon = selectedProjectIcon ??
      projectText?.closest("button")?.querySelector("svg") ??
      projectText?.parentElement?.querySelector("svg") ??
      [...document.querySelectorAll("button, a")].find((candidate) =>
        !candidate.closest(`#${BLUE_WINDOW_HOME_ID}`) &&
        (candidate.textContent || "").includes("codex-themes"))?.querySelector("svg") ??
      fallbackIcons[0];
    const contextSlot = panel.querySelector(".blue-window-home__context-icon");
    if (contextSlot && contextSourceIcon && !contextSlot.querySelector("svg")) {
      contextSlot.appendChild(contextSourceIcon.cloneNode(true));
    }
    panel.querySelectorAll(".blue-window-home__recent-icon").forEach((slot) => {
      if (contextSourceIcon && !slot.querySelector("svg")) slot.appendChild(contextSourceIcon.cloneNode(true));
    });

    const nativeSendIcon = findNativeSend()?.querySelector("svg");
    const sendIconSlot = panel.querySelector(".blue-window-home__send-icon");
    if (sendIconSlot && nativeSendIcon && !sendIconSlot.querySelector("svg")) {
      sendIconSlot.appendChild(nativeSendIcon.cloneNode(true));
      panel.querySelector(".blue-window-home__send")?.classList.add("has-icon");
    }

    panel.querySelectorAll("[data-native-action]").forEach((button) => {
      const action = button.getAttribute("data-native-action") || "";
      const native = findNativeComposerControl(action) || findNativeProjectControl(action);
      if (!native) return;
      const iconSlot = button.querySelector(".blue-window-home__composer-action-icon");
      const nativeIcon = native.querySelector("svg");
      if (iconSlot && nativeIcon && !iconSlot.querySelector("svg")) {
        iconSlot.appendChild(nativeIcon.cloneNode(true));
      }
      if (action === "model") {
        const label = button.querySelector(".blue-window-home__composer-action-label");
        if (label) {
          const short = (native.textContent || "").trim().split(/\s+/)[0];
          label.textContent = short || "模型";
        }
      }
    });
  };

  const syncCinematicPlayback = () => {
    const layer = document.getElementById(MOTION_ID);
    const video = layer?.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const shouldPause =
      document.hidden ||
      !document.hasFocus() ||
      reduceMotion ||
      layer?.getAttribute("data-motion-error") === "true";
    if (shouldPause) {
      video.pause();
      return;
    }
    if (video.paused) {
      video.play().catch(() => {
        layer?.setAttribute("data-motion-error", "true");
      });
    }
  };

  /**
   * Cinematic Live keeps the Codex message list and composer intact, then
   * frames them with a full-window motion layer and a small home-only control
   * surface. The visible buttons focus the native composer or replay the loop.
   */
  const ensureCinematicLive = (shellMain, home) => {
    const enabled = THEME.layout === "cinematic-live" && shellMain && document.body;
    if (!enabled) {
      document.getElementById(MOTION_ID)?.remove();
      document.getElementById(CINEMATIC_UI_ID)?.remove();
      return;
    }

    let layer = document.getElementById(MOTION_ID);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = MOTION_ID;
      layer.setAttribute("aria-hidden", "true");
      layer.innerHTML = `
        <div class="dream-skin-cinematic-poster"></div>
        <video class="dream-skin-cinematic-video" autoplay muted loop playsinline preload="metadata"></video>
        <div class="dream-skin-cinematic-shade"></div>`;
      document.body.appendChild(layer);

      const poster = layer.querySelector(".dream-skin-cinematic-poster");
      if (poster && motionPosterUrl) {
        poster.style.backgroundImage = `url("${motionPosterUrl}")`;
      }
      const video = layer.querySelector("video");
      if (video instanceof HTMLVideoElement) {
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        if (motionPosterUrl) video.poster = motionPosterUrl;
        if (motionUrl) {
          video.src = motionUrl;
        } else {
          layer.setAttribute("data-motion-error", "true");
        }
        video.addEventListener("loadeddata", () => {
          layer?.removeAttribute("data-motion-error");
          syncCinematicPlayback();
        });
        video.addEventListener("error", () => {
          layer?.setAttribute("data-motion-error", "true");
          video.pause();
        });
      }
    }

    let ui = document.getElementById(CINEMATIC_UI_ID);
    if (!ui) {
      ui = document.createElement("section");
      ui.id = CINEMATIC_UI_ID;
      ui.setAttribute("aria-label", "夜语伴生主题控制");
      ui.innerHTML = `
        <header class="dream-skin-cinematic-topline">
          <span><i></i> OBJECT LIVE</span>
          <b>NIGHTBOUND COMPANION</b>
        </header>
        <div class="dream-skin-cinematic-transcript">
          <small>LIVE TRANSCRIPT</small>
          <p>夜语伴生已就绪。告诉我你想完成的任务。</p>
        </div>
        <div class="dream-skin-cinematic-actions">
          <button type="button" data-cinematic-action="start">
            <span>开始对话</span><i>ENTER</i>
          </button>
          <button type="button" data-cinematic-action="replay">重播氛围</button>
        </div>`;
      document.body.appendChild(ui);

      ui.querySelector('[data-cinematic-action="start"]')?.addEventListener("click", () => {
        const composer =
          shellMain.querySelector(".composer-surface-chrome textarea") ||
          shellMain.querySelector('.composer-surface-chrome [contenteditable="true"]') ||
          shellMain.querySelector('[class*="_ComposerLayoutRoot_"] textarea') ||
          shellMain.querySelector('[class*="_ComposerLayoutRoot_"] [contenteditable="true"]') ||
          shellMain.querySelector("textarea") ||
          shellMain.querySelector('[contenteditable="true"]');
        if (composer instanceof HTMLElement) {
          composer.focus();
          composer.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      });
      ui.querySelector('[data-cinematic-action="replay"]')?.addEventListener("click", () => {
        const video = document.querySelector(`#${MOTION_ID} video`);
        if (!(video instanceof HTMLVideoElement)) return;
        video.currentTime = 0;
        video.play().catch(() => {});
      });
    }

    const shellBox = shellMain.getBoundingClientRect();
    for (const node of [layer, ui]) {
      if (!(node instanceof HTMLElement)) continue;
      node.style.left = `${Math.round(shellBox.left)}px`;
      node.style.top = `${Math.round(shellBox.top)}px`;
      node.style.width = `${Math.round(shellBox.width)}px`;
      node.style.height = `${Math.round(shellBox.height)}px`;
    }
    ui.classList.toggle("is-home", Boolean(home));
    ui.classList.toggle("is-task", !home);
    syncCinematicPlayback();
  };

  /**
   * Remove only the visual layer while keeping the observer and blob URLs
   * alive. This lets a manual ChatGPT/Work -> Codex switch restore the theme
   * without another restart, while never styling non-Codex conversations.
   */
  const clearVisuals = () => {
    const root = document.documentElement;
    root?.classList.remove("codex-dream-skin");
    [...(root?.classList || [])].forEach((cls) => {
      if (cls.startsWith("codex-dream-skin--")) root.classList.remove(cls);
    });
    root?.removeAttribute(SHELL_ATTR);
    root?.removeAttribute("data-dream-layout");
    root?.removeAttribute("data-dream-theme");
    root?.removeAttribute("data-dream-wallpaper");
    root?.removeAttribute("data-dream-native-layout");
    root?.style.removeProperty("--dream-skin-art");
    root?.style.removeProperty("--dream-skin-wallpaper");
    const vars = compileVariables("light");
    for (const name of Object.keys(vars)) root?.style.removeProperty(name);
    document.querySelectorAll(".dream-skin-home").forEach((node) => node.classList.remove("dream-skin-home"));
    document.querySelectorAll(".dream-skin-home-shell").forEach((node) => node.classList.remove("dream-skin-home-shell"));
    document.querySelectorAll(".dream-skin-main-surface").forEach((node) => node.classList.remove("dream-skin-main-surface"));
    document.querySelectorAll(".dream-skin-composer").forEach((node) => node.classList.remove("dream-skin-composer"));
    document.querySelectorAll(".dream-skin-role-main").forEach((node) => node.classList.remove("dream-skin-role-main"));
    document.getElementById(MOONLIT_WELCOME_ID)?.remove();
    document.getElementById(BLUE_WINDOW_HOME_ID)?.remove();
    document.getElementById(MOTION_ID)?.remove();
    document.getElementById(CINEMATIC_UI_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
  };

  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamSkinVersion = VERSION;
  }

  const ensure = () => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    const productMode = detectProductMode();
    if (window[STATE_KEY]) window[STATE_KEY].productMode = productMode;
    if (productMode === "chatgpt") {
      clearVisuals();
      return;
    }
    const shell = detectShellMode();
    const layout = THEME.layout || "dream-banner";
    root.classList.add("codex-dream-skin");
    root.classList.remove(...LAYOUT_CLASSES);
    root.classList.add(`codex-dream-skin--${layout}`);
    root.classList.toggle("codex-dream-skin--dark", shell === "dark");
    root.classList.toggle("codex-dream-skin--light", shell === "light");
    root.setAttribute(SHELL_ATTR, shell);
    root.setAttribute("data-dream-layout", layout);
    root.setAttribute("data-dream-theme", THEME.id || "theme");
    root.setAttribute("data-dream-wallpaper", THEME.wallpaper?.enabled ? "true" : "false");
    root.setAttribute("data-dream-native-layout", PRESERVE_NATIVE_LAYOUT ? "true" : "false");
    try {
      root.setAttribute("data-dream-rail-collapsed", localStorage.getItem("codex-dream-skin-rail-collapsed") === "true" ? "true" : "false");
    } catch {
      root.setAttribute("data-dream-rail-collapsed", "false");
    }
    root.style.setProperty("--dream-skin-art", `url("${artUrl}")`);
    if (wallpaperUrl) {
      root.style.setProperty("--dream-skin-wallpaper", `url("${wallpaperUrl}")`);
    } else {
      root.style.removeProperty("--dream-skin-wallpaper");
    }
    applyTheme(root, shell);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamSkinVersion !== VERSION) {
      style.textContent = cssText;
      style.dataset.dreamSkinVersion = VERSION;
    }

    const shellMain =
      document.querySelector("main.main-surface") ||
      document.querySelector('main[class*="_MainContentSurface_"]') ||
      document.querySelector("main");
    const mainContentSurface =
      (shellMain?.matches('main[class*="_MainContentSurface_"]') ? shellMain : null) ||
      shellMain?.querySelector('main[class*="_MainContentSurface_"]') ||
      shellMain?.querySelector('[class*="_MainContentFrame_"]') ||
      shellMain?.querySelector('[class*="_MainContentViewport_"]') ||
      shellMain;
    const isRenderedElement = (node) => {
      if (!(node instanceof Element) || !node.isConnected) return false;
      if (node.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || node.getClientRects().length === 0) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse" &&
        Number(style.opacity || "1") > 0;
    };
    const homeCandidates = shellMain
      ? [
          ...(shellMain.matches('[role="main"]') ? [shellMain] : []),
          ...shellMain.querySelectorAll('[role="main"]'),
          ...(mainContentSurface ? [mainContentSurface] : []),
        ]
      : [];
    const visibleTaskContent = shellMain
      ? [
          ...shellMain.querySelectorAll(
            '.thread-scroll-container, [data-message-author-role], article, .message, [data-testid*="conversation-turn"]',
          ),
        ].some(isRenderedElement)
      : false;
    const home = homeCandidates.find((candidate) => {
      const visibleBlueWindowHome = THEME.id === "blue-window-messenger" &&
        isRenderedElement(candidate.querySelector(`:scope > #${BLUE_WINDOW_HOME_ID}`));
      const cinematicUi = document.getElementById(CINEMATIC_UI_ID);
      const visibleCinematicHome = THEME.layout === "cinematic-live" &&
        cinematicUi?.classList.contains("is-home") &&
        isRenderedElement(cinematicUi);
      const visibleThemeHome = visibleBlueWindowHome || Boolean(visibleCinematicHome);
      return isActiveHomeSurface({
        withinShell: candidate === shellMain || Boolean(shellMain?.contains(candidate)),
        connected: candidate.isConnected,
        rendered: isRenderedElement(candidate),
        visibleThemeHome,
        visibleGameSource: isRenderedElement(candidate.querySelector('[data-feature="game-source"]')),
        visibleSuggestions: isRenderedElement(candidate.querySelector('.group\\/home-suggestions')),
        visibleTaskContent,
      });
    }) || null;
    const layoutHome = PRESERVE_NATIVE_LAYOUT ? null : home;
    if (shellMain) shellMain.classList.add("dream-skin-main-surface");
    if (mainContentSurface && mainContentSurface !== shellMain) {
      mainContentSurface.classList.add("dream-skin-role-main");
    }
    const composerRoot =
      document.querySelector(".composer-surface-chrome") ||
      shellMain?.querySelector('[class*="_ComposerLayoutRoot_"]') ||
      shellMain?.querySelector('.ProseMirror')?.closest('[class*="_Composer"]') ||
      shellMain?.querySelector('[contenteditable="true"]')?.closest('[class*="_Composer"]');
    if (composerRoot instanceof HTMLElement) composerRoot.classList.add("dream-skin-composer");

    for (const candidate of document.querySelectorAll('[role="main"].dream-skin-home, .dream-skin-role-main.dream-skin-home')) {
      if (candidate !== layoutHome) candidate.classList.remove("dream-skin-home");
    }
    if (layoutHome) layoutHome.classList.add("dream-skin-home");
    ensureMoonlitWelcome(layoutHome);
    ensureBlueWindowHome(layoutHome);

    if (!shellMain || !document.body) {
      ensureCinematicLive(null, null);
      return;
    }
    ensureCinematicLive(shellMain, home);
    shellMain.classList.toggle("dream-skin-home-shell", Boolean(home));
    let chrome = document.getElementById(CHROME_ID);
    const chromeIsCurrent = Boolean(
      chrome?.querySelector(".dream-skin-composer-stamp img") &&
      chrome?.querySelector(".dream-skin-retro-mascot") &&
      chrome?.querySelector(".dream-skin-retro-friend-avatar") &&
      chrome?.querySelector(".dream-skin-retro-friend-search") &&
      chrome?.querySelector(".dream-skin-silk-shell"),
    );
    if (!chrome || !chromeIsCurrent || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <div class="dream-skin-brand">
          <span class="dream-skin-portal-mark">✦</span>
          <span><b></b><small></small></span>
        </div>
        <div class="dream-skin-status"><i></i><span></span></div>
        <div class="dream-skin-quote"></div>
        <div class="dream-skin-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="dream-skin-orbit"></div>
        <div class="dream-skin-hero-art-name"></div>
        <span class="dream-skin-corner dream-skin-corner-tl">✦</span>
        <span class="dream-skin-corner dream-skin-corner-tr">❀</span>
        <span class="dream-skin-corner dream-skin-corner-bl">✧</span>
        <span class="dream-skin-corner dream-skin-corner-br">♡</span>
        <div class="dream-skin-washi"></div>
        <div class="dream-skin-composer-stamp"><img alt=""><span></span></div>
        <div class="dream-skin-silk-shell">
          <div class="dream-skin-silk-heading">
            <small></small>
            <b>今天想展开哪一卷灵感？</b>
            <span></span>
          </div>
          <div class="dream-skin-silk-tabs">
            <span>theme.json</span><span>preview.tsx</span><span>skin.css</span>
            <span>verify.test.ts</span><span>release.md</span>
          </div>
          <div class="dream-skin-silk-status"><span></span><i>镜湖卷 · 本地主题</i><b></b></div>
        </div>
        <div class="dream-skin-retro-shell">
          <div class="dream-skin-retro-titlebar">
            <b class="dream-skin-retro-title"></b>
            <span>主题工作台</span>
            <button type="button" class="dream-skin-retro-rail-toggle" aria-label="收起好友栏">收起</button>
          </div>
          <div class="dream-skin-retro-toolbar">
            <span data-rail-action="new-task">新建任务</span><span data-rail-action="scheduled">已安排</span><span data-rail-action="extensions">插件</span>
            <span data-rail-action="sites">站点</span><span data-rail-action="pull-requests">拉取请求</span><span data-rail-action="chat">聊天</span>
          </div>
          <aside class="dream-skin-retro-rail">
            <section class="dream-skin-retro-profile">
              <header>Codex 好友</header>
              <div class="dream-skin-retro-mascot-stage">
                <img class="dream-skin-retro-mascot" alt="">
              </div>
              <div class="dream-skin-retro-profile-copy">
                <b><i></i> Codex 小蓝 <em>LV 07</em></b>
                <p>代码有问题？找我！<br>我是你的智能伙伴 Codex<br>陪你写代码、改 Bug、查文档。</p>
              </div>
              <nav><span data-rail-action="messages">消息</span><span data-rail-action="collections">收藏</span><span data-rail-action="mail">邮件</span><span data-rail-action="friends">好友</span><span data-rail-action="files">文件</span></nav>
            </section>
            <section class="dream-skin-retro-friends">
              <header>我的好友 (2/8)</header>
              <div class="dream-skin-retro-friend-card">
                <img class="dream-skin-retro-friend-avatar" alt="">
                <span><b>设计伙伴</b><small><i></i> 在线 · 一起打磨主题</small></span>
              </div>
              <p><i></i><span><b>代码助手</b><small>正在检查变更</small></span></p>
              <p><i></i><span><b>本地终端</b><small>命令执行完毕</small></span></p>
            </section>
            <div class="dream-skin-retro-friend-search">查找好友…</div>
            <div class="dream-skin-retro-rail-status">安全 · 在线&nbsp;&nbsp;22:48</div>
          </aside>
        </div>`;
      document.body.appendChild(chrome);

      const railToggle = chrome.querySelector(".dream-skin-retro-rail-toggle");
      if (railToggle) {
        const updateToggle = () => {
          const collapsed = root.getAttribute("data-dream-rail-collapsed") === "true";
          railToggle.textContent = collapsed ? "展开" : "收起";
          railToggle.setAttribute("aria-label", collapsed ? "展开好友栏" : "收起好友栏");
        };
        updateToggle();
        railToggle.addEventListener("click", () => {
          const collapsed = root.getAttribute("data-dream-rail-collapsed") === "true";
          const next = !collapsed;
          root.setAttribute("data-dream-rail-collapsed", next ? "true" : "false");
          try { localStorage.setItem("codex-dream-skin-rail-collapsed", next ? "true" : "false"); } catch {}
          updateToggle();
        });
      }

      const railActionLabel = (node) => `${node.getAttribute("aria-label") || ""} ${node.title || ""} ${node.textContent || ""}`;
      const railActionPatterns = {
        "new-task": /^(新建任务|New task)$/i,
        "scheduled": /^(已安排|Scheduled)$/i,
        "extensions": /^(插件|Extensions|Plugins)$/i,
        "sites": /^(站点|Sites)$/i,
        "pull-requests": /^(拉取请求|Pull requests)$/i,
        "chat": /^(聊天|Chat|Quick chat)$/i,
        "messages": /^(消息|Messages|聊天|Chat)$/i,
        "collections": /^(收藏|Collections)$/i,
        "mail": /^(邮件|Mail)$/i,
        "friends": /^(好友|Friends)$/i,
        "files": /^(文件|Files)$/i,
      };
      chrome.querySelectorAll("[data-rail-action]").forEach((node) => {
        node.style.cursor = "pointer";
        node.addEventListener("click", () => {
          const action = node.getAttribute("data-rail-action");
          const pattern = railActionPatterns[action];
          if (!pattern) return;
          const sidebar = document.querySelector("aside.app-shell-left-panel");
          const target = [...(sidebar?.querySelectorAll("button, a, [role=\"button\"]") || [])].find((b) =>
            pattern.test(railActionLabel(b)));
          if (target instanceof HTMLElement) target.click();
        });
      });
    }
    const copy = THEME.copy || {};
    chrome.querySelector(".dream-skin-brand b").textContent = THEME.name || "Codex Dream Skin";
    chrome.querySelector(".dream-skin-brand small").textContent = copy.brandSubtitle || "CODEX DREAM SKIN";
    chrome.querySelector(".dream-skin-status span").textContent = copy.statusText || "DREAM SKIN ONLINE";
    chrome.querySelector(".dream-skin-quote").textContent = copy.quote || "MAKE SOMETHING WONDERFUL";
    const themeName = THEME.name || "Codex Dream Skin";
    chrome.querySelector(".dream-skin-hero-art-name").textContent =
      /[A-Za-z][A-Za-z' ]+/.exec(themeName)?.[0].trim() || themeName;
    const stampImg = chrome.querySelector(".dream-skin-composer-stamp img");
    if (stampImg.getAttribute("src") !== stampUrl) stampImg.setAttribute("src", stampUrl);
    chrome.querySelector(".dream-skin-composer-stamp span").textContent = copy.quote || "MAKE SOMETHING WONDERFUL";
    chrome.querySelector(".dream-skin-silk-heading small").textContent = copy.brandSubtitle || "MIRROR LAKE RIBBON";
    chrome.querySelector(".dream-skin-silk-heading span").textContent = THEME.tagline || "一卷湖光，写尽风华。";
    chrome.querySelector(".dream-skin-silk-status span").textContent = copy.statusText || "湖光正明";
    chrome.querySelector(".dream-skin-silk-status b").textContent = copy.quote || "一卷湖光，写尽风华";
    chrome.querySelector(".dream-skin-retro-title").textContent = `Codex 2007 - ${THEME.name || "蓝窗信使"}`;
    const railToggle = chrome.querySelector(".dream-skin-retro-rail-toggle");
    if (railToggle) {
      const collapsed = root.getAttribute("data-dream-rail-collapsed") === "true";
      railToggle.textContent = collapsed ? "展开" : "收起";
      railToggle.setAttribute("aria-label", collapsed ? "展开好友栏" : "收起好友栏");
    }
    const retroMascot = chrome.querySelector(".dream-skin-retro-mascot");
    if (retroMascot.getAttribute("src") !== artUrl) retroMascot.setAttribute("src", artUrl);
    const retroFriendAvatar = chrome.querySelector(".dream-skin-retro-friend-avatar");
    if (retroFriendAvatar.getAttribute("src") !== stampUrl) retroFriendAvatar.setAttribute("src", stampUrl);
    const shellBox = shellMain.getBoundingClientRect();
    chrome.style.left = `${Math.round(shellBox.left)}px`;
    chrome.style.top = `${Math.round(shellBox.top)}px`;
    chrome.style.width = `${Math.round(shellBox.width)}px`;
    chrome.style.height = `${Math.round(shellBox.height)}px`;
    chrome.classList.toggle("dream-skin-home-shell", Boolean(home));
    chrome.dataset.dreamShell = shell;
  };

  const cleanup = () => {
    window[DISABLED_KEY] = true;
    clearVisuals();
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.reducedMotionHandler && state?.reducedMotionQuery) {
      try { state.reducedMotionQuery.removeEventListener("change", state.reducedMotionHandler); } catch {}
    }
    if (state?.visibilityHandler) document.removeEventListener("visibilitychange", state.visibilityHandler);
    if (state?.focusHandler) window.removeEventListener("focus", state.focusHandler);
    if (state?.blurHandler) window.removeEventListener("blur", state.blurHandler);
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    if (state?.wallpaperUrl) URL.revokeObjectURL(state.wallpaperUrl);
    if (state?.stampUrl && state.stampUrl !== state.artUrl) URL.revokeObjectURL(state.stampUrl);
    if (state?.motionUrl) URL.revokeObjectURL(state.motionUrl);
    if (state?.motionPosterUrl && state.motionPosterUrl !== state.artUrl) {
      URL.revokeObjectURL(state.motionPosterUrl);
    }
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
    attributeFilter: ["class", "aria-label", "data-theme", "data-appearance", "data-color-mode", "style"],
  });
  const timer = setInterval(ensure, 4000);
  const resizeHandler = scheduleEnsure;
  window.addEventListener("resize", resizeHandler, { passive: true });

  let mediaQuery = null;
  let mediaHandler = null;
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaHandler = () => scheduleEnsure();
    mediaQuery.addEventListener("change", mediaHandler);
  } catch {}

  let reducedMotionQuery = null;
  let reducedMotionHandler = null;
  try {
    reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionHandler = syncCinematicPlayback;
    reducedMotionQuery.addEventListener("change", reducedMotionHandler);
  } catch {}
  const visibilityHandler = syncCinematicPlayback;
  const focusHandler = syncCinematicPlayback;
  const blurHandler = syncCinematicPlayback;
  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("focus", focusHandler);
  window.addEventListener("blur", blurHandler);

  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    timer,
    scheduler,
    resizeHandler,
    mediaQuery,
    mediaHandler,
    reducedMotionQuery,
    reducedMotionHandler,
    visibilityHandler,
    focusHandler,
    blurHandler,
    artUrl,
    wallpaperUrl,
    stampUrl,
    motionUrl,
    motionPosterUrl,
    version: VERSION,
    themeId: THEME.id || "custom",
    detectShellMode,
    detectProductMode,
    productMode: detectProductMode(),
  };
  ensure();
  return { installed: true, version: VERSION, themeId: THEME.id || "custom", shell: detectShellMode() };
})(__DREAM_SKIN_CSS_JSON__, __DREAM_SKIN_ART_JSON__, __DREAM_SKIN_WALLPAPER_JSON__, __DREAM_SKIN_STAMP_JSON__, __DREAM_SKIN_MOTION_JSON__, __DREAM_SKIN_MOTION_POSTER_JSON__, __DREAM_SKIN_THEME_JSON__, __DREAM_SKIN_VARS_JSON__, __DREAM_SKIN_VERSION_JSON__)
