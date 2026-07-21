import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AtSign,
  Bell,
  Box,
  CheckCircle2,
  Code2,
  Compass,
  Copy,
  Folder,
  Maximize2,
  MoreHorizontal,
  Palette,
  Paperclip,
  PencilLine,
  Plug,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { NormalizedTheme } from "../../electron/shared/types";

interface MoonlitImmortalPreviewProps {
  theme: NormalizedTheme;
  heroUrl?: string | null;
  wallpaperUrl?: string | null;
  stampUrl?: string | null;
  page: "home" | "task";
}

const NAV_ITEMS = [
  [Plus, "新建任务"],
  [Folder, "项目"],
  [Palette, "主题"],
  [Code2, "代码片段"],
  [Compass, "探索"],
  [Plug, "插件"],
  [Settings, "设置"],
] as const;

const RECENT_FILES = ["仙剑御影.tsx", "月华剑意.py", "云海渲染.glsl", "天枢阵法.md"];

const ACTIONS = [
  [Sparkles, "探索并理解代码", "解析功能、依赖与执行逻辑"],
  [Box, "构建新功能", "生成代码、模块或工具"],
  [PencilLine, "审查与优化", "发现问题并给出改进建议"],
  [Wrench, "修复与重构", "修复问题并提升代码质量"],
] as const;

