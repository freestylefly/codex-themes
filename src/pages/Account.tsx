import {
  Coins,
  Camera,
  CreditCard,
  Gift,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
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

export function Account() {
  const auth = useApp((s) => s.auth);
  const entitlements = useApp((s) => s.entitlements);
  const profile = useApp((s) => s.profile);
  const wallet = useApp((s) => s.wallet);
  const pointPacks = useApp((s) => s.pointPacks);
  const pointLedger = useApp((s) => s.pointLedger);
  const pointOrder = useApp((s) => s.pointOrder);
  const submissions = useApp((s) => s.submissions);
  const sendEmailOtp = useApp((s) => s.sendEmailOtp);
  const verifyEmailOtp = useApp((s) => s.verifyEmailOtp);
  const signInGitHub = useApp((s) => s.signInGitHub);
  const signOut = useApp((s) => s.signOut);
  const refreshAccountData = useApp((s) => s.refreshAccountData);
  const updateProfile = useApp((s) => s.updateProfile);
  const uploadAvatar = useApp((s) => s.uploadAvatar);
  const buyPointPack = useApp((s) => s.buyPointPack);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
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
              <button
                className="btn btn-ghost btn-icon btn-danger"
                onClick={() => void signOut()}
                title="退出登录"
              >
                <LogOut size={15} />
              </button>
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

  const handleSendOtp = async () => {
    if (!email.includes("@")) return;
    setBusy(true);
    const result = await sendEmailOtp(email);
    setBusy(false);
    if (result.ok) setOtpSent(true);
  };
  const handleVerifyOtp = async () => {
    if (otp.length < 6) return;
    setBusy(true);
    await verifyEmailOtp(email, otp);
    setBusy(false);
  };
  const handleGitHub = async () => {
    setBusy(true);
    await signInGitHub();
    setBusy(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">登录账号</h1>
          <p className="page-sub">登录后可解锁广场主题、购买积分并发布自己的作品。</p>
        </div>
      </div>
      <div className="settings-group">
        <div className="settings-group-title">邮箱验证码登录</div>
        <div className="account-form">
          <div className="account-field"><Mail size={15} /><input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} /></div>
          {!otpSent ? (
            <button className="btn btn-primary" disabled={busy || !email.includes("@")} onClick={() => void handleSendOtp()}>
              {busy && <Loader2 size={13} className="spin" />}发送验证码
            </button>
          ) : (
            <>
              <div className="account-field"><input type="text" inputMode="numeric" maxLength={6} placeholder="六位验证码" value={otp} onChange={(e) => setOtp(e.target.value)} disabled={busy} /></div>
              <button className="btn btn-primary" disabled={busy || otp.length < 6} onClick={() => void handleVerifyOtp()}>
                {busy && <Loader2 size={13} className="spin" />}登录
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void handleSendOtp()}>重新发送</button>
            </>
          )}
        </div>
      </div>
      <div className="settings-group">
        <div className="settings-group-title">或使用</div>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void handleGitHub()}>GitHub 登录</button>
      </div>
      {auth.error && <div className="settings-group"><div className="note-block note-error">{auth.error}</div></div>}
    </div>
  );
}
