import {
  BarChart3,
  Check,
  CircleAlert,
  Clock3,
  Coins,
  Eye,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UploadCloud,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import type {
  ThemeSubmission,
  ThemeSubmissionStatus,
  ThemeSummary,
} from "../../electron/shared/types";
import { useApp } from "../store";

const PRICE_TIERS = [0, 49, 99, 199, 399] as const;

type WorkStatus =
  | ThemeSubmissionStatus
  | "draft"
  | "unpublished"
  | "suspended";

type WorkFilter = "all" | "published" | "review" | "action";

interface CreatorWork {
  key: string;
  themeId: string | null;
  localThemeId: string | null;
  name: string;
  tagline: string;
  description: string;
  version: string;
  previewUrl: string;
  status: WorkStatus;
  pricePoints: number;
  priceCents: number;
  uniqueUsers: number;
  totalRewardPoints: number;
  recentUnlocks: number;
  recentRewardPoints: number;
  dailyUnlocks: Array<{ date: string; count: number }>;
  sourceKind: "custom" | "ai";
  latestSubmission: ThemeSubmission | null;
  versions: ThemeSubmission[];
  publishedAt: string | null;
  published: boolean;
  downloadsEnabled: boolean;
}

const STATUS_LABELS: Record<WorkStatus, string> = {
  draft: "未投稿",
  uploading: "上传与校验",
  pending: "审核中",
  approved: "已上架",
  rejected: "已驳回",
  withdrawn: "已撤回",
  failed: "校验失败",
  unpublished: "已下架",
  suspended: "下载停用",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "尚未发生";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function deriveRemoteStatus(submission: ThemeSubmission): WorkStatus {
  if (submission.product?.downloadsEnabled === false) return "suspended";
  if (submission.status === "approved" && submission.product?.published === false) {
    return "unpublished";
  }
  return submission.status;
}

function localSignature(theme: Pick<ThemeSummary, "name" | "layout">): string {
  return `${theme.name.trim().toLocaleLowerCase()}::${theme.layout}`;
}

function submissionSignature(
  submission: Pick<ThemeSubmission, "name" | "layout">,
): string {
  return `${submission.name.trim().toLocaleLowerCase()}::${submission.layout}`;
}

function buildCreatorWorks(
  localWorks: ThemeSummary[],
  submissions: ThemeSubmission[],
): CreatorWork[] {
  const groups = new Map<string, ThemeSubmission[]>();
  for (const submission of submissions) {
    const group = groups.get(submission.themeId) ?? [];
    group.push(submission);
    groups.set(submission.themeId, group);
  }

  const remoteSignatures = new Set<string>();
  const remoteWorks = [...groups.entries()].map(([themeId, versions]) => {
    versions.sort((left, right) => right.revision - left.revision);
    const latest = versions[0];
    remoteSignatures.add(submissionSignature(latest));
    const product = versions.find((item) => item.product)?.product ?? null;
    const matchingLocal = localWorks.find(
      (theme) => localSignature(theme) === submissionSignature(latest),
    );
    const metrics = latest.metrics ?? {
      uniqueUsers: product?.unlockCount ?? 0,
      totalRewardPoints: 0,
      recentUnlocks: 0,
      recentRewardPoints: 0,
      dailyUnlocks: [],
    };
    return {
      key: `remote:${themeId}`,
      themeId,
      localThemeId: matchingLocal?.id ?? null,
      name: latest.name,
      tagline: latest.tagline,
      description: latest.description,
      version: product?.version ?? latest.version,
      previewUrl:
        latest.previewUrl
        ?? product?.previewUrl
        ?? matchingLocal?.previewUrl
        ?? "",
      status: deriveRemoteStatus(latest),
      pricePoints:
        product?.pricePoints
        ?? latest.approvedPricePoints
        ?? latest.proposedPricePoints,
      priceCents: product?.priceCents ?? 0,
      uniqueUsers: metrics.uniqueUsers,
      totalRewardPoints: metrics.totalRewardPoints,
      recentUnlocks: metrics.recentUnlocks,
      recentRewardPoints: metrics.recentRewardPoints,
      dailyUnlocks: metrics.dailyUnlocks,
      sourceKind: latest.sourceKind,
      latestSubmission: latest,
      versions,
      publishedAt: product?.publishedAt ?? null,
      published: product?.published === true,
      downloadsEnabled: product?.downloadsEnabled !== false,
    } satisfies CreatorWork;
  });

  const localOnlyWorks = localWorks
    .filter((theme) => !remoteSignatures.has(localSignature(theme)))
    .map((theme) => ({
      key: `local:${theme.id}`,
      themeId: null,
      localThemeId: theme.id,
      name: theme.name,
      tagline: theme.tagline,
      description: theme.description,
      version: theme.version,
      previewUrl: theme.previewUrl,
      status: "draft" as const,
      pricePoints: 99,
      priceCents: 0,
      uniqueUsers: 0,
      totalRewardPoints: 0,
      recentUnlocks: 0,
      recentRewardPoints: 0,
      dailyUnlocks: [],
      sourceKind: "custom" as const,
      latestSubmission: null,
      versions: [],
      publishedAt: null,
      published: false,
      downloadsEnabled: true,
    }));

  return [...remoteWorks, ...localOnlyWorks].sort((left, right) => {
    const leftTime = left.latestSubmission?.createdAt ?? "";
    const rightTime = right.latestSubmission?.createdAt ?? "";
    return rightTime.localeCompare(leftTime);
  });
}

function reviewSteps(work: CreatorWork) {
  const status = work.status;
  const latest = work.latestSubmission;
  const autoState =
    status === "failed"
      ? "failed"
      : status === "uploading"
        ? "active"
        : status === "draft"
          ? "idle"
          : "complete";
  const reviewState =
    status === "pending"
      ? "active"
      : status === "rejected"
        ? "failed"
        : ["approved", "unpublished", "suspended"].includes(status)
          ? "complete"
          : "idle";
  const publishState =
    work.published && work.downloadsEnabled
      ? "complete"
      : status === "suspended"
        ? "failed"
        : "idle";
  return [
    {
      key: "safe",
      title: "自动校验",
      state: autoState,
      detail:
        status === "failed"
          ? latest?.reviewReason ?? "自动校验未完成"
          : autoState === "complete"
            ? "通过"
            : autoState === "active"
              ? "检查包结构、图片与对比度"
              : "等待投稿",
      time: latest?.submittedAt ?? latest?.createdAt,
    },
    {
      key: "review",
      title: "人工审核",
      state: reviewState,
      detail:
        status === "rejected"
          ? "未通过"
          : reviewState === "complete"
            ? "通过"
            : reviewState === "active"
              ? "审核中"
              : "尚未开始",
      time: latest?.reviewedAt,
    },
    {
      key: "publish",
      title:
        status === "suspended"
          ? "下载停用"
          : status === "unpublished"
            ? "已下架"
            : "已上架",
      state: publishState,
      detail:
        status === "suspended"
          ? "远程下载已停止"
          : work.published
            ? "官方应用广场"
            : "等待审核通过",
      time: work.publishedAt,
    },
  ] as const;
}

function statusMatchesFilter(status: WorkStatus, filter: WorkFilter): boolean {
  if (filter === "all") return true;
  if (filter === "published") return status === "approved";
  if (filter === "review") return status === "uploading" || status === "pending";
  return ["rejected", "failed", "withdrawn", "unpublished", "suspended"].includes(status);
}

export function CreatorCenter() {
  const auth = useApp((s) => s.auth);
  const profile = useApp((s) => s.profile);
  const themes = useApp((s) => s.themes);
  const submissions = useApp((s) => s.submissions);
  const setPage = useApp((s) => s.setPage);
  const refreshSubmissions = useApp((s) => s.refreshSubmissions);
  const submitTheme = useApp((s) => s.submitTheme);
  const retrySubmission = useApp((s) => s.retrySubmission);
  const withdrawSubmission = useApp((s) => s.withdrawSubmission);
  const unpublishOwnTheme = useApp((s) => s.unpublishOwnTheme);

  const [filter, setFilter] = useState<WorkFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [workMenuOpen, setWorkMenuOpen] = useState(false);
  const [localThemeId, setLocalThemeId] = useState("");
  const [communityThemeId, setCommunityThemeId] = useState("");
  const [sourceKind, setSourceKind] = useState<"custom" | "ai">("custom");
  const [price, setPrice] = useState<(typeof PRICE_TIERS)[number]>(99);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);

  const localWorks = useMemo(
    () => themes.filter((theme) => theme.source === "custom"),
    [themes],
  );
  const works = useMemo(
    () => buildCreatorWorks(localWorks, submissions),
    [localWorks, submissions],
  );
  const filteredWorks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return works.filter((work) => (
      statusMatchesFilter(work.status, filter)
      && (
        !normalizedQuery
        || `${work.name} ${work.tagline}`.toLocaleLowerCase().includes(normalizedQuery)
      )
    ));
  }, [filter, query, works]);
  const selectedWork =
    filteredWorks.find((work) => work.key === selectedKey)
    ?? filteredWorks[0]
    ?? null;
  const reviewCount = works.filter(
    (work) => work.status === "uploading" || work.status === "pending",
  ).length;

  useEffect(() => {
    if (auth?.status === "authenticated") void refreshSubmissions();
  }, [auth?.status, refreshSubmissions]);

  useEffect(() => {
    if (selectedWork && selectedWork.key !== selectedKey) {
      setSelectedKey(selectedWork.key);
    }
  }, [selectedKey, selectedWork]);

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

  const openPublish = (work?: CreatorWork | null) => {
    const matchingLocalId = work?.localThemeId ?? localWorks[0]?.id ?? "";
    setLocalThemeId(matchingLocalId);
    setCommunityThemeId(work?.themeId ?? "");
    setSourceKind(work?.sourceKind ?? "custom");
    setPrice(
      PRICE_TIERS.includes((work?.pricePoints ?? 99) as (typeof PRICE_TIERS)[number])
        ? (work?.pricePoints ?? 99) as (typeof PRICE_TIERS)[number]
        : 99,
    );
    setRights(false);
    setWorkMenuOpen(false);
    setPublishOpen(true);
  };

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
      await refreshSubmissions();
      setPublishOpen(false);
      setRights(false);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (submissionId: string) => {
    setWorkMenuOpen(false);
    await withdrawSubmission(submissionId);
    await refreshSubmissions();
  };

  const retryValidation = async (submissionId: string) => {
    setWorkMenuOpen(false);
    setBusy(true);
    try {
      await retrySubmission(submissionId);
      await refreshSubmissions();
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async (themeId: string) => {
    setWorkMenuOpen(false);
    await unpublishOwnTheme(themeId, "作者主动下架");
    await refreshSubmissions();
  };

  const steps = selectedWork ? reviewSteps(selectedWork) : [];
  const chartData = selectedWork?.dailyUnlocks.length
    ? selectedWork.dailyUnlocks.map((entry) => ({
        ...entry,
        label: entry.date.slice(5),
      }))
    : Array.from({ length: 30 }, (_, index) => ({
        date: "",
        label: index % 7 === 0 ? `第 ${index + 1} 天` : "",
        count: 0,
      }));

  return (
    <div className="page creator-workspace-page">
      <header className="creator-workspace-header">
        <div>
          <h1 className="page-title">创作者中心</h1>
          <p>{works.length} 个作品{reviewCount > 0 ? ` · ${reviewCount} 个审核中` : " · 暂无审核中的作品"}</p>
        </div>
        <button className="btn btn-primary creator-publish-button" onClick={() => openPublish(null)}>
          <Plus size={15} />发布新作品
        </button>
      </header>

      <div className="creator-workspace-grid">
        <section className="creator-library" aria-label="我的作品">
          <div className="creator-library-toolbar">
            <div className="creator-filter" role="tablist" aria-label="作品筛选">
              {([
                ["all", "全部"],
                ["published", "已上架"],
                ["review", "审核中"],
                ["action", "需处理"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={filter === value}
                  className={filter === value ? "active" : ""}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="creator-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索作品"
                aria-label="搜索作品"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="清空搜索">
                  <X size={13} />
                </button>
              )}
            </label>
          </div>

          <div className="creator-work-grid">
            {filteredWorks.map((work) => (
              <button
                key={work.key}
                className={`creator-work-card ${selectedWork?.key === work.key ? "selected" : ""}`}
                onClick={() => {
                  setSelectedKey(work.key);
                  setWorkMenuOpen(false);
                }}
              >
                <div className="creator-work-thumb">
                  {work.previewUrl ? (
                    <img src={work.previewUrl} alt={`${work.name}主题预览`} draggable={false} />
                  ) : (
                    <div className="creator-preview-missing"><Store size={24} />等待预览</div>
                  )}
                  <span className={`creator-status status-${work.status}`}>
                    <i />{STATUS_LABELS[work.status]}
                  </span>
                  {selectedWork?.key === work.key && (
                    <span className="creator-selected-mark"><Check size={13} /></span>
                  )}
                </div>
                <span className="creator-work-card-copy">
                  <strong>{work.name}</strong>
                  <small>v{work.version}</small>
                </span>
                <span className="creator-work-card-meta">
                  <b>{work.pricePoints === 0 ? "免费" : `${work.pricePoints} 积分`}</b>
                  <span><Users size={13} />{work.uniqueUsers.toLocaleString("zh-CN")}</span>
                </span>
              </button>
            ))}
          </div>

          {filteredWorks.length === 0 && (
            <div className="creator-library-empty">
              <Search size={22} />
              <strong>没有符合条件的作品</strong>
              <span>换个筛选条件，或者发布一个新作品。</span>
            </div>
          )}
          <div className="creator-library-count">
            显示 {filteredWorks.length} / {works.length} 个作品
          </div>
        </section>

        <aside className="creator-inspector" aria-label="作品详情">
          {selectedWork ? (
            <>
              <div className="creator-inspector-preview">
                {selectedWork.previewUrl ? (
                  <img
                    src={selectedWork.previewUrl}
                    alt={`${selectedWork.name}大图预览`}
                    draggable={false}
                  />
                ) : (
                  <div className="creator-preview-missing">
                    {selectedWork.status === "failed"
                      ? <CircleAlert size={30} />
                      : <Store size={30} />}
                    <strong>
                      {selectedWork.status === "failed" ? "预览生成失败" : "预览正在生成"}
                    </strong>
                    <span>
                      {selectedWork.status === "failed"
                        ? "可以直接重新校验；若主题包本身有问题，请修改后重新提交。"
                        : "上传完成并通过安全检查后会显示作品画面。"}
                    </span>
                  </div>
                )}
                {selectedWork.previewUrl && (
                  <button onClick={() => setPreviewOpen(true)}>
                    <Eye size={14} />查看大图
                  </button>
                )}
              </div>

              <div className="creator-inspector-titlebar">
                <div>
                  <div className="creator-title-line">
                    <h2>{selectedWork.name}</h2>
                    <span className={`creator-status status-${selectedWork.status}`}>
                      <i />{STATUS_LABELS[selectedWork.status]}
                    </span>
                  </div>
                  <p>版本 v{selectedWork.version}</p>
                </div>
                <div className="creator-inspector-actions">
                  {(selectedWork.status === "uploading" || selectedWork.status === "failed")
                    && selectedWork.latestSubmission ? (
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => void retryValidation(selectedWork.latestSubmission!.id)}
                    >
                      <RefreshCw size={14} className={busy ? "spin" : ""} />
                      {busy ? "正在校验" : "重新校验"}
                    </button>
                    ) : (
                    <button
                      className="btn btn-secondary"
                      disabled={selectedWork.status === "pending"}
                      onClick={() => openPublish(selectedWork)}
                    >
                      {selectedWork.status === "draft" ? "发布作品" : "发布新版本"}
                    </button>
                    )}
                  <div className="creator-work-menu-wrap">
                    <button
                      className="btn btn-ghost creator-more-button"
                      aria-label="更多作品操作"
                      aria-expanded={workMenuOpen}
                      onClick={() => setWorkMenuOpen((value) => !value)}
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    {workMenuOpen && (
                      <div className="creator-work-menu">
                        {(selectedWork.status === "uploading" || selectedWork.status === "pending")
                          && selectedWork.latestSubmission && (
                          <button onClick={() => void withdraw(selectedWork.latestSubmission!.id)}>
                            <XCircle size={14} />撤回投稿
                          </button>
                        )}
                        {selectedWork.status === "approved" && selectedWork.themeId && (
                          <button
                            className="danger"
                            onClick={() => void unpublish(selectedWork.themeId!)}
                          >
                            <XCircle size={14} />下架作品
                          </button>
                        )}
                        {!["uploading", "pending", "approved"].includes(selectedWork.status) && (
                          <button onClick={() => openPublish(selectedWork)}>
                            <RefreshCw size={14} />重新提交
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <section className="creator-review-path" aria-label="审核进度">
                {steps.map((step) => (
                  <div className={`creator-review-step ${step.state}`} key={step.key}>
                    <span className="creator-review-dot">
                      {step.state === "complete" && <Check size={13} />}
                      {step.state === "failed" && <X size={13} />}
                      {step.state === "active" && <Clock3 size={13} />}
                    </span>
                    <strong>{step.title}</strong>
                    <small>{step.detail}</small>
                    <time>{formatDateTime(step.time)}</time>
                  </div>
                ))}
              </section>

              {selectedWork.latestSubmission?.reviewReason && (
                <div className={`creator-review-note status-${selectedWork.status}`}>
                  {selectedWork.status === "rejected" || selectedWork.status === "failed"
                    ? <CircleAlert size={15} />
                    : <ShieldCheck size={15} />}
                  <span>
                    <strong>
                      {selectedWork.status === "failed" ? "校验结果：" : "审核意见："}
                    </strong>
                    {selectedWork.latestSubmission.reviewReason}
                  </span>
                </div>
              )}

              <section className="creator-performance">
                <div className="creator-metric-row">
                  <div>
                    <span><Users size={13} />唯一使用人数</span>
                    <strong>{selectedWork.uniqueUsers.toLocaleString("zh-CN")}</strong>
                  </div>
                  <div>
                    <span><Coins size={13} />累计收益</span>
                    <strong>{selectedWork.totalRewardPoints.toLocaleString("zh-CN")} <small>积分</small></strong>
                  </div>
                  <div>
                    <span><BarChart3 size={13} />近 30 天</span>
                    <strong className="positive">+{selectedWork.recentUnlocks}</strong>
                  </div>
                  <div>
                    <span><Store size={13} />当前价格</span>
                    <strong>{selectedWork.pricePoints} <small>积分</small></strong>
                  </div>
                </div>
                <div className="creator-trend">
                  <ResponsiveContainer width="100%" height={112}>
                    <LineChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: 6 }}>
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        interval={6}
                        tick={{ fill: "#77717d", fontSize: 10 }}
                      />
                      <Tooltip
                        cursor={{ stroke: "rgba(231, 185, 92, .18)" }}
                        contentStyle={{
                          background: "#17171a",
                          border: "1px solid rgba(255,255,255,.1)",
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        labelStyle={{ color: "#aaa4af" }}
                        formatter={(value) => [`${Number(value)} 人`, "新增使用"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#e8b95d"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: "#f2c66f", strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="creator-version-history">
                <div className="creator-section-head">
                  <strong>版本记录</strong>
                  <span>{selectedWork.versions.length || 1} 个版本</span>
                </div>
                <div>
                  {selectedWork.versions.length > 0 ? selectedWork.versions.slice(0, 3).map((version) => (
                    <div className="creator-version-row" key={version.id}>
                      <strong>v{version.version}</strong>
                      <span className={`creator-status status-${version.status}`}>
                        {STATUS_LABELS[version.status]}
                      </span>
                      <time>{formatDateTime(version.reviewedAt ?? version.createdAt)}</time>
                      <small>{version.reviewReason || (version.status === "approved" ? "审核通过" : "等待状态更新")}</small>
                    </div>
                  )) : (
                    <div className="creator-version-row">
                      <strong>v{selectedWork.version}</strong>
                      <span className="creator-status status-draft">本地版本</span>
                      <small>尚未发布到官方应用广场</small>
                    </div>
                  )}
                </div>
              </section>

              <p className="creator-data-note">
                <ShieldCheck size={13} />
                作品数据按不同用户的首次解锁统计；重复下载、作者本人和退款权益不会重复计入。
              </p>
            </>
          ) : (
            <div className="creator-inspector-empty">
              <Store size={28} />
              <strong>{works.length > 0 ? "当前筛选没有作品" : "还没有作品"}</strong>
              <span>
                {works.length > 0
                  ? "调整筛选条件后选择作品，即可查看预览、审核状态与作品数据。"
                  : "先在自定义主题或 AI 工作室保存作品，然后发布到广场。"}
              </span>
              {works.length > 0 ? (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  查看全部作品
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => openPublish(null)}>发布新作品</button>
              )}
            </div>
          )}
        </aside>
      </div>

      {publishOpen && (
        <div className="modal-backdrop creator-publish-backdrop" role="presentation">
          <section
            className="creator-publish-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="creator-publish-title"
          >
            <header>
              <div>
                <h2 id="creator-publish-title">
                  {communityThemeId ? "发布新版本" : "发布新作品"}
                </h2>
                <p>作品会先经过自动安全校验，再进入管理员审核。</p>
              </div>
              <button className="modal-close" onClick={() => setPublishOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </header>
            <div className="creator-publish-preview">
              {localWorks.find((item) => item.id === localThemeId)?.previewUrl ? (
                <img
                  src={localWorks.find((item) => item.id === localThemeId)!.previewUrl}
                  alt="待发布作品预览"
                />
              ) : (
                <div className="creator-preview-missing"><Store size={24} />选择一件本地作品</div>
              )}
            </div>
            <div className="submission-form-grid creator-publish-fields">
              <label>
                <span>本地作品</span>
                <select value={localThemeId} onChange={(event) => setLocalThemeId(event.target.value)}>
                  <option value="">选择自定义 / AI 作品</option>
                  {localWorks.map((theme) => (
                    <option key={theme.id} value={theme.id}>{theme.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>投稿类型</span>
                <select value={sourceKind} onChange={(event) => setSourceKind(event.target.value as typeof sourceKind)}>
                  <option value="custom">自定义主题</option>
                  <option value="ai">AI 工作室作品</option>
                </select>
              </label>
              <label>
                <span>发布方式</span>
                <select value={communityThemeId} onChange={(event) => setCommunityThemeId(event.target.value)}>
                  <option value="">创建新作品</option>
                  {works.filter((item) => item.themeId).map((item) => (
                    <option key={item.themeId!} value={item.themeId!}>更新「{item.name}」</option>
                  ))}
                </select>
              </label>
              <label>
                <span>建议积分价格</span>
                <select value={price} onChange={(event) => setPrice(Number(event.target.value) as typeof price)}>
                  {PRICE_TIERS.map((tier) => (
                    <option key={tier} value={tier}>{tier === 0 ? "免费" : `${tier} 积分`}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="rights-check creator-publish-rights">
              <input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} />
              我确认拥有图片及内容的分发权，并授予平台非独占分发许可。
            </label>
            <footer>
              <button className="btn btn-secondary" onClick={() => setPublishOpen(false)}>取消</button>
              <button
                className="btn btn-primary"
                disabled={busy || !localThemeId || !rights}
                onClick={() => void publish()}
              >
                {busy ? <RefreshCw size={14} className="spin" /> : <UploadCloud size={14} />}
                上传并提交审核
              </button>
            </footer>
          </section>
        </div>
      )}

      {previewOpen && selectedWork?.previewUrl && (
        <div className="modal-backdrop creator-preview-backdrop" onClick={() => setPreviewOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label={`${selectedWork.name}大图预览`} onClick={(event) => event.stopPropagation()}>
            <button onClick={() => setPreviewOpen(false)} aria-label="关闭大图预览"><X size={18} /></button>
            <img src={selectedWork.previewUrl} alt={`${selectedWork.name}大图预览`} />
          </section>
        </div>
      )}
    </div>
  );
}