export function MoonlitImmortalPreview({
  theme,
  heroUrl,
  wallpaperUrl,
  stampUrl,
  page,
}: MoonlitImmortalPreviewProps) {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [compact, setCompact] = useState(false);
  const [activeNav, setActiveNav] = useState(page === "home" ? "新建任务" : "项目");
  const [draft, setDraft] = useState("");
  const palette = theme[mode];
  const art = heroUrl || wallpaperUrl;
  const style = {
    "--moonlit-art": art ? `url("${art}")` : "none",
    "--moonlit-bg": palette.background,
    "--moonlit-panel": palette.panel,
    "--moonlit-panel-alt": palette.panelAlt,
    "--moonlit-text": palette.text,
    "--moonlit-muted": palette.muted,
    "--moonlit-accent": palette.accent,
    "--moonlit-cyan": palette.accentAlt,
    "--moonlit-gold": palette.highlight,
    "--moonlit-line": palette.border,
  } as CSSProperties;

  return (
    <div className="preview-frame">
      <div className="preview-frame-bar">
        <span className="tl-dot" style={{ background: "#ff5f57" }} />
        <span className="tl-dot" style={{ background: "#febc2e" }} />
        <span className="tl-dot" style={{ background: "#28c840" }} />
        <span className="preview-caption">
          Codex {page === "home" ? "首页" : "对话页"} · 曜月谪仙全窗预览
        </span>
        <div className="preview-toggles">
          <button className={`preview-toggle${mode === "light" ? " on" : ""}`} onClick={() => setMode("light")}>亮色</button>
          <button className={`preview-toggle${mode === "dark" ? " on" : ""}`} onClick={() => setMode("dark")}>暗色</button>
          <button className={`preview-toggle${compact ? " on" : ""}`} onClick={() => setCompact((value) => !value)}>紧凑</button>
        </div>
      </div>

      <div
        className={`moonlit-preview moonlit-preview--${mode}${compact ? " moonlit-preview--compact" : ""}`}
        style={style}
        data-dream-theme="moonlit-immortal"
      >
        <div className="moonlit-preview__veil" />

        <aside className="moonlit-preview__sidebar">
          <div className="moonlit-preview__brand">
            <span><Sparkles size={17} /></span>
            <div><b>曜月谪仙</b><small>Moonlit Immortal</small></div>
          </div>

          <nav aria-label="曜月谪仙预览导航">
            {NAV_ITEMS.map(([Icon, label]) => (
              <button
                type="button"
                key={label}
                className={activeNav === label ? "is-active" : ""}
                onClick={() => setActiveNav(label)}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="moonlit-preview__recent">
            <span>近期</span>
            {RECENT_FILES.map((file) => <button type="button" key={file}>{file}</button>)}
          </div>

          <div className="moonlit-preview__account">
            <img src={heroUrl || undefined} alt="曜月谪仙头像" />
            <span><b>仙途行者</b><small>月华在线</small></span>
          </div>
        </aside>

        <header className="moonlit-preview__topbar">
          <div className="moonlit-preview__history" aria-hidden="true"><ArrowLeft size={14} /><ArrowRight size={14} /></div>
          <label className="moonlit-preview__search">
            <Search size={14} />
            <input aria-label="搜索任务、主题或代码" placeholder="搜索任务、主题或代码…" />
            <kbd>⌘K</kbd>
          </label>
          <div className="moonlit-preview__top-actions">
            <button aria-label="切换亮暗模式" onClick={() => setMode(mode === "light" ? "dark" : "light")}><Sun size={15} /></button>
            <button aria-label="通知"><Bell size={15} /></button>
            <button aria-label="更多"><MoreHorizontal size={16} /></button>
          </div>
        </header>

        <main className={`moonlit-preview__main moonlit-preview__main--${page}`}>
          {page === "home" ? <MoonlitHome avatarUrl={stampUrl || heroUrl} /> : <MoonlitTask avatarUrl={stampUrl || heroUrl} />}

          <label className="moonlit-preview__composer">
            <input
              aria-label={page === "home" ? "给 Codex 派一个任务" : "继续对话"}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={page === "home" ? "告诉我你的想法，或粘贴代码…" : "继续描述你想调整的内容…"}
            />
            <span className="moonlit-preview__composer-tools">
              <button type="button" aria-label="添加附件"><Paperclip size={14} /></button>
              <button type="button" aria-label="提及上下文"><AtSign size={14} /></button>
              <button type="button" aria-label="使用智能体"><Sparkles size={14} /></button>
            </span>
            <button type="button" className="moonlit-preview__send" aria-label="发送"><ArrowUp size={15} /></button>
          </label>
        </main>
      </div>
    </div>
  );
}

function MoonlitHome({ avatarUrl }: { avatarUrl?: string | null }) {
  return (
    <>
      <section className="moonlit-preview__conversation">
        <header><Sparkles size={14} /><b>曜月谪仙</b><span className="moonlit-preview__conversation-rule" /><span aria-hidden="true">✧</span></header>
        <div className="moonlit-preview__conversation-intro">
          <img src={avatarUrl || undefined} alt="曜月谪仙角色头像" />
          <p>在月华与云海之间，我将与你共编灵动之代码。</p>
          <time>10:36</time><span aria-hidden="true">✦</span>
        </div>
        <pre><code>
          <span className="moonlit-preview__code-line"><b>01</b><span><i className="is-keyword">interface</i> ImmortalConfig {`{`}</span></span>
          <span className="moonlit-preview__code-line"><b>02</b><span>  realm: <i className="is-string">&quot;xian&quot;</i>;</span></span>
          <span className="moonlit-preview__code-line"><b>03</b><span>  virtue: number;</span></span>
          <span className="moonlit-preview__code-line"><b>04</b><span>  spirit: number;</span></span>
          <span className="moonlit-preview__code-line"><b>05</b><span>  swordIntent: string;</span></span>
          <span className="moonlit-preview__code-line"><b>06</b><span>  skills: string[];</span></span>
          <span className="moonlit-preview__code-line"><b>07</b><span>{`}`}</span></span>
          <span className="moonlit-preview__code-line"><b>08</b><span>&nbsp;</span></span>
          <span className="moonlit-preview__code-line"><b>09</b><span><i className="is-keyword">const</i> cultivate = (cfg: ImmortalConfig) =&gt; {`{`}</span></span>
          <span className="moonlit-preview__code-line"><b>10</b><span>  <i className="is-keyword">return</i> ascend(cfg)</span></span>
          <span className="moonlit-preview__code-line"><b>11</b><span>{`}`}</span></span>
        </code><span className="moonlit-preview__code-tools" aria-hidden="true"><Copy size={12} /><Maximize2 size={12} /></span></pre>
        <footer><CheckCircle2 size={14} /><span>已完成修炼核心逻辑，助你踏月而行，登临绝巅。</span><time>10:37</time><span className="moonlit-preview__reactions" aria-hidden="true"><Volume2 size={12} /><ThumbsUp size={12} /><ThumbsDown size={12} /><Copy size={12} /></span></footer>
      </section>

      <section className="moonlit-preview__actions" aria-label="快捷任务">
        {ACTIONS.map(([Icon, title, detail]) => (
          <button type="button" key={title}>
            <span className="moonlit-preview__action-icon"><Icon size={19} /></span>
            <span><b>{title}</b><small>{detail}</small></span>
            <ArrowRight size={14} />
          </button>
        ))}
      </section>
    </>
  );
}

function MoonlitTask({ avatarUrl }: { avatarUrl?: string | null }) {
  return (
    <section className="moonlit-preview__thread">
      <header>
        <Sparkles size={15} />
        <span><b>优化主题生成配色</b><small>曜月谪仙 · 对话进行中</small></span>
      </header>

      <div className="moonlit-preview__chat-log">
        <div className="moonlit-preview__turn moonlit-preview__turn--user">
          <span className="moonlit-preview__turn-meta">你 · 10:31</span>
          <div className="moonlit-preview__message moonlit-preview__message--user">
            让主题原画铺满整个窗口，同时保证代码区和长文本清晰。
          </div>
        </div>

        <div className="moonlit-preview__turn moonlit-preview__turn--agent">
          <span className="moonlit-preview__agent-avatar">
            {avatarUrl ? <img src={avatarUrl} alt="曜月谪仙 Agent" /> : <Sparkles size={15} />}
          </span>
          <div className="moonlit-preview__turn-body">
            <span className="moonlit-preview__turn-meta">Codex · 10:32</span>
            <article className="moonlit-preview__message moonlit-preview__message--agent">
              <p>已将主图设为全窗口背景，并为对话与代码建立独立的玻璃层级。</p>
              <pre><code><span>body</span> {`{`}<br />  background: var(--moonlit-art) center / cover;<br />  background-attachment: fixed;<br />{`}`}</code></pre>
              <footer><CheckCircle2 size={13} /> 已更新主题预览</footer>
            </article>
          </div>
        </div>

        <div className="moonlit-preview__turn moonlit-preview__turn--user">
          <span className="moonlit-preview__turn-meta">你 · 10:34</span>
          <div className="moonlit-preview__message moonlit-preview__message--user">
            很好，再检查一下暗色模式和输入框聚焦状态。
          </div>
        </div>

        <div className="moonlit-preview__turn moonlit-preview__turn--agent">
          <span className="moonlit-preview__agent-avatar moonlit-preview__agent-avatar--status"><Sparkles size={14} /></span>
          <div className="moonlit-preview__turn-body">
            <span className="moonlit-preview__turn-meta">Codex · 正在处理</span>
            <div className="moonlit-preview__typing"><i /><i /><i /><span>正在检查暗色对比度与输入状态…</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
