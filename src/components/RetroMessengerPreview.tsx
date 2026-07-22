import {
  ArrowRight,
  Bell,
  Bot,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  FileCode2,
  Folder,
  GitPullRequest,
  GitBranch,
  Globe2,
  Image,
  Laptop,
  Mail,
  MessageCircle,
  Paperclip,
  PackagePlus,
  Plus,
  ScanSearch,
  Search,
  SearchCode,
  Send,
  Share2,
  ShieldCheck,
  Signal,
  Smile,
  Star,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { NormalizedTheme } from "../../electron/shared/types";

interface RetroMessengerPreviewProps {
  theme: NormalizedTheme;
  heroUrl?: string | null;
  wallpaperUrl?: string | null;
  stampUrl?: string | null;
  page: "home" | "task";
}

const TOOLBAR_ITEMS = [
  [Plus, "新建任务"],
  [CalendarDays, "已安排"],
  [Boxes, "插件"],
  [Globe2, "站点"],
  [GitPullRequest, "拉取请求"],
  [MessageCircle, "聊天"],
] as const;

const PRIMARY_NAV = [
  [Plus, "新建任务"],
  [CalendarDays, "已安排"],
  [Boxes, "插件"],
  [Globe2, "站点"],
  [GitPullRequest, "拉取请求"],
  [MessageCircle, "聊天"],
] as const;

const PINNED_PROJECTS = ["hn", "hma", "lingmo", "notepal-app", "imgcook"];
const PROJECTS = ["showdex", "epubkit-electron", "anyicon", "prisma-schema", "image-agent"];

export function RetroMessengerPreview({
  theme,
  heroUrl,
  wallpaperUrl,
  stampUrl,
  page,
}: RetroMessengerPreviewProps) {
  const [compact, setCompact] = useState(false);
  const [activeTool, setActiveTool] = useState("聊天");
  const [activeNav, setActiveNav] = useState("聊天");
  const [draft, setDraft] = useState("");
  const [sentMessage, setSentMessage] = useState("");

  const title = page === "home" ? "Codex 工作台" : "优化 KV 读写成本";
  const wallpaperStyle = useMemo(
    () => (wallpaperUrl ? { backgroundImage: `url("${wallpaperUrl}")` } : undefined),
    [wallpaperUrl],
  );

  const sendDraft = () => {
    const next = draft.trim();
    if (!next) return;
    setSentMessage(next);
    setDraft("");
  };

  return (
    <div className="preview-frame">
      <div className="preview-frame-bar">
        <span className="tl-dot" style={{ background: "#ff5f57" }} />
        <span className="tl-dot" style={{ background: "#febc2e" }} />
        <span className="tl-dot" style={{ background: "#28c840" }} />
        <span className="preview-caption">
          Codex {page === "home" ? "首页" : "任务页"} · 蓝窗信使预览
        </span>
        <div className="preview-toggles">
          <button className="preview-toggle on">亮色</button>
          <button className={`preview-toggle${compact ? " on" : ""}`} onClick={() => setCompact(!compact)}>
            紧凑
          </button>
        </div>
      </div>

      <div className={`retro-preview${compact ? " retro-preview--compact" : ""}`}>
        <div className="retro-preview-title">
          <Bot size={16} />
          <b>Codex 2007 - {title}</b>
          <span className="retro-preview-window-controls" aria-hidden="true">
            <i>—</i><i>□</i><i>×</i>
          </span>
        </div>

        <div className="retro-preview-toolbar">
          {TOOLBAR_ITEMS.map(([Icon, label]) => (
            <button
              type="button"
              key={label}
              className={activeTool === label ? "is-active" : ""}
              onClick={() => setActiveTool(label)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="retro-preview-body">
          <aside className="retro-preview-left">
            <section className="retro-preview-left-nav">
              <RetroBar title="Codex" icon={<Bot size={13} />} />
              {PRIMARY_NAV.map(([Icon, label]) => (
                <button
                  type="button"
                  key={label}
                  className={activeNav === label ? "is-active" : ""}
                  onClick={() => setActiveNav(label)}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
              ))}
            </section>

            <ProjectList title="置顶" items={PINNED_PROJECTS} />
            <ProjectList title="项目" items={PROJECTS} />

            <section className="retro-preview-task-list">
              <RetroBar title="任务" />
              <p>微信发送 hello world</p>
            </section>

            <div className="retro-preview-account">
              <UserRound size={17} />
              <span><b>Randy Lu</b><small><i /> 在线</small></span>
            </div>

            <label className="retro-preview-search">
              <Search size={13} />
              <input aria-label="搜索" placeholder="搜索…" />
            </label>
          </aside>

          <main className={`retro-preview-main${page === "home" ? " retro-preview-main--home" : ""}`}>
            {page === "home" ? (
              <RetroHomePortal heroUrl={heroUrl} wallpaperStyle={wallpaperStyle} />
            ) : (
              <>
                <header className="retro-preview-thread-title">
                  <MessageCircle size={14} />
                  <b>{title}</b>
                </header>

                <div className="retro-preview-document">
                  <p>结构确认没问题：</p>
                  <ul className="retro-preview-checks">
                    <li><code>redeem_codes</code>、<code>push_tokens</code> 与 migration 一致。</li>
                    <li><code>android_subscriptions</code> 多了 <code>free_trial</code> 字段。</li>
                    <li><code>d1_migrations</code> 已存在，但缺少历史记录。</li>
                  </ul>
                  <p>现在补记录：</p>
                  <CodePanel title="bash">
                    <span>./node_modules/.bin/wrangler d1 execute haiker --remote --command \</span>
                    <span className="retro-preview-code-green">
                      &quot;INSERT OR IGNORE INTO d1_migrations (name)&quot;
                    </span>
                    <span>VALUES (&apos;0001_initial.sql&apos;), (&apos;0002_push_notifications.sql&apos;);</span>
                  </CodePanel>
                  <p>然后：</p>
                  <CodePanel title="bash">
                    <span>./node_modules/.bin/wrangler d1 migrations list haiker --remote</span>
                  </CodePanel>
                  <p>确认只显示 <code>0003_push_delivery_dedup.sql</code> 后，再运行：</p>
                  <CodePanel title="bash">
                    <span>./node_modules/.bin/wrangler d1 migrations apply haiker --remote</span>
                  </CodePanel>
                  <p>这不会影响现有业务数据。</p>
                  {sentMessage && <p className="retro-preview-sent">你：{sentMessage}</p>}

                  <div className="retro-preview-reactions">
                    <ThumbsUp size={11} />
                    <ThumbsDown size={11} />
                    <Share2 size={11} />
                    <span>分享</span>
                    <small>今天 22:48</small>
                  </div>
                </div>

                <div className="retro-preview-composer-tools">
                  <button type="button"><Smile size={13} />表情</button>
                  <button type="button"><Image size={13} />图片</button>
                  <button type="button"><Paperclip size={13} />附加</button>
                  <Zap size={13} className="retro-preview-composer-zap" />
                </div>
                <div className="retro-preview-composer">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="要求后续变更"
                    aria-label="消息"
                  />
                  <div className="retro-preview-composer-footer">
                    <span><Smile size={13} /></span>
                    <span className="retro-preview-model"><Zap size={11} /> 5.6 Sol 高 <ChevronDown size={11} /></span>
                    <button type="button" onClick={sendDraft} disabled={!draft.trim()}>
                      发送(S)
                      <Send size={11} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </main>

          <aside className="retro-preview-side">
            <section className="retro-preview-profile">
              <RetroBar title="Codex 好友" icon={<Users size={12} />} />
              <div className="retro-preview-mascot-stage" style={wallpaperStyle}>
                {heroUrl ? <img src={heroUrl} alt="Codex 小蓝原创机器人" /> : <Bot size={64} />}
              </div>
              <div className="retro-preview-profile-copy">
                <b><i /> Codex 小蓝 <em>LV 07</em></b>
                <p>代码有问题？找我！<br />我是你的智能伙伴 Codex<br />陪你写代码、改 Bug、查文档。</p>
              </div>
              <nav>
                <Bell size={13} />
                <Star size={13} />
                <Mail size={13} />
                <Users size={13} />
                <Folder size={13} />
              </nav>
            </section>

            <section className="retro-preview-friends">
              <RetroBar title="我的好友 (2/8)" icon={<ChevronDown size={12} />} />
              <div className={`retro-preview-friend-card${stampUrl ? " has-avatar" : ""}`} style={wallpaperStyle}>
                {stampUrl ? (
                  <img src={stampUrl} alt="原创设计伙伴头像" />
                ) : (
                  <span><UserRound size={28} /></span>
                )}
                <p><b>设计伙伴</b><small><i /> 在线 · 一起打磨主题</small></p>
              </div>
              <p><UserRound size={13} /><span><b>代码助手</b><small>正在检查变更</small></span></p>
              <p><UserRound size={13} /><span><b>本地终端</b><small>命令执行完毕</small></span></p>
            </section>

            <label className="retro-preview-friend-search">
              <input aria-label="查找好友" placeholder="查找好友…" />
              <Search size={13} />
            </label>
          </aside>
        </div>

        <footer className="retro-preview-statusbar">
          <span><Bot size={13} /></span>
          <span><UserRound size={13} /></span>
          <span><Star size={13} /></span>
          <span><Mail size={13} /></span>
          <span><Folder size={13} /></span>
          <span className="retro-preview-statusbar-spacer" />
          <span><ShieldCheck size={13} />安全</span>
          <span><Signal size={13} /></span>
          <span>22:48</span>
        </footer>
      </div>
    </div>
  );
}

const QUICK_START_ITEMS = [
  [SearchCode, "探索并理解代码", "分析项目结构与关键逻辑"],
  [PackagePlus, "构建新功能", "把想法写成可运行代码"],
  [ScanSearch, "审查代码", "发现风险并给出修改建议"],
  [Wrench, "修复问题", "定位问题并完成验证"],
] as const;

const RECENT_ITEMS = [
  [Folder, "主题配置优化", "刚刚"],
  [FileCode2, "sidebar-enhancement.ts", "2 小时前"],
  [Code2, "README.md", "昨天"],
] as const;

function RetroHomePortal({
  heroUrl,
  wallpaperStyle,
}: {
  heroUrl?: string | null;
  wallpaperStyle?: CSSProperties;
}) {
  const [draft, setDraft] = useState("");
  const [activeRecent, setActiveRecent] = useState(0);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const startWith = (prompt: string) => {
    setDraft(prompt);
    setSent(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = () => {
    if (!draft.trim()) {
      inputRef.current?.focus();
      return;
    }
    setDraft("");
    setSent(true);
  };

  return (
    <div className="retro-home-portal">
      <section className="retro-home-hero" style={wallpaperStyle}>
        {heroUrl ? <img src={heroUrl} alt="Codex 小蓝" /> : <Bot size={90} />}
        <div>
          <h2>欢迎回来，苍何</h2>
          <p>今天想和 Codex 一起做什么？</p>
          <button type="button" onClick={() => inputRef.current?.focus()}>
            <Plus size={16} />新建任务<span><ArrowRight size={16} /></span>
          </button>
        </div>
      </section>

      <section className="retro-home-section retro-home-quick">
        <h3>快速开始</h3>
        <div>
          {QUICK_START_ITEMS.map(([Icon, label, prompt]) => (
            <button type="button" key={label} onClick={() => startWith(prompt)}>
              <span><Icon size={22} /></span>
              <b>{label}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="retro-home-section retro-home-recent">
        <h3>继续工作</h3>
        <div>
          {RECENT_ITEMS.map(([Icon, label, time], index) => (
            <button
              type="button"
              key={label}
              className={activeRecent === index ? "is-active" : ""}
              onClick={() => setActiveRecent(index)}
            >
              <Icon size={15} />
              <b>codex-themes</b>
              <i>/</i>
              <span>{label}</span>
              <GitBranch size={12} />
              <em>main</em>
              <small>{time}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="retro-home-bottom">
        <div className="retro-home-context">
          <button type="button"><Folder size={14} />codex-themes</button>
          <span><Laptop size={14} />本地</span>
          <span><GitBranch size={14} />main</span>
          {sent && <small>任务已发送</small>}
        </div>
        <div className="retro-home-composer">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setSent(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
            }}
            placeholder="告诉 Codex 你想完成什么…"
            aria-label="新任务"
          />
          <button type="button" onClick={submit} disabled={!draft.trim()}>
            <Send size={16} />
            <span>发送</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function RetroBar({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <header className="retro-preview-bar">
      <span>{icon}{title}</span>
      <ChevronUp size={11} />
    </header>
  );
}

function ProjectList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="retro-preview-projects">
      <RetroBar title={title} />
      {items.map((item) => (
        <p key={item}><Folder size={12} /><span>{item}</span></p>
      ))}
    </section>
  );
}

function CodePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="retro-preview-code">
      <b>{title}</b>
      <Copy size={12} />
      {children}
    </div>
  );
}
