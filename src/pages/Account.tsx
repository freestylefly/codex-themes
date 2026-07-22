import { Loader2, LogOut, Mail, User } from "lucide-react";
import { useState } from "react";
import { useApp } from "../store";

export function Account() {
  const auth = useApp((s) => s.auth);
  const entitlements = useApp((s) => s.entitlements);
  const sendEmailOtp = useApp((s) => s.sendEmailOtp);
  const verifyEmailOtp = useApp((s) => s.verifyEmailOtp);
  const signInGitHub = useApp((s) => s.signInGitHub);
  const signOut = useApp((s) => s.signOut);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!auth) {
    return (
      <div className="page">
        <div className="loading-screen">
          <Loader2 size={22} className="spin" />
        </div>
      </div>
    );
  }

  if (auth.status === "authenticated" && auth.user) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">账号</h1>
            <p className="page-sub">管理你的 Codex Themes 账号与已购主题。{/* */}</p>
          </div>
        </div>

        <div className="settings-group">
          <div className="account-card">
            <div className="account-avatar">
              {auth.user.avatarUrl ? (
                <img src={auth.user.avatarUrl} alt="" />
              ) : (
                <User size={32} />
              )}
            </div>
            <div className="account-info">
              <div className="account-email">{auth.user.email}</div>
              <div className="account-meta">
                通过 {auth.user.provider === "github" ? "GitHub" : "邮箱"} 登录 · 已购 {entitlements.length} 款主题
              </div>
            </div>
            <button className="btn btn-ghost btn-icon btn-danger" onClick={() => void signOut()} title="退出登录">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {entitlements.length > 0 && (
          <div className="settings-group">
            <div className="settings-group-title">已购主题</div>
            <ul className="account-entitlements">
              {entitlements.map((item) => (
                <li key={item.themeId}>
                  <span>{item.themeName}</span>
                  <span className="badge badge-version">v{item.version}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
          <h1 className="page-title">账号</h1>
          <p className="page-sub">登录后可购买精品主题并在设备间同步已购内容。{/* */}</p>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">邮箱验证码登录</div>
        <div className="account-form">
          <div className="account-field">
            <Mail size={15} />
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
          </div>
          {!otpSent ? (
            <button className="btn btn-primary" disabled={busy || !email.includes("@")} onClick={() => void handleSendOtp()}>
              {busy && <Loader2 size={13} className="spin" />}
              发送验证码
            </button>
          ) : (
            <>
              <div className="account-field">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="六位验证码"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  disabled={busy}
                />
              </div>
              <button className="btn btn-primary" disabled={busy || otp.length < 6} onClick={() => void handleVerifyOtp()}>
                {busy && <Loader2 size={13} className="spin" />}
                登录
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void handleSendOtp()}>
                重新发送
              </button>
            </>
          )}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">或使用</div>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void handleGitHub()}>
          GitHub 登录
        </button>
      </div>

      {auth.error && (
        <div className="settings-group">
          <div className="note-block note-error">{auth.error}</div>
        </div>
      )}
    </div>
  );
}
