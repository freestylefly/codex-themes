import { Loader2, Send, Store, UploadCloud, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "../store";

const PRICE_TIERS = [0, 49, 99, 199, 399] as const;
const STATUS_LABELS: Record<string, string> = {
  uploading: "上传中",
  pending: "待审核",
  approved: "已上架",
  rejected: "已驳回",
  withdrawn: "已撤回",
  failed: "校验失败",
};

export function CreatorCenter() {
  const auth = useApp((s) => s.auth);
  const profile = useApp((s) => s.profile);
  const themes = useApp((s) => s.themes);
  const submissions = useApp((s) => s.submissions);
  const setPage = useApp((s) => s.setPage);
  const submitTheme = useApp((s) => s.submitTheme);
  const withdrawSubmission = useApp((s) => s.withdrawSubmission);
  const unpublishOwnTheme = useApp((s) => s.unpublishOwnTheme);
  const [localThemeId, setLocalThemeId] = useState("");
  const [communityThemeId, setCommunityThemeId] = useState("");
  const [sourceKind, setSourceKind] = useState<"custom" | "ai">("custom");
  const [price, setPrice] = useState<(typeof PRICE_TIERS)[number]>(99);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);

  const localWorks = themes.filter((theme) => theme.source === "custom");
  const communityWorks = useMemo(() => {
    const map = new Map<string, (typeof submissions)[number]>();
    for (const submission of submissions) {
      if (!map.has(submission.themeId)) map.set(submission.themeId, submission);
    }
    return [...map.values()];
  }, [submissions]);

  if (auth?.status !== "authenticated") {
    return (
      <div className="page">
        <div className="empty-gallery">
          登录后即可发布本地自定义主题或 AI 工作室保存的作品。
          <button className="btn btn-primary" onClick={() => setPage("account")}>去登录</button>
        </div>
      </div>
    );
  }
  if (!profile?.handle) {
    return (
      <div className="page">
        <div className="empty-gallery">
          投稿前需要设置公开用户名和昵称，广场不会展示你的邮箱。
          <button className="btn btn-primary" onClick={() => setPage("account")}>设置公开资料</button>
        </div>
      </div>
    );
  }

  const publish = async () => {
    if (!localThemeId || !rights) return;
    setBusy(true);
    try {
      await submitTheme({
        localThemeId,
        sourceKind,
        proposedPricePoints: price,
        rightsAccepted: true,
        themeId: communityThemeId || undefined,
      });
      setRights(false);
      setCommunityThemeId("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">创作者中心</h1>
          <p className="page-sub">上传后先经过自动安全校验，再进入管理员审核；更新版本不会影响当前上架版本。</p>
        </div>
      </div>

      <section className="settings-group submission-form">
        <div className="settings-group-title">发布到官方应用广场</div>
        <div className="submission-form-grid">
          <label>
            <span>本地作品</span>
            <select value={localThemeId} onChange={(e) => setLocalThemeId(e.target.value)}>
              <option value="">选择自定义 / AI 作品</option>
              {localWorks.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
            </select>
          </label>
          <label>
            <span>投稿类型</span>
            <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value as typeof sourceKind)}>
              <option value="custom">自定义主题</option>
              <option value="ai">AI 工作室作品</option>
            </select>
          </label>
          <label>
            <span>发布方式</span>
            <select value={communityThemeId} onChange={(e) => setCommunityThemeId(e.target.value)}>
              <option value="">创建新作品</option>
              {communityWorks.map((item) => (
                <option key={item.themeId} value={item.themeId}>更新「{item.name}」</option>
              ))}
            </select>
          </label>
          <label>
            <span>建议积分价格</span>
            <select value={price} onChange={(e) => setPrice(Number(e.target.value) as typeof price)}>
              {PRICE_TIERS.map((tier) => <option key={tier} value={tier}>{tier === 0 ? "免费" : `${tier} 积分`}</option>)}
            </select>
          </label>
        </div>
        <label className="rights-check">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
          我确认拥有图片及内容的分发权，并授予平台非独占分发许可。
        </label>
        <button className="btn btn-primary" disabled={busy || !localThemeId || !rights} onClick={() => void publish()}>
          {busy ? <Loader2 size={14} className="spin" /> : <UploadCloud size={14} />}上传并提交审核
        </button>
      </section>

      <section className="settings-group">
        <div className="settings-group-title">我的作品与投稿</div>
        <div className="submission-list">
          {submissions.length === 0 && <div className="empty-gallery">还没有投稿记录。</div>}
          {submissions.map((item) => (
            <article className="submission-row" key={item.id}>
              <div className="submission-preview">
                {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <Store size={20} />}
              </div>
              <div className="submission-copy">
                <strong>{item.name} <span className={`submission-status status-${item.status}`}>{STATUS_LABELS[item.status]}</span></strong>
                <span>v{item.version} · 建议 {item.proposedPricePoints} 积分{item.approvedPricePoints != null ? ` · 审核价 ${item.approvedPricePoints}` : ""}</span>
                {item.reviewReason && <small>审核说明：{item.reviewReason}</small>}
              </div>
              <div className="submission-actions">
                {["uploading", "pending"].includes(item.status) && (
                  <button className="btn btn-ghost" onClick={() => void withdrawSubmission(item.id)}>
                    <XCircle size={13} />撤回
                  </button>
                )}
                {item.status === "approved" && (
                  <button
                    className="btn btn-ghost btn-danger"
                    onClick={() => void unpublishOwnTheme(item.themeId, "作者主动下架")}
                  >
                    下架作品
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="note-block"><Send size={14} />每位不同用户首次付费解锁时，作者获得实付积分的 70%（向下取整）；免费、自购和重复下载不产生奖励。</div>
    </div>
  );
}
