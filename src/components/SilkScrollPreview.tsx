import {
  ArrowUp,
  Check,
  CircleCheck,
  Code2,
  FileCode2,
  FileJson,
  Flower2,
  GitBranch,
  MessageCircle,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Terminal,
  WandSparkles,
  Waves,
} from "lucide-react";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { NormalizedTheme } from "../../electron/shared/types";

interface SilkScrollPreviewProps {
  theme: NormalizedTheme;
  heroUrl?: string | null;
  wallpaperUrl?: string | null;
  stampUrl?: string | null;
  page: "home" | "task";
}

const FILES = [
  { label: "theme.json", Icon: FileJson },
  { label: "preview.tsx", Icon: FileCode2 },
  { label: "skin.css", Icon: Code2 },
  { label: "verify.test.ts", Icon: CircleCheck },
  { label: "release.md", Icon: GitBranch },
];

export function SilkScrollPreview({
  theme,
  heroUrl,
  wallpaperUrl,
  stampUrl,
  page,
}: SilkScrollPreviewProps) {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [compact, setCompact] = useState(false);
  const palette = theme[mode];

  const style = {
    "--silk-hero": heroUrl ? `url("${heroUrl}")` : "none",
    "--silk-paper": wallpaperUrl ? `url("${wallpaperUrl}")` : "none",
    "--silk-stamp": stampUrl ? `url("${stampUrl}")` : "none",
    "--silk-bg": palette.background,
    "--silk-panel": palette.panel,
    "--silk-panel-alt": palette.panelAlt,
    "--silk-surface": palette.surface,
    "--silk-text": palette.text,
    "--silk-muted": palette.muted,
    "--silk-line": palette.border,
    "--silk-rose": palette.accent,
    "--silk-rose-soft": palette.accentAlt,
    "--silk-teal": palette.secondary,
    "--silk-gold": palette.highlight,
  } as CSSProperties;

  const isTask = page === "task";

  return (
    <div className="preview-frame">
      <div className="preview-frame-bar">
        <span className="tl-dot" style={{ background: "#ff5f57" }} />
        <span className="tl-dot" style={{ background: "#febc2e" }} />
        <span className="tl-dot" style={{ background: "#28c840" }} />
        <span className="preview-caption">
          Codex {isTask ? "任务页" : "首页"} · 交互预览 · silk-scroll
        </span>
        <div className="preview-toggles">
          <button className={`preview-toggle${mode === "light" ? " on" : ""}`} onClick={() => setMode("light")}>
            亮色
          </button>
          <button className={`preview-toggle${mode === "dark" ? " on" : ""}`} onClick={() => setMode("dark")}>
            暗色
          </button>
          <button className={`preview-toggle${compact ? " on" : ""}`} onClick={() => setCompact((value) => !value)}>
            紧凑
          </button>
        </div>
      </div>

      <div className={`silk-scroll-preview silk-scroll-preview--${mode}${compact ? " silk-scroll-preview--compact" : ""}`} style={style}>
        <div className="silk-scroll-preview__veil" />
        <header className="silk-scroll-preview__nav">
          <div className="silk-scroll-preview__brand">
            <span><Flower2 size={15} strokeWidth={1.7} /></span>
            <b>CODEX</b>
            <small>镜湖</small>
          </div>
          <nav aria-label="主题预览导航">
            <button className="is-active">任务</button>
            <button>主题</button>
            <button>项目</button>
          </nav>
          <div className="silk-scroll-preview__actions">
            <button aria-label="搜索"><Search size={14} /></button>
            <button aria-label="暗色模式" onClick={() => setMode(mode === "light" ? "dark" : "light")}><Moon size={14} /></button>
            <button aria-label="设置"><Settings size={14} /></button>
          </div>
        </header>

        <div className="silk-scroll-preview__heading">
          <span>{theme.copy.brandSubtitle}</span>
          <h2>{isTask ? "把镜湖主题做成可交互工作台" : "今天想展开哪一卷灵感？"}</h2>
          <p>{isTask ? "任务正在沿着三章丝绢流转" : theme.tagline}</p>
        </div>

        <div className="silk-scroll-preview__files" aria-label="打开的文件">
          {FILES.map(({ label, Icon }, index) => (
            <button key={label} className={index === (isTask ? 1 : 0) ? "is-active" : ""}>
              <Icon size={12} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <main className="silk-scroll-preview__workbench">
          <span className="silk-scroll-preview__rod silk-scroll-preview__rod--left" />
          <span className="silk-scroll-preview__rod silk-scroll-preview__rod--right" />
          <div className="silk-scroll-preview__chapters">
            {isTask ? <TaskChapters /> : <HomeChapters />}
          </div>
        </main>

        <div className="silk-scroll-preview__composer">
          <button aria-label="添加附件"><Plus size={14} /></button>
          <span>{isTask ? "继续告诉 Codex 你想调整的细节…" : "给 Codex 派一个任务，或展开新的灵感…"}</span>
          <small><WandSparkles size={12} /> 5.6 Sol</small>
          <button className="silk-scroll-preview__send" aria-label="发送"><ArrowUp size={14} /></button>
        </div>

        <footer className="silk-scroll-preview__statusbar">
          <span><Waves size={12} /> {theme.copy.statusText}</span>
          <span>{theme.copy.quote}</span>
          <span><CircleCheck size={12} /> 本地主题 · 已同步</span>
        </footer>
      </div>
    </div>
  );
}

function HomeChapters() {
  return (
    <>
      <section>
        <ChapterNumber number="01" title="需求简述" subtitle="BRIEF" />
        <p>将镜湖、剑舞与丝绢结构转成真正可操作的 Codex 主题。</p>
        <ul className="silk-scroll-preview__checklist">
          <li><Check size={12} /> 横向卷轴任务流</li>
          <li><Check size={12} /> 亮色与暗色模式</li>
          <li><Check size={12} /> 自适应紧凑窗口</li>
        </ul>
      </section>
      <section>
        <ChapterNumber number="02" title="代码变更" subtitle="CHANGES" />
        <div className="silk-scroll-preview__code">
          <span><i>+</i> layout: <b>"silk-scroll"</b></span>
          <span><i>+</i> hero: <b>"hero.png"</b></span>
          <span><i>+</i> wallpaper: <b>"wallpaper.png"</b></span>
          <span><i>+</i> deepLink: <b>"mirror-lake-ribbon"</b></span>
        </div>
      </section>
      <section>
        <ChapterNumber number="03" title="验证结果" subtitle="VERIFIED" />
        <div className="silk-scroll-preview__result">
          <CircleCheck size={25} />
          <b>主题已准备好</b>
          <span>引擎 · 预览 · 官网</span>
        </div>
        <div className="silk-scroll-preview__metrics">
          <span><b>20</b> 内置主题</span>
          <span><b>3</b> 自适应状态</span>
        </div>
      </section>
    </>
  );
}

function TaskChapters() {
  return (
    <>
      <section>
        <ChapterNumber number="01" title="用户需求" subtitle="REQUEST" />
        <div className="silk-scroll-preview__message">
          <MessageCircle size={14} />
          <p>基于第三张图做成主题，保留横向丝绢布局。</p>
        </div>
        <span className="silk-scroll-preview__time">今天 04:36 · 已接收</span>
      </section>
      <section>
        <ChapterNumber number="02" title="Codex 实现" subtitle="IMPLEMENTATION" />
        <p>新增布局骨架和镜湖主题资源，并接入网页目录。</p>
        <div className="silk-scroll-preview__code">
          <span><i>+</i> <b>SilkScrollPreview.tsx</b></span>
          <span><i>+</i> <b>mirror-lake-ribbon</b></span>
          <span><i>+</i> <b>runtime responsive CSS</b></span>
        </div>
      </section>
      <section>
        <ChapterNumber number="03" title="执行状态" subtitle="STATUS" />
        <div className="silk-scroll-preview__result">
          <Terminal size={25} />
          <b>正在检查主题包</b>
          <span>typecheck · tests · build</span>
        </div>
        <button className="silk-scroll-preview__action"><Sparkles size={12} /> 在应用内使用</button>
      </section>
    </>
  );
}

function ChapterNumber({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return (
    <header className="silk-scroll-preview__chapter-title">
      <span>{number}</span>
      <div><b>{title}</b><small>{subtitle}</small></div>
    </header>
  );
}
