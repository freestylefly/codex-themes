import { Ban, Check, Coins, Loader2, RefreshCw, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ThemeSubmissionStatus } from "../../electron/shared/types";
import { useApp } from "../store";

const REVIEW_STATUSES: ThemeSubmissionStatus[] = ["pending", "approved", "rejected", "withdrawn", "failed"];

export function Admin() {
  const profile = useApp((s) => s.profile);
  const overview = useApp((s) => s.adminOverview);
  const submissions = useApp((s) => s.adminSubmissions);
  const refreshAdmin = useApp((s) => s.refreshAdmin);
  const reviewSubmission = useApp((s) => s.reviewSubmission);
  const adminAdjustPoints = useApp((s) => s.adminAdjustPoints);
  const adminSetThemeState = useApp((s) => s.adminSetThemeState);
  const adminReconcilePointOrder = useApp((s) => s.adminReconcilePointOrder);
  const adminRefundPointOrder = useApp((s) => s.adminRefundPointOrder);
  const adminReconcileThemeOrder = useApp((s) => s.adminReconcileThemeOrder);
  const adminRefundThemeOrder = useApp((s) => s.adminRefundThemeOrder);
  const [status, setStatus] = useState<ThemeSubmissionStatus>("pending");
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState(99);
  const [userId, setUserId] = useState("");
  const [delta, setDelta] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.isAdmin) void refreshAdmin(status);
  }, [profile?.isAdmin, refreshAdmin, status]);

  if (!profile?.isAdmin) {
    return <div className="page"><div className="note-block note-error">此入口仅对管理员开放；服务端接口会再次验证管理员角色。</div></div>;
  }

  const review = async (id: string, action: "approve" | "reject") => {
    if (reason.trim().length < 2) return;
    setBusyId(id);
    await reviewSubmission(id, { action, pricePoints: action === "approve" ? price : undefined, reason });
    setBusyId(null);
    setReason("");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">审核与财务后台</h1>
          <p className="page-sub">审核发布、下载控制、积分对账和不可变流水审计。</p>
        </div>
        <button className="btn" onClick={() => void refreshAdmin(status)}><RefreshCw size={14} />刷新</button>
      </div>

      <div className="admin-metrics">
        <Metric label="待审作品" value={overview?.pendingSubmissions ?? 0} />
        <Metric label="社区上架" value={overview?.publishedCommunityThemes ?? 0} />
        <Metric label="积分充值收入" value={`¥${((overview?.grossPointRevenueCents ?? 0) / 100).toFixed(2)}`} />
        <Metric label="主题支付宝收入" value={`¥${((overview?.grossThemeRevenueCents ?? 0) / 100).toFixed(2)}`} />
        <Metric label="流通积分" value={overview?.pointsInCirculation ?? 0} />
        <Metric label="作者累计收益" value={overview?.lifetimeCreatorRewards ?? 0} />
      </div>

      <section className="settings-group">
        <div className="admin-section-head">
          <div className="settings-group-title">作品审核</div>
          <select value={status} onChange={(e) => setStatus(e.target.value as ThemeSubmissionStatus)}>
            {REVIEW_STATUSES.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </div>
        <div className="admin-review-controls">
          <select value={price} onChange={(e) => setPrice(Number(e.target.value))}>
            {[0, 49, 99, 199, 399].map((item) => <option value={item} key={item}>审核价：{item} 积分</option>)}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="审核/价格调整/状态变更原因（必填）" />
        </div>
        <div className="submission-list">
          {submissions.length === 0 && <div className="empty-gallery">当前队列为空。</div>}
          {submissions.map((item) => (
            <article className="submission-row admin-submission-row" key={item.id}>
              <div className="submission-preview">{item.previewUrl ? <img src={item.previewUrl} alt="" /> : <ShieldCheck size={20} />}</div>
              <div className="submission-copy">
                <strong>{item.name} · v{item.version}</strong>
                <span>@{item.author?.handle ?? "creator"} · 建议 {item.proposedPricePoints} 积分 · {item.layout}</span>
                <small>{item.description}</small>
              </div>
              <div className="submission-actions">
                {item.status === "pending" && (
                  <>
                    <button className="btn btn-primary" disabled={busyId === item.id || reason.trim().length < 2} onClick={() => void review(item.id, "approve")}>
                      {busyId === item.id ? <Loader2 size={13} className="spin" /> : <Check size={13} />}批准
                    </button>
                    <button className="btn btn-ghost btn-danger" disabled={busyId === item.id || reason.trim().length < 2} onClick={() => void review(item.id, "reject")}><X size={13} />驳回</button>
                  </>
                )}
                {item.status === "approved" && (
                  <>
                    <button className="btn btn-ghost" disabled={reason.trim().length < 2} onClick={() => void adminSetThemeState(item.themeId, "unpublish", reason)}>下架</button>
                    <button className="btn btn-ghost btn-danger" disabled={reason.trim().length < 2} onClick={() => void adminSetThemeState(item.themeId, "suspend_downloads", reason)}><Ban size={13} />停用下载</button>
                    <button className="btn btn-ghost" disabled={reason.trim().length < 2} onClick={() => void adminSetThemeState(item.themeId, "restore_downloads", reason)}>恢复下载</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-title">主题销量与作者收益</div>
        <div className="ledger-list">
          {(overview?.themeSales ?? []).map((theme) => (
            <div className="ledger-row" key={theme.themeId}>
              <div><strong>{theme.name}</strong><span>{theme.themeId}</span></div>
              <div><strong>{theme.unlockCount} 位用户</strong><span>消费 {theme.pointsSpent} · 作者收益 {theme.creatorRewards}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-title">用户余额</div>
        <div className="ledger-list">
          {(overview?.userBalances ?? []).slice(0, 100).map((account) => (
            <div className="ledger-row" key={account.userId}>
              <div><strong>{account.displayName} {account.handle ? `@${account.handle}` : ""}</strong><span>{account.userId}</span></div>
              <div><strong>{account.balance} 积分</strong><span>充值 {account.lifetimePurchased} · 收益 {account.lifetimeEarned} · 消费 {account.lifetimeSpent}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-title">受控积分调账</div>
        <div className="admin-adjust-form">
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="用户 UUID" />
          <input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} placeholder="积分增减" />
          <input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="调账原因" />
          <button
            className="btn btn-primary"
            disabled={!/^[0-9a-f-]{36}$/i.test(userId) || !Number.isInteger(delta) || delta === 0 || adjustReason.length < 3}
            onClick={() => void adminAdjustPoints({ userId, delta, reason: adjustReason })}
          ><Coins size={13} />写入调账流水</button>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-title">最近支付宝主题订单</div>
        <div className="ledger-list">
          {(overview?.recentThemeOrders ?? []).map((order) => (
            <div className="ledger-row" key={order.id}>
              <div><strong>{order.themeName} · ¥{(order.priceCents / 100).toFixed(2)}</strong><span>{order.userId} · {order.outTradeNo} · {order.status}</span></div>
              <div className="admin-order-actions">
                <button className="btn btn-ghost" onClick={() => void adminReconcileThemeOrder(order.id)}><RefreshCw size={12} />对账</button>
                {order.status === "paid" && (
                  <button
                    className="btn btn-ghost btn-danger"
                    onClick={() => {
                      const refundReason = window.prompt("退款原因（作者奖励积分可完整扣回时才允许）");
                      if (refundReason && refundReason.length >= 3) void adminRefundThemeOrder(order.id, refundReason);
                    }}
                  ><RotateCcw size={12} />退款</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-title">最近积分订单</div>
        <div className="ledger-list">
          {(overview?.recentPointOrders ?? []).map((order) => (
            <div className="ledger-row" key={order.id}>
              <div><strong>{order.packName} · ¥{(order.priceCents / 100).toFixed(2)}</strong><span>{order.userId} · {order.outTradeNo} · {order.status}</span></div>
              <div className="admin-order-actions">
                <button className="btn btn-ghost" onClick={() => void adminReconcilePointOrder(order.id)}><RefreshCw size={12} />对账</button>
                {order.status === "paid" && (
                  <button
                    className="btn btn-ghost btn-danger"
                    onClick={() => {
                      const refundReason = window.prompt("退款原因（仅余额足以全额扣回积分时可退款）");
                      if (refundReason && refundReason.length >= 3) void adminRefundPointOrder(order.id, refundReason);
                    }}
                  ><RotateCcw size={12} />退款</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-title">最近审计流水</div>
        <div className="ledger-list">
          {(overview?.recentLedger ?? []).slice(0, 30).map((entry) => (
            <div className="ledger-row" key={entry.id}>
              <div><strong>{entry.entryType}</strong><span>{entry.userId} · {entry.reason ?? entry.themeId ?? "—"}</span></div>
              <div className={entry.delta >= 0 ? "points-positive" : "points-negative"}>{entry.delta >= 0 ? "+" : ""}{entry.delta}<small>余额 {entry.balanceAfter}</small></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="admin-metric"><span>{label}</span><strong>{value}</strong></div>;
}
