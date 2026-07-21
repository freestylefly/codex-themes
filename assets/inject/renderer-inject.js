((cssText, artDataUrl, wallpaperDataUrl, stampDataUrl, themeConfig, initialVars, version) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_DREAM_SKIN_DISABLED__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const MOONLIT_WELCOME_ID = "codex-dream-skin-moonlit-welcome";
  const SHELL_ATTR = "data-dream-shell";
  const VERSION = version || "1.0.0";
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const WALLPAPER_URL = wallpaperDataUrl || null;
  const LAYOUT_CLASSES = [
    "dream-banner",
    "split-studio",
    "full-canvas",
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
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);
  if (previous?.wallpaperUrl) URL.revokeObjectURL(previous.wallpaperUrl);
  if (previous?.stampUrl && previous.stampUrl !== previous.artUrl) URL.revokeObjectURL(previous.stampUrl);

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

  const cssString = (value) => JSON.stringify(String(value ?? ""));

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
      document.querySelector("main.main-surface"),
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

  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamSkinVersion = VERSION;
  }

  const ensure = () => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
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

    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const home = homeIndicator?.closest('[role="main"]') ||
      [...document.querySelectorAll('[role="main"]')].find((candidate) =>
        candidate.querySelector('[data-feature="game-source"]') &&
        candidate.querySelector('.group\\/home-suggestions')) || null;
    for (const candidate of document.querySelectorAll('[role="main"].dream-skin-home')) {
      if (candidate !== home) candidate.classList.remove("dream-skin-home");
    }
    if (home) home.classList.add("dream-skin-home");
    ensureMoonlitWelcome(home);

    if (!shellMain || !document.body) return;
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
          </div>
          <div class="dream-skin-retro-toolbar">
            <span>新建任务</span><span>已安排</span><span>插件</span>
            <span>站点</span><span>拉取请求</span><span>聊天</span>
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
              <nav><span>消息</span><span>收藏</span><span>邮件</span><span>好友</span><span>文件</span></nav>
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
    document.documentElement?.classList.remove("codex-dream-skin");
    document.documentElement?.classList.forEach((cls) => {
      if (cls.startsWith("codex-dream-skin--")) document.documentElement.classList.remove(cls);
    });
    document.documentElement?.removeAttribute(SHELL_ATTR);
    document.documentElement?.removeAttribute("data-dream-layout");
    document.documentElement?.removeAttribute("data-dream-theme");
    document.documentElement?.removeAttribute("data-dream-wallpaper");
    document.documentElement?.style.removeProperty("--dream-skin-art");
    document.documentElement?.style.removeProperty("--dream-skin-wallpaper");
    const vars = compileVariables("light");
    for (const name of Object.keys(vars)) document.documentElement?.style.removeProperty(name);
    document.querySelectorAll(".dream-skin-home").forEach((node) => node.classList.remove("dream-skin-home"));
    document.querySelectorAll(".dream-skin-home-shell").forEach((node) => node.classList.remove("dream-skin-home-shell"));
    document.getElementById(MOONLIT_WELCOME_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    if (state?.wallpaperUrl) URL.revokeObjectURL(state.wallpaperUrl);
    if (state?.stampUrl && state.stampUrl !== state.artUrl) URL.revokeObjectURL(state.stampUrl);
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
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode", "style"],
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

  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    timer,
    scheduler,
    resizeHandler,
    mediaQuery,
    mediaHandler,
    artUrl,
    wallpaperUrl,
    stampUrl,
    version: VERSION,
    themeId: THEME.id || "custom",
    detectShellMode,
  };
  ensure();
  return { installed: true, version: VERSION, themeId: THEME.id || "custom", shell: detectShellMode() };
})(__DREAM_SKIN_CSS_JSON__, __DREAM_SKIN_ART_JSON__, __DREAM_SKIN_WALLPAPER_JSON__, __DREAM_SKIN_STAMP_JSON__, __DREAM_SKIN_THEME_JSON__, __DREAM_SKIN_VARS_JSON__, __DREAM_SKIN_VERSION_JSON__)
