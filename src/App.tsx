import { LayoutGrid, Loader2, Palette, Settings2, ShieldCheck, Sparkles, Store, User, Wand2 } from "lucide-react";
import { useEffect } from "react";
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

export function App() {
  const ready = useApp((s) => s.ready);
  const page = useApp((s) => s.page);
  const setPage = useApp((s) => s.setPage);
  const settings = useApp((s) => s.settings);
  const auth = useApp((s) => s.auth);
  const profile = useApp((s) => s.profile);
  const wallet = useApp((s) => s.wallet);
  const init = useApp((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

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

  return (
    <div className="app-shell">
      <div className="titlebar">Codex Themes</div>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Palette size={14} />
          </span>
          <div>
            <div className="brand-name">Codex Themes</div>
            <div className="brand-sub">Codex 桌面端换肤</div>
          </div>
        </div>
        {NAV.map((item) => (
          <button
            key={item.page}
            className={`nav-item${page === item.page ? " active" : ""}`}
            onClick={() => setPage(item.page)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        {profile?.isAdmin && (
          <button
            className={`nav-item${page === "admin" ? " active" : ""}`}
            onClick={() => setPage("admin")}
          >
            <ShieldCheck size={15} />
            审核与财务
          </button>
        )}
        <div className="sidebar-spacer" />
        <button
          className={`nav-item nav-item--account${page === "account" ? " active" : ""}`}
          onClick={() => setPage("account")}
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
        <StatusCard />
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
