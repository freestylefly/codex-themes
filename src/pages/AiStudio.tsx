/**
 * AI Theme Studio — canvas-first, durable multi-turn creation.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleStop,
  GitCompareArrows,
  History,
  ImagePlus,
  Loader2,
  Monitor,
  MessageSquareText,
  Moon,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import type {
  AiThemeCandidate,
  AiThemeCandidateBatch,
  AiThemeJob,
  AiThemeJobStage,
  AiThemeMessageMode,
  AiThemeRevision,
  LoadedThemeDraft,
  NormalizedTheme,
  ThemeGenerationRequest,
} from "../../electron/shared/types";
import { defaultNormalizedTheme } from "../../electron/engine/normalize";
import { api } from "../api";
import { LayoutCardSelector } from "../components/LayoutCardSelector";
import { PreviewCanvas } from "../components/PreviewCanvas";
import { TaskPreviewCanvas } from "../components/TaskPreviewCanvas";
import { useApp } from "../store";
import { previewThemeFromLoadedDraft } from "../themePreview";

const STAGE_LABEL: Record<AiThemeJobStage, string> = {
  created: "已创建",
  preparing: "正在理解需求",
  "generating-images": "正在生成候选主图",
  "awaiting-selection": "请选择一张候选主图",
  "generating-recipe": "正在调整主题",
  synthesizing: "正在合成主题",
  "preview-ready": "主题预览已就绪",
  adopting: "正在保存主题",
  saving: "正在保存主题",
  completed: "主题已完成",
  failed: "生成失败",
  cancelled: "已停止",
};

const STAGE_PROGRESS: Record<AiThemeJobStage, number> = {
  created: 4,
  preparing: 12,
  "generating-images": 46,
  "awaiting-selection": 64,
  "generating-recipe": 78,
  synthesizing: 88,
  "preview-ready": 100,
  adopting: 96,
  saving: 97,
  completed: 100,
  failed: 0,
  cancelled: 0,
};

const MODE_LABEL: Record<ThemeGenerationRequest["mode"], string> = {
  "generate-image": "生成图片 + 主题",
  "use-reference-image": "使用参考图",
  "recipe-only": "仅生成配方",
};

const APPEARANCE_LABEL: Record<ThemeGenerationRequest["appearance"], string> = {
  auto: "自动外观",
  light: "浅色",
  dark: "深色",
};

const PROMPT_EXAMPLES = [
  "雨夜里的未来城市，蓝紫霓虹映在潮湿街道上，画面安静、通透，主体位于右侧。",
  "月夜云海中的国漫仙侠世界，银蓝与金色点缀，中央保留阅读安全区。",
  "清晨森林里的可爱蘑菇屋，柔和晨光、青绿色植物和温暖木质细节。",
];

function formatJobTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function candidateForRevision(job: AiThemeJob | null, revision: AiThemeRevision | null): AiThemeCandidate | null {
  if (!job || !revision) return null;
  for (const batch of job.candidateBatches) {
    const candidate = batch.candidates.find((item) => item.candidateId === revision.candidateId);
    if (candidate) return candidate;
  }
  return job.candidates.find((item) => item.candidateId === revision.candidateId) ?? null;
}

export function AiStudio() {
  const state = useApp((store) => store.state);
  const activeJob = useApp((store) => store.activeAiJob);
  const aiJobs = useApp((store) => store.aiJobs);
  const themes = useApp((store) => store.themes);
  const profile = useApp((store) => store.profile);
  const applyingId = useApp((store) => store.applyingId);
  const createAiJob = useApp((store) => store.createAiJob);
  const startAiJob = useApp((store) => store.startAiJob);
  const selectAiCandidate = useApp((store) => store.selectAiCandidate);
  const sendAiMessage = useApp((store) => store.sendAiMessage);
  const setAiRevision = useApp((store) => store.setAiRevision);
  const adoptAiRevision = useApp((store) => store.adoptAiRevision);
  const applyAiRevision = useApp((store) => store.applyAiRevision);
  const cancelAiOperation = useApp((store) => store.cancelAiOperation);
  const retryAiOperation = useApp((store) => store.retryAiOperation);
  const deleteAiJob = useApp((store) => store.deleteAiJob);
  const loadAiJob = useApp((store) => store.loadAiJob);
  const refreshAiJobs = useApp((store) => store.refreshAiJobs);
  const newAiConversation = useApp((store) => store.newAiConversation);
  const toast = useApp((store) => store.toast);
  const setPage = useApp((store) => store.setPage);
  const pendingApproval = useApp((store) => store.pendingApproval);
  const respondToApproval = useApp((store) => store.respondToApproval);
  const dismissApproval = useApp((store) => store.dismissApproval);

  const [prompt, setPrompt] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatMode, setChatMode] = useState<AiThemeMessageMode>("theme-only");
  const [mode, setMode] = useState<ThemeGenerationRequest["mode"]>("generate-image");
  const [appearance, setAppearance] = useState<ThemeGenerationRequest["appearance"]>("auto");
  const [layoutPreference, setLayoutPreference] = useState<ThemeGenerationRequest["layoutPreference"]>(undefined);
  const [candidateCount, setCandidateCount] = useState<1 | 2 | 3>(2);
  const [referenceImagePath, setReferenceImagePath] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"home" | "task">("home");
  const [compareMode, setCompareMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [busyCreating, setBusyCreating] = useState(false);
  const [demoDraft, setDemoDraft] = useState<LoadedThemeDraft | null>(null);
  const [exampleIndex, setExampleIndex] = useState(-1);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const cliReady = Boolean(
    state?.codexCli.installed
      && state.codexCli.supported
      && state.codexCli.appServerRunning
      && state.codexCli.authenticated,
  );
  const currentRevision = activeJob?.currentRevisionId
    ? activeJob.revisions.find((revision) => revision.revisionId === activeJob.currentRevisionId) ?? null
    : null;
  const activeBatch = useMemo(() => {
    if (!activeJob) return null;
    if (activeJob.operation?.batchId) {
      return activeJob.candidateBatches.find((batch) => batch.batchId === activeJob.operation?.batchId)
        ?? activeJob.candidateBatches.at(-1)
        ?? null;
    }
    return activeJob.candidateBatches.at(-1) ?? null;
  }, [activeJob]);
  const previewCandidate =
    candidateForRevision(activeJob, currentRevision)
    ?? activeBatch?.candidates.find((candidate) => candidate.candidateId === activeBatch.selectedCandidateId)
    ?? activeBatch?.candidates[0]
    ?? null;
  const previewTheme = useMemo(() => {
    if (activeJob?.recipe) return previewThemeFromRecipe(activeJob);
    if (activeJob) return provisionalThemeFromJob(activeJob);
    if (demoDraft) return previewThemeFromLoadedDraft(demoDraft);
    return defaultNormalizedTheme();
  }, [activeJob, demoDraft]);
  const previewHeroUrl = previewCandidate?.previewUrl ?? (!activeJob ? demoDraft?.heroPreviewUrl ?? null : null);
  const previewWallpaperUrl = activeJob
    ? previewTheme.wallpaper.enabled
      ? previewCandidate?.previewUrl ?? null
      : null
    : demoDraft?.wallpaperPreviewUrl ?? null;
  const previewStampUrl = !activeJob ? demoDraft?.stampPreviewUrl ?? null : null;
  const running = activeJob?.operation?.status === "running";
  const operationFailed = activeJob?.operation?.status === "failed";
  const jobProgress = activeBatch && activeJob?.stage === "generating-images"
    ? Math.max(12, Math.round((activeBatch.candidates.length / activeBatch.requestedCount) * 62))
    : activeJob
      ? STAGE_PROGRESS[activeJob.stage]
      : 0;
  const adoptedCurrent = Boolean(
    currentRevision && activeJob?.adoptedRevisionId === currentRevision.revisionId,
  );

  useEffect(() => {
    void refreshAiJobs();
  }, [refreshAiJobs]);

  useEffect(() => {
    let cancelled = false;
    const preferredDemo =
      themes.find((theme) => theme.id === "moonlit-immortal" && theme.valid)
      ?? themes.find((theme) => theme.valid);
    if (!preferredDemo) return;
    void api.loadThemeDraft(preferredDemo.id)
      .then((loaded) => {
        if (!cancelled) setDemoDraft(loaded);
      })
      .catch(() => {
        if (!cancelled) setDemoDraft(null);
      });
    return () => {
      cancelled = true;
    };
  }, [themes]);

  useEffect(() => {
    if (!activeJob) return;
    setPrompt(activeJob.request.prompt);
    setMode(activeJob.request.mode);
    setAppearance(activeJob.request.appearance);
    setLayoutPreference(activeJob.request.layoutPreference);
    setCandidateCount(activeJob.request.candidateCount);
    setReferenceImagePath(activeJob.request.referenceImagePath ?? null);
    setReferencePreviewUrl(null);
  }, [activeJob?.jobId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeJob?.messages.length, activeJob?.progressMessage]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      setHistoryOpen(false);
      setMobileChatOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pickReference = async () => {
    try {
      const picked = await api.pickImage();
      if (!picked) return;
      setReferenceImagePath(picked.path);
      setReferencePreviewUrl(picked.previewUrl);
    } catch (error) {
      toast("err", `读取图片失败:${(error as Error).message}`);
    }
  };

  const create = async () => {
    if (!prompt.trim() || !cliReady || busyCreating) return;
    setBusyCreating(true);
    try {
      const input: ThemeGenerationRequest = {
        prompt: prompt.trim(),
        mode,
        appearance,
        layoutPreference,
        candidateCount,
        referenceImagePath: referenceImagePath ?? undefined,
      };
      const job = await createAiJob(input);
      await startAiJob(job.jobId);
    } catch (error) {
      toast("err", `生成任务启动失败:${(error as Error).message}`);
    } finally {
      setBusyCreating(false);
    }
  };

  const sendMessage = async () => {
    if (!activeJob || !currentRevision || !chatText.trim() || running) return;
    const text = chatText.trim();
    setChatText("");
    try {
      await sendAiMessage(activeJob.jobId, { text, mode: chatMode });
    } catch (error) {
      setChatText(text);
      toast("err", `发送调整失败:${(error as Error).message}`);
    }
  };

  const submitComposer = () => {
    if (activeJob) void sendMessage();
    else void create();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submitComposer();
    }
  };

  const useNextExample = () => {
    const next = (exampleIndex + 1) % PROMPT_EXAMPLES.length;
    setExampleIndex(next);
    setPrompt(PROMPT_EXAMPLES[next]);
  };

  const openSettings = () => {
    setMobileChatOpen(false);
    setSettingsOpen(true);
  };

  const selectCandidate = async (batch: AiThemeCandidateBatch, candidate: AiThemeCandidate) => {
    if (!activeJob || running) return;
    try {
      await selectAiCandidate(activeJob.jobId, batch.batchId, candidate.candidateId);
    } catch (error) {
      toast("err", `选择候选图失败:${(error as Error).message}`);
    }
  };

  const restoreRevision = async (revision: AiThemeRevision) => {
    if (!activeJob || running || revision.revisionId === activeJob.currentRevisionId) return;
    try {
      await setAiRevision(activeJob.jobId, revision.revisionId);
    } catch (error) {
      toast("err", `恢复版本失败:${(error as Error).message}`);
    }
  };

  const adoptCurrent = async () => {
    if (!activeJob || !currentRevision || running) return;
    try {
      await adoptAiRevision(activeJob.jobId, currentRevision.revisionId);
    } catch (error) {
      toast("err", `采用版本失败:${(error as Error).message}`);
    }
  };

  const applyCurrent = async () => {
    if (!activeJob || !currentRevision || running) return;
    await applyAiRevision(activeJob.jobId, currentRevision.revisionId);
  };

  const retryCurrent = async () => {
    if (!activeJob?.operation) return;
    try {
      await retryAiOperation(activeJob.jobId, activeJob.operation.operationId);
    } catch (error) {
      toast("err", `重试失败:${(error as Error).message}`);
    }
  };

  const stopCurrent = async () => {
    if (!activeJob?.operation || !running) return;
    try {
      await cancelAiOperation(activeJob.jobId, activeJob.operation.operationId);
    } catch (error) {
      toast("err", `停止生成失败:${(error as Error).message}`);
    }
  };

  const startNewConversation = () => {
    setHistoryOpen(false);
    newAiConversation();
    setPrompt("");
    setChatText("");
    setReferenceImagePath(null);
    setReferencePreviewUrl(null);
    setCompareMode(false);
  };

  return (
    <div className="page ai-studio-page ai-conversation-studio">
      <header className="ai-studio-header">
        <div>
          <h1>{activeJob ? activeJob.request.prompt.slice(0, 30) || "AI 生成主题" : "AI 生成主题"}</h1>
          <div className="ai-studio-header__meta">
            <span className={`ai-cli-dot${cliReady ? " is-ready" : " is-blocked"}`} />
            <span>{cliReady ? "Codex CLI 已就绪" : "Codex CLI 未就绪"}</span>
            <span aria-hidden="true">·</span>
            <span>本地生成</span>
            <span aria-hidden="true">·</span>
            <span>持续对话，版本可恢复</span>
            {!cliReady && <button type="button" onClick={() => setPage("settings")}>前往设置</button>}
          </div>
        </div>
        <div className="ai-studio-header__actions">
          <button
            type="button"
            className="btn ai-mobile-chat-trigger"
            aria-expanded={mobileChatOpen}
            onClick={() => setMobileChatOpen((open) => !open)}
          >
            <MessageSquareText size={15} /> 创作对话
          </button>
          {activeJob && (
            <button type="button" className="btn" onClick={startNewConversation}>
              <Plus size={15} /> 新建创作
            </button>
          )}
          <button
            type="button"
            className={`btn ai-history-trigger${historyOpen ? " is-active" : ""}`}
            aria-expanded={historyOpen}
            onClick={() => {
              setHistoryOpen((open) => !open);
              void refreshAiJobs();
            }}
          >
            <History size={15} /> 历史记录
          </button>
          {historyOpen && (
            <section className="ai-history-panel" aria-label="历史创作会话">
              <div className="ai-history-panel__header">
                <div><strong>创作历史</strong><span>{aiJobs.length} 个会话</span></div>
                <button className="btn btn-ghost btn-icon" type="button" onClick={() => setHistoryOpen(false)} aria-label="关闭历史记录">
                  <X size={15} />
                </button>
              </div>
              <div className="ai-history-list">
                {aiJobs.length === 0 ? (
                  <div className="ai-history-empty">创建过的 AI 主题会出现在这里。</div>
                ) : aiJobs.slice(0, 20).map((job) => (
                  <button
                    type="button"
                    key={job.jobId}
                    className={`ai-history-row${activeJob?.jobId === job.jobId ? " is-current" : ""}`}
                    onClick={() => {
                      void loadAiJob(job.jobId);
                      setHistoryOpen(false);
                    }}
                  >
                    <span className={`ai-history-row__status is-${historyStatus(job.stage)}`} />
                    <span className="ai-history-row__copy">
                      <strong>{job.prompt}</strong>
                      <small>{job.revisionCount ?? 0} 个版本 · {STAGE_LABEL[job.stage]}</small>
                    </span>
                    <time>{formatHistoryTime(job.updatedAt)}</time>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </header>

      <div className="ai-studio-workspace ai-conversation-workspace">
        <main className="ai-creation-canvas">
          <section className="ai-preview-shell">
            <div className="ai-preview-toolbar">
              <div className="ai-preview-tabs" role="tablist" aria-label="主题预览页面">
                <button type="button" className={previewTab === "home" ? "is-active" : ""} onClick={() => setPreviewTab("home")}>首页</button>
                <button type="button" className={previewTab === "task" ? "is-active" : ""} onClick={() => setPreviewTab("task")}>对话页</button>
              </div>
              <button
                type="button"
                className={`ai-compare-toggle${compareMode ? " is-active" : ""}`}
                onClick={() => setCompareMode((value) => !value)}
                disabled={!currentRevision || (activeJob?.revisions.length ?? 0) < 2}
              >
                <GitCompareArrows size={14} /> 对比
              </button>
            </div>
            <div className="ai-preview-stage">
              <div className="ai-preview-stage__canvas">
                <ScaledPreview>
                  {previewTab === "home" ? (
                    <PreviewCanvas
                      theme={previewTheme}
                      heroUrl={previewHeroUrl}
                      wallpaperUrl={previewWallpaperUrl}
                      stampUrl={previewStampUrl}
                      fidelity="app"
                    />
                  ) : (
                    <TaskPreviewCanvas
                      theme={previewTheme}
                      heroUrl={previewHeroUrl}
                      wallpaperUrl={previewWallpaperUrl}
                      stampUrl={previewStampUrl}
                      fidelity="app"
                    />
                  )}
                </ScaledPreview>
              </div>
              {!activeJob && (
                <div className="ai-preview-idle-copy">
                  <Sparkles size={14} /> 输入灵感后，这里会实时呈现 Codex 主题
                </div>
              )}
              {activeJob && running && (
                <div className="ai-preview-status" aria-live="polite">
                  <Loader2 size={14} className="spin" />
                  <span>{activeJob.progressMessage || STAGE_LABEL[activeJob.stage]}</span>
                  <strong>{jobProgress}%</strong>
                </div>
              )}
              {compareMode && currentRevision && (
                <div className="ai-preview-compare-line" aria-hidden="true">
                  <span>上一版</span><span>当前版</span>
                </div>
              )}
            </div>
          </section>

          <nav className="ai-config-summary" aria-label="当前生成配置">
            <button type="button" onClick={openSettings} disabled={Boolean(activeJob)}>
              {MODE_LABEL[mode]} <ChevronRight size={13} />
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={openSettings} disabled={Boolean(activeJob)}>
              {layoutPreference ?? "自动布局"} <ChevronRight size={13} />
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={openSettings} disabled={Boolean(activeJob)}>
              {APPEARANCE_LABEL[appearance]} <ChevronRight size={13} />
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={openSettings} disabled={Boolean(activeJob)}>
              每批 {candidateCount} 张候选 <ChevronRight size={13} />
            </button>
            {!activeJob && (
              <button type="button" className="ai-config-summary__settings" onClick={openSettings} aria-label="打开生成设置">
                <Settings2 size={16} />
              </button>
            )}
          </nav>

          <CandidateStrip
            batch={activeBatch}
            running={Boolean(running)}
            selectedCandidateId={
              running && activeJob?.operation?.type === "recipe"
                ? activeJob.operation.candidateId
                : currentRevision?.candidateId ?? activeBatch?.selectedCandidateId ?? null
            }
            onSelect={(candidate) => {
              if (activeBatch) void selectCandidate(activeBatch, candidate);
            }}
            onRetry={operationFailed ? retryCurrent : undefined}
          />

          <RevisionTimeline
            revisions={activeJob?.revisions ?? []}
            currentRevisionId={activeJob?.currentRevisionId ?? null}
            adoptedRevisionId={activeJob?.adoptedRevisionId ?? null}
            disabled={Boolean(running)}
            onRestore={(revision) => void restoreRevision(revision)}
          />
        </main>

        <button
          type="button"
          className={`ai-mobile-chat-backdrop${mobileChatOpen ? " is-open" : ""}`}
          aria-label="关闭创作对话"
          onClick={() => setMobileChatOpen(false)}
        />

        <aside
          className={`ai-conversation-panel${mobileChatOpen ? " is-mobile-open" : ""}`}
          aria-label="主题创作对话"
        >
          <header className="ai-conversation-header">
            <div>
              <span className="ai-conversation-logo"><Sparkles size={16} /></span>
              <div><strong>主题创作对话</strong><small>{activeJob ? `${activeJob.revisions.length} 个版本` : "告诉我你想要的主题"}</small></div>
            </div>
            <div className="ai-conversation-header__actions">
              <button
                type="button"
                className="ai-mobile-chat-close"
                onClick={() => setMobileChatOpen(false)}
                aria-label="收起创作对话"
              >
                <ChevronDown size={15} />
              </button>
              <button type="button" onClick={() => void refreshAiJobs()} aria-label="刷新任务状态"><RefreshCw size={14} /></button>
              {activeJob && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("删除这个创作会话及其候选图片？")) void deleteAiJob(activeJob.jobId);
                  }}
                  aria-label="删除创作会话"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </header>

          <div className="ai-conversation-messages" aria-live="polite">
            {!activeJob ? (
              <div className="ai-conversation-welcome">
                <span><WandSparkles size={22} /></span>
                <strong>从一句灵感开始</strong>
                <p>我会先生成完整候选图，再把你选中的图片合成为可继续调整的 Codex 主题。</p>
              </div>
            ) : (
              activeJob.messages.map((message) => (
                <article
                  className={`ai-chat-message is-${message.role} is-${message.status}`}
                  key={message.messageId}
                >
                  <span className="ai-chat-avatar">
                    {message.role === "user"
                      ? profile?.avatarUrl
                        ? <img src={profile.avatarUrl} alt="" />
                        : <UserRound size={14} />
                      : <Sparkles size={14} />}
                  </span>
                  <div className="ai-chat-bubble">
                    <p>{message.text}</p>
                    {message.changeSummary?.length ? (
                      <ul>
                        {message.changeSummary.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : null}
                    <footer>
                      <time>{formatJobTime(message.createdAt)}</time>
                      {message.revisionId && (
                        <span>
                          v{activeJob.revisions.find((revision) => revision.revisionId === message.revisionId)?.number ?? "—"}
                        </span>
                      )}
                      {message.status === "running" && <Loader2 size={11} className="spin" />}
                    </footer>
                  </div>
                </article>
              ))
            )}

            {activeJob && running && (
              <article className="ai-chat-message is-assistant is-progress">
                <span className="ai-chat-avatar"><Sparkles size={14} /></span>
                <div className="ai-chat-bubble ai-chat-progress">
                  <div><Loader2 size={13} className="spin" /><span>{activeJob.progressMessage || STAGE_LABEL[activeJob.stage]}</span></div>
                  <div className="ai-chat-progress__track"><span style={{ width: `${jobProgress}%` }} /></div>
                </div>
              </article>
            )}

            {activeJob?.error && operationFailed && (
              <div className="ai-chat-error">
                <p>{activeJob.error}</p>
                <button type="button" onClick={() => void retryCurrent()}><RotateCcw size={13} /> 重试本次操作</button>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="ai-conversation-composer">
            {!activeJob && referenceImagePath && (
              <div className="ai-reference-chip">
                {referencePreviewUrl ? <img src={referencePreviewUrl} alt="参考图片" /> : <ImagePlus size={14} />}
                <span title={referenceImagePath}>{referenceImagePath.split(/[\\/]/).pop()}</span>
                <button type="button" onClick={() => {
                  setReferenceImagePath(null);
                  setReferencePreviewUrl(null);
                }} aria-label="移除参考图片"><X size={13} /></button>
              </div>
            )}
            <textarea
              value={activeJob ? chatText : prompt}
              onChange={(event) => activeJob ? setChatText(event.target.value) : setPrompt(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={activeJob
                ? currentRevision
                  ? "描述你希望继续调整的内容…"
                  : "完成首个主题版本后即可继续对话"
                : "描述氛围、颜色、角色或想保留的细节…"}
              maxLength={1600}
              disabled={Boolean(activeJob && !currentRevision)}
              aria-label={activeJob ? "主题调整内容" : "初始主题描述"}
            />
            {!activeJob && (
              <div className="ai-conversation-tools">
                <button type="button" onClick={() => void pickReference()}><ImagePlus size={14} /> 参考图</button>
                <button type="button" onClick={useNextExample}><Sparkles size={14} /> 灵感示例</button>
                <button type="button" onClick={openSettings}><Settings2 size={14} /> 生成设置</button>
              </div>
            )}
            {activeJob && currentRevision && (
              <div className="ai-chat-mode-switch" role="group" aria-label="本次调整方式">
                <button
                  type="button"
                  className={chatMode === "theme-only" ? "is-active" : ""}
                  onClick={() => setChatMode("theme-only")}
                  disabled={Boolean(running)}
                >
                  <Settings2 size={13} /> 仅调整主题
                </button>
                <button
                  type="button"
                  className={chatMode === "regenerate-image" ? "is-active" : ""}
                  onClick={() => setChatMode("regenerate-image")}
                  disabled={Boolean(running)}
                >
                  <ImagePlus size={13} /> 重新生成主图
                </button>
              </div>
            )}
            <div className="ai-conversation-composer__footer">
              <span><Bot size={13} /> 本机 Codex CLI</span>
              {running && activeJob?.operation ? (
                <button type="button" className="ai-stop-button" onClick={() => void stopCurrent()}>
                  <CircleStop size={15} /> 停止
                </button>
              ) : (
                <button
                  type="button"
                  className="ai-chat-send"
                  onClick={submitComposer}
                  disabled={
                    !cliReady
                    || busyCreating
                    || (activeJob ? !chatText.trim() || !currentRevision : !prompt.trim())
                  }
                  aria-label={activeJob ? "发送调整" : "开始生成主题"}
                >
                  {busyCreating ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
                </button>
              )}
            </div>
          </div>

          <footer className="ai-conversation-actions">
            <button
              type="button"
              className="btn"
              disabled={!currentRevision || Boolean(running) || Boolean(applyingId)}
              onClick={() => void applyCurrent()}
            >
              <Play size={14} /> {adoptedCurrent ? "应用主题" : "保存并应用"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!currentRevision || Boolean(running) || adoptedCurrent}
              onClick={() => void adoptCurrent()}
            >
              <CheckCircle2 size={14} /> {adoptedCurrent ? "已采用当前版本" : "采用当前版本"}
            </button>
          </footer>
        </aside>
      </div>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="ai-config-modal" role="dialog" aria-modal="true" aria-labelledby="ai-config-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="ai-config-modal__header">
              <div>
                <h2 id="ai-config-title">生成设置</h2>
                <p>候选数量会在每一次重新生成主图时严格执行。</p>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSettingsOpen(false)} aria-label="关闭生成设置"><X size={16} /></button>
            </header>
            <div className="ai-config-modal__body">
              <div className="ai-config-controls">
                <fieldset className="ai-config-group">
                  <legend>生成方式</legend>
                  <div className="ai-segmented ai-segmented--stacked">
                    {([
                      ["generate-image", "生成图片 + 主题", ImagePlus],
                      ["use-reference-image", "使用参考图", Monitor],
                      ["recipe-only", "仅生成配方", Bot],
                    ] as const).map(([value, label, Icon]) => (
                      <button type="button" key={value} className={mode === value ? "is-active" : ""} onClick={() => setMode(value)}>
                        <Icon size={15} /> {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="ai-config-group">
                  <legend>外观风格</legend>
                  <div className="ai-segmented">
                    {([
                      ["auto", "自动", Monitor],
                      ["light", "浅色", Sun],
                      ["dark", "深色", Moon],
                    ] as const).map(([value, label, Icon]) => (
                      <button type="button" key={value} className={appearance === value ? "is-active" : ""} onClick={() => setAppearance(value)}>
                        <Icon size={14} /> {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {mode === "generate-image" && (
                  <fieldset className="ai-config-group">
                    <legend>每批候选图数量</legend>
                    <div className="ai-segmented">
                      {([1, 2, 3] as const).map((count) => (
                        <button type="button" key={count} className={candidateCount === count ? "is-active" : ""} onClick={() => setCandidateCount(count)}>
                          {count} 张
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                {mode !== "recipe-only" && (
                  <fieldset className="ai-config-group">
                    <legend>参考图片</legend>
                    <button type="button" className="ai-reference-picker" onClick={() => void pickReference()}>
                      {referencePreviewUrl ? <img src={referencePreviewUrl} alt="已选择的参考图片" /> : <ImagePlus size={21} />}
                      <span>
                        <strong>{referenceImagePath ? "更换参考图片" : "添加参考图片"}</strong>
                        <small>{referenceImagePath ? referenceImagePath.split(/[\\/]/).pop() : "PNG / JPEG / WebP"}</small>
                      </span>
                    </button>
                  </fieldset>
                )}
              </div>
              <div className="ai-config-layouts">
                <div className="ai-config-layouts__title">
                  <strong>布局偏好</strong><span>选择界面骨架，或交给 Codex 判断。</span>
                </div>
                <LayoutCardSelector
                  name="ai-layout-preference"
                  value={layoutPreference}
                  onChange={setLayoutPreference}
                  themes={themes}
                  allowAuto
                />
              </div>
            </div>
            <footer className="ai-config-modal__footer">
              <span><CheckCircle2 size={14} /> 设置会用于这个创作会话</span>
              <button type="button" className="btn btn-primary" onClick={() => setSettingsOpen(false)}>完成</button>
            </footer>
          </section>
        </div>
      )}

      {pendingApproval && (
        <div className="modal-backdrop">
          <section className="modal ai-approval-modal" role="dialog" aria-modal="true" aria-labelledby="ai-approval-title">
            <div className="modal-title" id="ai-approval-title">Codex 请求审批</div>
            <div className="modal-body">
              主题生成通常不需要额外权限。如果请求不在预期内，请拒绝。
              <div className="ai-approval-detail">
                <strong>类型：{pendingApproval.kind}</strong><span>{pendingApproval.detail}</span>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-danger" type="button" onClick={() => void respondToApproval(pendingApproval.requestId, "decline")}>拒绝</button>
              <button className="btn" type="button" onClick={() => void dismissApproval()}>忽略</button>
              <button className="btn btn-primary" type="button" onClick={() => void respondToApproval(pendingApproval.requestId, "accept")}>允许</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function CandidateStrip({
  batch,
  running,
  selectedCandidateId,
  onSelect,
  onRetry,
}: {
  batch: AiThemeCandidateBatch | null;
  running: boolean;
  selectedCandidateId: string | null;
  onSelect: (candidate: AiThemeCandidate) => void;
  onRetry?: () => void;
}) {
  const count = batch?.candidates.length ?? 0;
  const requested = batch?.requestedCount ?? 0;
  return (
    <section className="ai-candidate-strip">
      <header>
        <div>
          <strong>主题主图</strong>
          {batch ? <span>{requested} 张候选</span> : <span>等待生成</span>}
        </div>
        <span className={batch?.status === "partial" ? "is-error" : ""}>
          {running && batch?.status === "generating" ? "正在生成 " : "已生成 "}
          {count}/{requested || "—"}
        </span>
      </header>
      <div className="ai-candidate-strip__items">
        {batch?.candidates.map((candidate) => {
          const selected = selectedCandidateId === candidate.candidateId;
          return (
            <button
              type="button"
              key={candidate.candidateId}
              className={`ai-candidate-card${selected ? " is-selected" : ""}`}
              onClick={() => onSelect(candidate)}
              disabled={running}
              aria-pressed={selected}
            >
              <img src={candidate.previewUrl} alt={`候选主图 ${candidate.slot ?? ""}`} draggable={false} />
              <span className="ai-candidate-card__number">{candidate.slot ?? "—"}</span>
              {selected && <span className="ai-candidate-card__check"><Check size={13} strokeWidth={3} /></span>}
            </button>
          );
        })}
        {batch && Array.from({ length: Math.max(0, batch.requestedCount - count) }, (_, index) => (
          <div className="ai-candidate-card is-placeholder" key={`placeholder-${index}`}>
            {running ? <Loader2 size={18} className="spin" /> : <ImagePlus size={18} />}
            <span>{running ? "生成中" : "待补齐"}</span>
          </div>
        ))}
        {!batch && (
          <div className="ai-candidate-strip__empty">
            <ImagePlus size={19} /><span>候选主图会按设置数量完整生成</span>
          </div>
        )}
      </div>
      {batch?.status === "partial" && onRetry && (
        <button type="button" className="ai-candidate-retry" onClick={onRetry}>
          <RotateCcw size={13} /> 继续补齐缺少的候选图
        </button>
      )}
    </section>
  );
}

function RevisionTimeline({
  revisions,
  currentRevisionId,
  adoptedRevisionId,
  disabled,
  onRestore,
}: {
  revisions: AiThemeRevision[];
  currentRevisionId: string | null;
  adoptedRevisionId: string | null;
  disabled: boolean;
  onRestore: (revision: AiThemeRevision) => void;
}) {
  return (
    <section className="ai-version-timeline">
      <header>
        <strong>版本历史</strong>
        <span>{revisions.length ? "选择任意版本预览或继续调整" : "每轮调整都会保留"}</span>
      </header>
      <div className="ai-version-timeline__track">
        {revisions.map((revision) => {
          const current = revision.revisionId === currentRevisionId;
          const adopted = revision.revisionId === adoptedRevisionId;
          return (
            <button
              type="button"
              key={revision.revisionId}
              className={`ai-version-card${current ? " is-current" : ""}`}
              onClick={() => onRestore(revision)}
              disabled={disabled}
            >
              <span className="ai-version-card__label">
                <strong>v{revision.number}</strong>
                {current && <em>当前版本</em>}
                {adopted && <em className="is-adopted">已采用</em>}
              </span>
              <span>{revision.changeSummary[0] || "主题调整"}</span>
              <time>{formatJobTime(revision.createdAt)}</time>
            </button>
          );
        })}
        {revisions.length === 0 && (
          <div className="ai-version-empty">
            <History size={17} /><span>首个主题完成后会生成 v1</span>
          </div>
        )}
      </div>
    </section>
  );
}

const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 800;

function ScaledPreview({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const rect = host.getBoundingClientRect();
      setBounds({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const scale = bounds.width && bounds.height
    ? Math.min(bounds.width / PREVIEW_WIDTH, bounds.height / PREVIEW_HEIGHT)
    : 0;
  const offsetX = (bounds.width - PREVIEW_WIDTH * scale) / 2;
  const offsetY = (bounds.height - PREVIEW_HEIGHT * scale) / 2;

  return (
    <div className="ai-scaled-preview" ref={hostRef}>
      <div
        className="ai-scaled-preview__viewport"
        style={{
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
          opacity: scale ? 1 : 0,
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function provisionalThemeFromJob(job: AiThemeJob): NormalizedTheme {
  const base = defaultNormalizedTheme();
  const layout = job.request.layoutPreference ?? "full-canvas";
  return {
    ...base,
    id: "ai-theme-preview",
    name: "你的 AI 主题",
    description: job.request.prompt,
    tagline: job.request.prompt.slice(0, 72),
    layout,
    wallpaper: {
      ...base.wallpaper,
      enabled: layout === "full-canvas",
      opacity: layout === "full-canvas" ? 1 : base.wallpaper.opacity,
    },
  };
}

function previewThemeFromRecipe(job: AiThemeJob): NormalizedTheme {
  const base = defaultNormalizedTheme();
  const recipe = job.recipe;
  if (!recipe) return base;
  return {
    ...base,
    name: recipe.name || base.name,
    tagline: recipe.tagline || base.tagline,
    layout: recipe.layout,
    hero: {
      fit: recipe.hero.fit,
      focusX: recipe.hero.focusX,
      focusY: recipe.hero.focusY,
      zoom: recipe.hero.zoom,
      height: recipe.hero.height,
      textAlign: recipe.hero.textAlign,
      scrim: recipe.hero.scrim,
    },
    wallpaper: {
      enabled: recipe.wallpaper.enabled,
      focusX: recipe.wallpaper.focusX,
      focusY: recipe.wallpaper.focusY,
      opacity: recipe.wallpaper.opacity,
      blur: recipe.wallpaper.blur,
    },
    appearance: {
      radius: recipe.appearance.radius,
      density: recipe.appearance.density,
      fontPreset: recipe.appearance.fontPreset,
      glass: recipe.appearance.glass,
      shadow: recipe.appearance.shadow,
      decoration: recipe.appearance.decoration,
    },
    effects: recipe.effects,
    copy: recipe.copy,
  };
}

function historyStatus(stage: AiThemeJobStage): string {
  if (["preview-ready", "completed"].includes(stage)) return "completed";
  if (["failed", "cancelled"].includes(stage)) return stage;
  return "running";
}
