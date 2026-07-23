import {
  LayoutGrid,
  Loader2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  User,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import defaultCreatorAvatar from "./assets/creator-default-avatar.webp";
import { ConfirmRestartModal } from "./components/ConfirmRestartModal";
import { OpenThemeModal } from "./components/OpenThemeModal";
import { StatusCard } from "./components/StatusCard";
import { Toasts } from "./components/Toasts";
import { AiStudio } from "./pages/AiStudio";
import { Editor } from "./pages/Editor";
import { Gallery } from "./pages/Gallery";
import { Onboarding } from "./pages/Onboarding";
import { Settings } from "./pages/Settings";
import { Account } from "./pages/Account";
import { Admin } from "./pages/Admin";
import { CreatorCenter } from "./pages/CreatorCenter";
import { useApp, type Page } from "./store";

const NAV: { page: Page; label: string; icon: React.ReactNode }[] = [
  { page: "gallery", label: "主题画廊", icon: <LayoutGrid size={15} /> },
  { page: "ai-studio", label: "AI 生成主题", icon: <Sparkles size={15} /> },
  { page: "editor", label: "自定义主题", icon: <Wand2 size={15} /> },
  { page: "creator", label: "创作者中心", icon: <Store size={15} /> },
  { page: "settings", label: "设置", icon: <Settings2 size={15} /> },
];

const SIDEBAR_STORAGE_KEY = "codex-themes:sidebar-collapsed";
const SIDEBAR_WIDTH_STORAGE_KEY = "codex-themes:sidebar-width";
const SIDEBAR_DEFAULT_WIDTH = 204;
const SIDEBAR_MIN_WIDTH = 176;
const SIDEBAR_MAX_WIDTH = 320;

function getStoredSidebarPreference(): boolean | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  return stored === null ? null : stored === "true";
}

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function getStoredSidebarWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0
    ? clampSidebarWidth(stored)
    : SIDEBAR_DEFAULT_WIDTH;
}

