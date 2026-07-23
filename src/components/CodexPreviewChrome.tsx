import {
  Bell,
  ChevronDown,
  FolderGit2,
  GitBranch,
  Home,
  MoreHorizontal,
  PanelLeft,
  Search,
  Settings2,
  SquarePen,
  UserRound,
} from "lucide-react";
import type { ThemePalette } from "../../electron/shared/types";

interface CodexPreviewSidebarProps {
  colors: ThemePalette;
  page: "home" | "task";
}

export function CodexPreviewSidebar({ colors, page }: CodexPreviewSidebarProps) {
  const line = `rgba(${hexToRgb(colors.text).join(",")},0.08)`;
  const selected = `rgba(${hexToRgb(colors.accent).join(",")},0.12)`;

  return (
    <aside
      className="mock-rail mock-codex-sidebar"
      style={{ background: colors.panel, borderColor: line, color: colors.text }}
    >
      <div className="mock-codex-sidebar__brand">
        <span className="mock-codex-sidebar__logo" style={{ background: colors.text, color: colors.panel }}>
          <PanelLeft size={15} />
        </span>
        <span className="mock-codex-sidebar__brand-copy">
          <b>Codex</b>
          <small>桌面应用</small>
        </span>
        <MoreHorizontal className="mock-codex-sidebar__more" size={15} />
      </div>

      <button
        type="button"
        className="mock-codex-sidebar__new"
        style={{ background: selected, borderColor: line, color: colors.text }}
      >
        <SquarePen size={15} />
        <span>新建任务</span>
        <kbd>⌘ N</kbd>
      </button>

      <nav className="mock-codex-sidebar__nav" aria-label="Codex 预览导航">
        <button
          type="button"
          className={page === "home" ? "is-active" : ""}
          style={page === "home" ? { background: selected } : undefined}
        >
          <Home size={15} />
          <span>首页</span>
        </button>
        <button type="button">
          <Search size={15} />
          <span>搜索</span>
        </button>
      </nav>

      <section className="mock-codex-sidebar__section">
        <header>
          <span>项目</span>
          <ChevronDown size={12} />
        </header>
        <button type="button" className="mock-codex-sidebar__project">
          <FolderGit2 size={15} />
          <span>
            <b>codex-themes</b>
            <small>本地工作区</small>
          </span>
        </button>
        <button
          type="button"
          className={page === "task" ? "is-active" : ""}
          style={page === "task" ? { background: selected } : undefined}
        >
          <span className="mock-codex-sidebar__thread-dot" style={{ background: colors.accent }} />
          <span>优化主题生成配色</span>
        </button>
        <button type="button">
          <span className="mock-codex-sidebar__thread-dot" />
          <span>主题预览与布局</span>
        </button>
      </section>

      <footer className="mock-codex-sidebar__footer">
        <button type="button">
          <Settings2 size={15} />
          <span>设置</span>
        </button>
        <button type="button">
          <UserRound size={15} />
          <span>苍何</span>
        </button>
      </footer>
    </aside>
  );
}

interface CodexPreviewHeaderProps {
  colors: ThemePalette;
  page: "home" | "task";
}

export function CodexPreviewHeader({ colors, page }: CodexPreviewHeaderProps) {
  return (
    <header
      className="mock-app-header"
      style={{
        background: colors.panel,
        borderColor: `rgba(${hexToRgb(colors.text).join(",")},0.08)`,
        color: colors.text,
      }}
    >
      <div className="mock-app-header__context">
        <FolderGit2 size={14} style={{ color: colors.accent }} />
        <span>codex-themes</span>
        <i>/</i>
        <b>{page === "home" ? "新任务" : "优化主题生成配色"}</b>
      </div>
      <div className="mock-app-header__actions">
        <span>
          <GitBranch size={12} />
          main
        </span>
        <span className="mock-app-header__local">本地</span>
        <button type="button" aria-label="通知">
          <Bell size={14} />
        </button>
        <button type="button" aria-label="更多">
          <MoreHorizontal size={15} />
        </button>
      </div>
    </header>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
