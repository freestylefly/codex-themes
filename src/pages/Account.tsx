import {
  Coins,
  Camera,
  CreditCard,
  Gift,
  Loader2,
  LockKeyhole,
  LogOut,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import defaultCreatorAvatar from "../assets/creator-default-avatar.webp";
import { useApp } from "../store";

const LEDGER_LABELS: Record<string, string> = {
  topup: "积分充值",
  theme_unlock: "解锁主题",
  creator_reward: "作者奖励",
  refund_hold: "退款预扣",
  refund_reversal: "退款失败冲回",
  admin_adjustment: "管理员调账",
};

const DEFAULT_POINT_PACKS = [
  {
    id: "starter-60",
    name: "轻量积分包",
    priceCents: 600,
    basePoints: 60,
    bonusPoints: 0,
    totalPoints: 60,
  },
  {
    id: "creator-330",
    name: "进阶积分包",
    priceCents: 3000,
    basePoints: 300,
    bonusPoints: 30,
    totalPoints: 330,
  },
  {
    id: "studio-800",
    name: "工作室积分包",
    priceCents: 6800,
    basePoints: 680,
    bonusPoints: 120,
    totalPoints: 800,
  },
] as const;

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function formatLedgerTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ledgerDescription(entryType: string, reason: string | null, themeId: string | null): string {
  if (reason) return reason;
  if (entryType === "topup") return "支付宝积分充值";
  if (entryType === "theme_unlock") return themeId ? `解锁主题 · ${themeId}` : "解锁广场主题";
  if (entryType === "creator_reward") return themeId ? `作品 ${themeId} 获得首次解锁奖励` : "作品首次解锁奖励";
  if (entryType === "refund_hold") return "退款积分预扣";
  if (entryType === "refund_reversal") return "退款失败，积分已返还";
  return "账户积分调整";
}

function LedgerIcon({ entryType }: { entryType: string }) {
  if (entryType === "topup") return <CreditCard size={18} />;
  if (entryType === "theme_unlock") return <LockKeyhole size={18} />;
  if (entryType === "creator_reward") return <Gift size={18} />;
  if (entryType === "refund_hold" || entryType === "refund_reversal") return <RotateCcw size={18} />;
  return <ShieldCheck size={18} />;
}

function GoogleMark() {
  return (
    <svg className="auth-google-mark" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.8 2.7-6.5Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 5.9-2.2L12 13.5c-.8.5-1.8.9-3 .9a5.2 5.2 0 0 1-4.9-3.6h-3v2.3A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M4.1 10.8A5.4 5.4 0 0 1 4 9c0-.6.1-1.2.3-1.8V4.9h-3A9 9 0 0 0 0 9c0 1.5.4 2.9 1.1 4.1l3-2.3Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15 2.3A8.7 8.7 0 0 0 9 0a9 9 0 0 0-7.9 4.9l3 2.3A5.2 5.2 0 0 1 9 3.6Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg className="auth-github-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18A10.9 10.9 0 0 1 12 6.1c.98 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.78 1.06.78 2.14v3.27c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"
      />
    </svg>
  );
}

export function Account() {
  const auth = useApp((s) => s.auth);
  const entitlements = useApp((s) => s.entitlements);
  const profile = useApp((s) => s.profile);
  const wallet = useApp((s) => s.wallet);
  const pointPacks = useApp((s) => s.pointPacks);
  const pointLedger = useApp((s) => s.pointLedger);
  const pointOrder = useApp((s) => s.pointOrder);
  const submissions = useApp((s) => s.submissions);
  const signInGitHub = useApp((s) => s.signInGitHub);
  const signInGoogle = useApp((s) => s.signInGoogle);
  const signOut = useApp((s) => s.signOut);
  const refreshAccountData = useApp((s) => s.refreshAccountData);
  const updateProfile = useApp((s) => s.updateProfile);
  const uploadAvatar = useApp((s) => s.uploadAvatar);
  const buyPointPack = useApp((s) => s.buyPointPack);

  const [busy, setBusy] = useState(false);
  const [loginProvider, setLoginProvider] = useState<"github" | "google" | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const profileSectionRef = useRef<HTMLElement>(null);
  const handleInputRef = useRef<HTMLInputElement>(null);
  const pointPackSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!profile) return;
    setHandle(profile.handle ?? "");
    setDisplayName(profile.displayName ?? "");
  }, [profile]);

  if (!auth) {
    return <div className="page"><div className="loading-screen"><Loader2 size={22} className="spin" /></div></div>;
  }

  if (auth.status === "authenticated" && auth.user) {
    const creatorName = profile?.displayName || auth.user.displayName || "未设置昵称";
    const creatorHandle = profile?.handle ? `@${profile.handle}` : "尚未设置公开用户名";
    const ownedThemeCount = entitlements.filter((item) => item.status === "active").length;
    const publishedThemeCount = new Set(
      submissions.filter((item) => item.status === "approved").map((item) => item.themeId),
    ).size;
    const visiblePointPacks = pointPacks.length > 0 ? pointPacks : DEFAULT_POINT_PACKS;
    const recentLedger = pointLedger.slice(0, 10);
    const profileIsValid = /^[a-z0-9_]{3,24}$/.test(handle) && displayName.trim().length >= 2;
    const profileUpdatedAt = profile?.createdAt
      ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(new Date(profile.createdAt))
      : null;

    const saveProfile = async () => {
      setBusy(true);
      try {
        await updateProfile({ handle, displayName });
      } finally {
        setBusy(false);
      }
    };

    const focusProfile = () => {
      profileSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => handleInputRef.current?.focus(), 280);
    };

    const focusPointPacks = () => {
      pointPackSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const changeAvatar = async () => {
      if (avatarBusy) return;
      setAvatarBusy(true);
      try {
        await uploadAvatar();
      } finally {
        setAvatarBusy(false);
      }
    };

    const handleSignOut = async () => {
      if (signOutBusy) return;
      setSignOutBusy(true);
      try {
        await signOut();
      } finally {
        setSignOutBusy(false);
      }
    };

    return (
      <div className="page account-page">
        <section className="account-creator-hero">
          <div className="account-creator-profile">
            <div className="account-hero-avatar">
              <img
                src={profile?.avatarUrl || auth.user.avatarUrl || defaultCreatorAvatar}
                alt={`${creatorName}的头像`}
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.src = defaultCreatorAvatar;
                }}
              />
              <button
                className="account-avatar-edit"
                onClick={() => void changeAvatar()}
                disabled={avatarBusy}
                title="自定义头像"
              >
                {avatarBusy ? <Loader2 size={15} className="spin" /> : <Camera size={15} />}
              </button>
            </div>
            <div className="account-creator-copy">
              <div className="account-creator-heading">
                <div>
                  <div className="account-creator-name-row">
                    <h2>{creatorName}</h2>
                    {profile?.isAdmin && <span className="account-admin-badge">管理员</span>}
                  </div>
                  <div className="account-creator-handle">{creatorHandle}</div>
                </div>
                <div className="account-creator-actions">
                  <button className="btn account-edit-profile" onClick={focusProfile}>
                    <Pencil size={14} />编辑资料
                  </button>
                  <button
                    className="btn btn-ghost btn-icon account-refresh"
                    onClick={() => void refreshAccountData()}
                    title="刷新账号数据"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-danger account-sign-out"
                    onClick={() => void handleSignOut()}
                    disabled={signOutBusy}
                  >
                    {signOutBusy ? <Loader2 size={14} className="spin" /> : <LogOut size={14} />}
                    退出登录
                  </button>
                </div>
              </div>
              <div className="account-creator-stats">
                <span><Sparkles size={14} />已拥有 <strong>{ownedThemeCount}</strong> 款主题</span>
                <i />
                <span>已发布 <strong>{publishedThemeCount}</strong> 个作品</span>
              </div>
              <div className="account-private-email">
                <LockKeyhole size={14} />
                <span>{maskEmail(auth.user.email)}</span>
                <small>仅对你可见</small>
              </div>
            </div>
          </div>

          <div className="account-wallet-card">
            <div className="account-wallet-heading">
              <span><Coins size={18} />积分余额</span>
              <button className="btn btn-primary account-wallet-topup" onClick={focusPointPacks}>
                <Coins size={14} />充值
              </button>
            </div>
            <strong className="account-wallet-balance">{(wallet?.balance ?? 0).toLocaleString("zh-CN")}</strong>
            <div className="account-wallet-stats">
              <div><span>充值</span><strong>{wallet?.lifetimePurchased ?? 0}</strong></div>
              <div><span>创作</span><strong>{wallet?.lifetimeEarned ?? 0}</strong></div>
              <div><span>使用</span><strong>{wallet?.lifetimeSpent ?? 0}</strong></div>
            </div>
            {pointOrder?.status === "pending" && (
              <div className="account-payment-pending">
                <Loader2 size={13} className="spin" />
                等待支付宝支付完成
              </div>
            )}
          </div>
        </section>

        <section className="account-recharge-strip" ref={pointPackSectionRef}>
          <div className="account-recharge-label">
            <span className="account-alipay-mark"><CreditCard size={18} /></span>
            <div>
              <strong>支付宝充值</strong>
              <small>即时到账</small>
            </div>
          </div>
          <div className="account-point-pack-list">
            {visiblePointPacks.map((pack, index) => (
              <button
                key={pack.id}
                className={`account-point-pack${index === 1 ? " is-recommended" : ""}`}
                disabled={pointOrder?.status === "pending"}
                onClick={() => void buyPointPack(pack.id)}
              >
                <span><Coins size={14} />{pack.totalPoints.toLocaleString("zh-CN")} 积分</span>
                <strong>¥{(pack.priceCents / 100).toFixed(2)}</strong>
                {pack.bonusPoints > 0 && <small>含赠送 {pack.bonusPoints}</small>}
              </button>
            ))}
          </div>
        </section>

        <div className="account-detail-grid">
          <section className="account-profile-editor" ref={profileSectionRef}>
            <div className="account-section-heading">
              <div>
                <h3>公开创作者资料</h3>
                <p>这些信息将展示在你的作品和创作者主页。</p>
              </div>
            </div>
            <div className="account-profile-fields">
              <label>
                <span>公开用户名</span>
                <input
                  ref={handleInputRef}
                  value={handle}
                  onChange={(event) => setHandle(event.target.value.toLowerCase())}
                  placeholder="3-24 位小写字母、数字或下划线"
                  spellCheck={false}
                />
                <small>{handle ? `广场身份 · @${handle}` : "设置后即可发布作品"}</small>
              </label>
              <label>
                <span>公开昵称</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="广场展示的名字"
                />
                <small>会显示在作品卡片和作者信息中</small>
              </label>
            </div>
            <div className="account-profile-actions">
              <button
                className="btn btn-primary"
                disabled={busy || !profileIsValid}
                onClick={() => void saveProfile()}
              >
                {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                保存更改
              </button>
              {profileUpdatedAt && <span>加入于 {profileUpdatedAt}</span>}
            </div>
          </section>

          <section className="account-ledger-panel">
            <div className="account-section-heading account-ledger-heading">
              <div>
                <h3>最近积分动态</h3>
                <p>充值、解锁和创作奖励都会记录在这里。</p>
              </div>
            </div>
            <div className="account-ledger-list">
              {recentLedger.length === 0 && (
                <div className="account-ledger-empty">
                  <Coins size={22} />
                  <strong>还没有积分动态</strong>
                  <span>充值或解锁主题后，记录会显示在这里。</span>
                </div>
              )}
              {recentLedger.map((entry) => (
                <div className="account-ledger-row" key={entry.id}>
                  <div className={`account-ledger-icon account-ledger-icon--${entry.entryType}`}>
                    <LedgerIcon entryType={entry.entryType} />
                  </div>
                  <div className="account-ledger-copy">
                    <strong>{LEDGER_LABELS[entry.entryType] ?? entry.entryType}</strong>
                    <span>{ledgerDescription(entry.entryType, entry.reason, entry.themeId)}</span>
                  </div>
                  <div className="account-ledger-amount">
                    <strong className={entry.delta >= 0 ? "points-positive" : "points-negative"}>
                      {entry.delta >= 0 ? "+" : ""}{entry.delta}
                    </strong>
                    <span>{formatLedgerTime(entry.createdAt)} · 余额 {entry.balanceAfter}</span>
                  </div>
                </div>
              ))}
            </div>
            {pointLedger.length > recentLedger.length && (
              <div className="account-ledger-more">仅展示最近 {recentLedger.length} 条记录</div>
            )}
          </section>
        </div>
      </div>
    );
  }

  const handleOAuth = async (provider: "github" | "google") => {
    setLoginProvider(provider);
    try {
      if (provider === "github") await signInGitHub();
      else await signInGoogle();
    } finally {
      setLoginProvider(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">登录账号</h1>
          <p className="page-sub">登录后可解锁广场主题、购买积分并发布自己的作品。</p>
        </div>
      </div>
      <div className="settings-group account-oauth-panel">
        <div className="settings-group-title">选择登录方式</div>
        <p className="account-oauth-copy">使用可信的第三方账号安全登录，不再发送邮箱验证码。</p>
        <div className="account-oauth-actions">
          <button
            className="btn btn-secondary account-oauth-button"
            disabled={loginProvider !== null}
            onClick={() => void handleOAuth("github")}
          >
            {loginProvider === "github" ? <Loader2 size={17} className="spin" /> : <GitHubMark />}
            使用 GitHub 登录
          </button>
          <button
            className="btn btn-secondary account-oauth-button account-oauth-button--google"
            disabled={loginProvider !== null}
            onClick={() => void handleOAuth("google")}
          >
            {loginProvider === "google" ? <Loader2 size={17} className="spin" /> : <GoogleMark />}
            使用 Google 登录
          </button>
        </div>
      </div>
      {auth.error && <div className="settings-group"><div className="note-block note-error">{auth.error}</div></div>}
    </div>
  );
}