export function App() {
  const ready = useApp((s) => s.ready);
  const page = useApp((s) => s.page);
  const setPage = useApp((s) => s.setPage);
  const settings = useApp((s) => s.settings);
  const auth = useApp((s) => s.auth);
  const profile = useApp((s) => s.profile);
  const wallet = useApp((s) => s.wallet);
  const init = useApp((s) => s.init);
  const [compactWindow, setCompactWindow] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 1040,
  );
  const [sidebarPreference, setSidebarPreference] = useState<boolean | null>(
    getStoredSidebarPreference,
  );
  const [sidebarWidth, setSidebarWidth] = useState(getStoredSidebarWidth);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  const resizePointerId = useRef<number | null>(null);
  const sidebarCollapsed = sidebarPreference ?? compactWindow;

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const updateWindowMode = () => setCompactWindow(window.innerWidth <= 1040);
    window.addEventListener("resize", updateWindowMode);
    return () => window.removeEventListener("resize", updateWindowMode);
  }, []);

  if (!ready) {
    return (
      <div className="loading-screen">
        <Loader2 size={22} className="spin" />
      </div>
    );
  }

  if (settings && !settings.onboardingDone) {
    return <Onboarding />;
  }

  const isAuthenticated = auth?.status === "authenticated";
  const toggleSidebar = () => {
    const nextValue = !sidebarCollapsed;
    setSidebarPreference(nextValue);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextValue));
  };

  const updateSidebarWidth = (width: number, persist = false) => {
    const nextWidth = clampSidebarWidth(width);
    sidebarWidthRef.current = nextWidth;
    setSidebarWidth(nextWidth);
    if (persist) {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(nextWidth));
    }
  };

  const beginSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return;
    event.preventDefault();
    resizePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSidebarResizing(true);
  };

  const resizeSidebar = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizePointerId.current !== event.pointerId) return;
    updateSidebarWidth(event.clientX);
  };

  const finishSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizePointerId.current !== event.pointerId) return;
    resizePointerId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setSidebarResizing(false);
    window.localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(sidebarWidthRef.current),
    );
  };

  const resizeSidebarWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextWidth = sidebarWidthRef.current;
    if (event.key === "ArrowLeft") nextWidth -= 8;
    else if (event.key === "ArrowRight") nextWidth += 8;
    else if (event.key === "Home") nextWidth = SIDEBAR_MIN_WIDTH;
    else if (event.key === "End") nextWidth = SIDEBAR_MAX_WIDTH;
    else return;
    event.preventDefault();
    updateSidebarWidth(nextWidth, true);
  };

  const shellStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  } as CSSProperties;

  return (
    <div
      className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${sidebarResizing ? " sidebar-resizing" : ""}`}
      style={shellStyle}
    >
      <div className="titlebar">
        <span className="titlebar-title">Codex Themes</span>
        <StatusCard />
      </div>
      <aside className="sidebar" aria-label="应用导航">
        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? "展开左侧导航" : "折叠左侧导航"}
          title={sidebarCollapsed ? "展开导航" : "折叠导航"}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-label="调整左侧导航宽度"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={sidebarCollapsed ? -1 : 0}
          title="拖动调整导航宽度"
          onPointerDown={beginSidebarResize}
          onPointerMove={resizeSidebar}
          onPointerUp={finishSidebarResize}
          onPointerCancel={finishSidebarResize}
          onKeyDown={resizeSidebarWithKeyboard}
        />
        <div className="brand">
          <span className="brand-mark">
            <Palette size={14} />
          </span>
          <div className="brand-copy">
            <div className="brand-name">Codex Themes</div>
            <div className="brand-sub">Codex 桌面端换肤</div>
          </div>
        </div>
        {NAV.map((item) => (
          <button
            key={item.page}
            className={`nav-item${page === item.page ? " active" : ""}`}
            onClick={() => setPage(item.page)}
            aria-label={item.label}
            title={sidebarCollapsed ? item.label : undefined}
          >
            {item.icon}
            <span className="nav-item-label">{item.label}</span>
          </button>
        ))}
        {profile?.isAdmin && (
          <button
            className={`nav-item${page === "admin" ? " active" : ""}`}
            onClick={() => setPage("admin")}
            aria-label="审核与财务"
            title={sidebarCollapsed ? "审核与财务" : undefined}
          >
            <ShieldCheck size={15} />
            <span className="nav-item-label">审核与财务</span>
          </button>
        )}
        <div className="sidebar-spacer" />
        <button
          className={`nav-item nav-item--account${page === "account" ? " active" : ""}`}
          onClick={() => setPage("account")}
          aria-label={isAuthenticated ? "账号与积分" : "登录或查看账号"}
          title={sidebarCollapsed ? (isAuthenticated ? "账号与积分" : "登录 / 账号") : undefined}
        >
          <span className="nav-account-avatar" aria-hidden="true">
            <User size={15} />
            {(profile?.avatarUrl || auth?.user?.avatarUrl || isAuthenticated) && (
              <img
                src={profile?.avatarUrl || auth?.user?.avatarUrl || defaultCreatorAvatar}
                alt=""
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.src = defaultCreatorAvatar;
                }}
              />
            )}
          </span>
          <span className="nav-account-copy">
            <strong>
              {isAuthenticated
                ? profile?.displayName || auth.user?.displayName || auth.user?.email || "账号"
                : "登录 / 账号"}
            </strong>
            {isAuthenticated && <small>{wallet?.balance ?? 0} 积分</small>}
          </span>
          {profile?.isAdmin && <span className="nav-admin-pill">管理员</span>}
        </button>
      </aside>
      <main className="main">
        {page === "gallery" && <Gallery />}
        {page === "ai-studio" && <AiStudio />}
        {page === "editor" && <Editor />}
        {page === "creator" && <CreatorCenter />}
        {page === "admin" && <Admin />}
        {page === "settings" && <Settings />}
        {page === "account" && <Account />}
      </main>
      <ConfirmRestartModal />
      <OpenThemeModal />
      <Toasts />
    </div>
  );
}
