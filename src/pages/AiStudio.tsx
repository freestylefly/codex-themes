/**
 * AI Theme Studio.
 *
 * The page is canvas-first: the generated theme stays visible while prompt,
 * configuration, progress, candidates, refinement and history remain close at
 * hand without turning the primary flow into a long settings form.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  History,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Monitor,
  Moon,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type {
  AiThemeJob,
  AiThemeJobStage,
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
  "generating-images": "正在生成主图",
  "awaiting-selection": "等待选择候选图",
  "generating-recipe": "正在生成主题配方",
  synthesizing: "正在合成主题",
  "preview-ready": "主题预览已就绪",
  saving: "正在保存主题",
  completed: "主题已完成",
  failed: "生成失败",
  cancelled: "已停止",
};

const STAGE_PROGRESS: Record<AiThemeJobStage, number> = {
  created: 4,
  preparing: 16,
  "generating-images": 48,
  "awaiting-selection": 64,
  "generating-recipe": 76,
  synthesizing: 86,
  "preview-ready": 94,
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
  "月夜云海中的国漫仙侠世界，银蓝与金色点缀，人物清晰，中央保留阅读安全区。",
  "清晨森林里的可爱蘑菇屋，柔和晨光、青绿色植物和温暖木质细节。",
];

const CREATION_STEPS = ["理解需求", "生成主图", "合成主题", "等待应用"] as const;
type CreationStepState = "done" | "active" | "pending" | "error";

function activeStepIndex(job: AiThemeJob | null): number {
  if (!job) return 0;
  if (job.stage === "completed") return CREATION_STEPS.length;
  if (job.stage === "created" || job.stage === "preparing") return 0;
  if (job.stage === "generating-images" || job.stage === "awaiting-selection") return 1;
  if (job.stage === "generating-recipe" || job.stage === "synthesizing") return 2;
  if (job.stage === "preview-ready" || job.stage === "saving") return 3;
  if (job.recipe) return 3;
  if (job.candidates.length > 0) return 2;
  return 1;
}

function stepState(job: AiThemeJob | null, index: number): CreationStepState {
  const active = activeStepIndex(job);
  if (job?.stage === "completed" || index < active) return "done";
  if (index > active) return "pending";
  if (job?.stage === "failed" || job?.stage === "cancelled") return "error";
  return "active";
}

function formatJobTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AiStudio() {
  const state = useApp((s) => s.state);
  const activeJob = useApp((s) => s.activeAiJob);
  const aiJobs = useApp((s) => s.aiJobs);
  const themes = useApp((s) => s.themes);
  const createAiJob = useApp((s) => s.createAiJob);
  const startAiJob = useApp((s) => s.startAiJob);
  const selectAiCandidate = useApp((s) => s.selectAiCandidate);
  const refineAiJob = useApp((s) => s.refineAiJob);
  const cancelAiJob = useApp((s) => s.cancelAiJob);
  const retryAiJob = useApp((s) => s.retryAiJob);
  const deleteAiJob = useApp((s) => s.deleteAiJob);
  const loadAiJob = useApp((s) => s.loadAiJob);
  const refreshAiJobs = useApp((s) => s.refreshAiJobs);
  const apply = useApp((s) => s.apply);
  const toast = useApp((s) => s.toast);
  const setPage = useApp((s) => s.setPage);
  const pendingApproval = useApp((s) => s.pendingApproval);
  const respondToApproval = useApp((s) => s.respondToApproval);
  const dismissApproval = useApp((s) => s.dismissApproval);

  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<ThemeGenerationRequest["mode"]>("generate-image");
  const [appearance, setAppearance] = useState<ThemeGenerationRequest["appearance"]>("auto");
  const [layoutPreference, setLayoutPreference] = useState<ThemeGenerationRequest["layoutPreference"]>(undefined);
  const [candidateCount, setCandidateCount] = useState<1 | 2 | 3>(2);
  const [referenceImagePath, setReferenceImagePath] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [refineText, setRefineText] = useState("");
  const [previewTab, setPreviewTab] = useState<"home" | "task">("home");
  const [compareMode, setCompareMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(-1);
  const [busyCreating, setBusyCreating] = useState(false);
  const [demoDraft, setDemoDraft] = useState<LoadedThemeDraft | null>(null);

  const cliReady = Boolean(
    state?.codexCli.installed &&
      state.codexCli.supported &&
      state.codexCli.appServerRunning &&
      state.codexCli.authenticated,
  );

  const activeCandidate =
    activeJob?.candidates.find((candidate) => candidate.candidateId === activeJob.selectedCandidateId) ??
    activeJob?.candidates[0] ??
    null;
  const previewTheme = useMemo(() => {
    if (activeJob?.recipe) return previewThemeFromRecipe(activeJob);
    if (activeJob) return provisionalThemeFromJob(activeJob);
    if (demoDraft) return previewThemeFromLoadedDraft(demoDraft);
    return defaultNormalizedTheme();
  }, [activeJob, demoDraft]);
  const previewHeroUrl = activeCandidate?.previewUrl ?? (!activeJob ? demoDraft?.heroPreviewUrl ?? null : null);
  const previewWallpaperUrl = activeJob
    ? previewTheme.wallpaper.enabled
      ? activeCandidate?.previewUrl ?? null
      : null
    : demoDraft?.wallpaperPreviewUrl ?? null;
  const previewStampUrl = !activeJob ? demoDraft?.stampPreviewUrl ?? null : null;
  const jobProgress = activeJob ? STAGE_PROGRESS[activeJob.stage] : 0;
  const running = Boolean(
    activeJob && !["completed", "failed", "cancelled"].includes(activeJob.stage),
  );

  useEffect(() => {
    void refreshAiJobs();
  }, [refreshAiJobs]);

  useEffect(() => {
    let cancelled = false;
    const preferredDemo =
      themes.find((theme) => theme.id === "moonlit-immortal" && theme.valid) ??
      themes.find((theme) => theme.valid);
    if (!preferredDemo) return;
    void api
      .loadThemeDraft(preferredDemo.id)
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
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      setHistoryOpen(false);
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

  const selectCandidate = (candidateId: string) => {
    if (!activeJob || activeJob.selectedCandidateId === candidateId) return;
    void selectAiCandidate(activeJob.jobId, candidateId);
  };

  const refine = (regenerateImage: boolean) => {
    if (!activeJob || !refineText.trim()) return;
    void refineAiJob(activeJob.jobId, refineText.trim(), regenerateImage);
    setRefineText("");
  };

  const applyCompletedTheme = async () => {
    if (!activeJob?.savedThemeDir) return;
    const theme = themes.find((candidate) => candidate.dir === activeJob.savedThemeDir);
    if (!theme) {
      toast("err", "找不到已保存的主题。");
      return;
    }
    try {
      await apply(theme.id);
      toast("ok", "AI 主题已应用。");
    } catch (error) {
      toast("err", `应用失败:${(error as Error).message}`);
    }
  };

  const useNextExample = () => {
    const next = (exampleIndex + 1) % PROMPT_EXAMPLES.length;
    setExampleIndex(next);
    setPrompt(PROMPT_EXAMPLES[next]);
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void create();
    }
  };

  const openHistory = () => {
    setHistoryOpen((open) => !open);
    void refreshAiJobs();
  };

  return (
    <div className="page ai-studio-page">
      <header className="ai-studio-header">
        <div>
          <h1>用灵感生成一个主题</h1>
          <div className="ai-studio-header__meta">
            <span className={`ai-cli-dot${cliReady ? " is-ready" : " is-blocked"}`} />
            <span>{cliReady ? "Codex CLI 已就绪" : "Codex CLI 未就绪"}</span>
            <span aria-hidden="true">·</span>
            <span>本地生成</span>
            <span aria-hidden="true">·</span>
            <span>保障隐私</span>
            {!cliReady && (
              <button type="button" onClick={() => setPage("settings")}>前往设置</button>
            )}
          </div>
        </div>
        <div className="ai-studio-header__actions">
          <button
            type="button"
            className={`btn ai-history-trigger${historyOpen ? " is-active" : ""}`}
            aria-expanded={historyOpen}
            onClick={openHistory}
          >
            <History size={15} />
            历史记录
          </button>
          {historyOpen && (
            <section className="ai-history-panel" aria-label="历史生成任务">
              <div className="ai-history-panel__header">
                <div>
                  <strong>历史记录</strong>
                  <span>{aiJobs.length} 个任务</span>
                </div>
                <button className="btn btn-ghost btn-icon" type="button" onClick={() => setHistoryOpen(false)} aria-label="关闭历史记录">
                  <X size={15} />
                </button>
              </div>
              <div className="ai-history-list">
                {aiJobs.length === 0 ? (
                  <div className="ai-history-empty">生成过的主题会出现在这里。</div>
                ) : (
                  aiJobs.slice(0, 12).map((job) => (
                    <button
                      type="button"
                      key={job.jobId}
                      className={`ai-history-row${activeJob?.jobId === job.jobId ? " is-current" : ""}`}
                      onClick={() => {
                        void loadAiJob(job.jobId);
                        setPrompt(job.prompt);
                        setHistoryOpen(false);
                      }}
                    >
                      <span className={`ai-history-row__status is-${job.stage}`} />
                      <span className="ai-history-row__copy">
                        <strong>{job.prompt}</strong>
                        <small>{STAGE_LABEL[job.stage]}</small>
                      </span>
                      <time>{formatJobTime(job.updatedAt)}</time>
                    </button>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      </header>

      <div className="ai-studio-workspace">
        <main className="ai-creation-canvas">
          <section className="ai-preview-shell" aria-label="主题实时预览">
            <div className="ai-preview-toolbar">
              <div className="ai-preview-tabs" role="tablist" aria-label="预览页面">
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewTab === "home"}
                  className={previewTab === "home" ? "is-active" : ""}
                  onClick={() => setPreviewTab("home")}
                >
                  首页
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewTab === "task"}
                  className={previewTab === "task" ? "is-active" : ""}
                  onClick={() => setPreviewTab("task")}
                >
                  对话页
                </button>
              </div>
              <button
                type="button"
                className={`ai-compare-toggle${compareMode ? " is-active" : ""}`}
                aria-pressed={compareMode}
                onClick={() => setCompareMode((value) => !value)}
                disabled={!activeCandidate}
              >
                对比
                <LayoutTemplate size={14} />
              </button>
            </div>

            <div className={`ai-preview-stage${compareMode ? " is-comparing" : ""}`}>
              <div className="ai-preview-stage__canvas">
                <ScaledPreview>
                  {previewTab === "home" ? (
                    <PreviewCanvas
                      theme={previewTheme}
                      heroUrl={previewHeroUrl}
                      wallpaperUrl={previewWallpaperUrl}
                      stampUrl={previewStampUrl}
                    />
                  ) : (
                    <TaskPreviewCanvas
                      theme={previewTheme}
                      heroUrl={previewHeroUrl}
                      wallpaperUrl={previewWallpaperUrl}
                      stampUrl={previewStampUrl}
                    />
                  )}
                </ScaledPreview>
              </div>

              {!activeJob && (
                <div className="ai-preview-idle-copy">
                  <Sparkles size={14} />
                  <span>{previewTab === "home" ? "首页示例" : "对话页示例"} · 输入灵感后生成你的专属主题</span>
                </div>
              )}
              {activeJob && running && (
                <div className="ai-preview-status">
                  <Loader2 size={14} className="spin" />
                  <span>{STAGE_LABEL[activeJob.stage]}</span>
                  <strong>{jobProgress}%</strong>
                </div>
              )}
              {compareMode && activeCandidate && (
                <div className="ai-preview-compare-line" aria-hidden="true">
                  <span>主图</span>
                  <span>主题</span>
                </div>
              )}
            </div>
          </section>

          <nav className="ai-config-summary" aria-label="当前生成配置">
            <button type="button" onClick={() => setSettingsOpen(true)}>
              {MODE_LABEL[mode]}
              <ChevronRight size={13} />
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => setSettingsOpen(true)}>
              {layoutPreference ?? "自动布局"}
              <ChevronRight size={13} />
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => setSettingsOpen(true)}>
              {APPEARANCE_LABEL[appearance]}
              <ChevronRight size={13} />
            </button>
            {mode === "generate-image" && (
              <>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={() => setSettingsOpen(true)}>
                  {candidateCount} 张候选
                  <ChevronRight size={13} />
                </button>
              </>
            )}
            <button
              type="button"
              className="ai-config-summary__settings"
              onClick={() => setSettingsOpen(true)}
              aria-label="打开生成设置"
            >
              <SlidersHorizontal size={16} />
            </button>
          </nav>

          <section className="ai-prompt-composer">
            {referenceImagePath && (
              <div className="ai-reference-chip">
                {referencePreviewUrl ? <img src={referencePreviewUrl} alt="参考图片" /> : <ImagePlus size={14} />}
                <span title={referenceImagePath}>{referenceImagePath.split(/[\\/]/).pop()}</span>
                <button
                  type="button"
                  onClick={() => {
                    setReferenceImagePath(null);
                    setReferencePreviewUrl(null);
                  }}
                  aria-label="移除参考图片"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder="描述氛围、颜色、角色或你想保留的细节…"
              maxLength={1600}
              aria-label="主题描述"
            />
            <div className="ai-prompt-composer__footer">
              <div className="ai-prompt-tools">
                <button type="button" onClick={() => void pickReference()} aria-label="添加参考图片">
                  <ImagePlus size={17} />
                </button>
                <button type="button" className="ai-inspiration-button" onClick={useNextExample}>
                  <Sparkles size={15} />
                  灵感示例
                </button>
              </div>
              <span className="ai-prompt-model">
                <Bot size={14} />
                本机 Codex CLI
              </span>
              <button
                type="button"
                className="ai-generate-button"
                onClick={() => void create()}
                disabled={!prompt.trim() || !cliReady || busyCreating}
                aria-label="开始生成主题"
                title="开始生成主题 (⌘ Enter)"
              >
                {busyCreating ? <Loader2 size={19} className="spin" /> : <Send size={19} />}
              </button>
            </div>
          </section>
        </main>

        <aside className="ai-creation-rail" aria-label="创作轨迹和候选图">
          <div className="ai-rail-section ai-journey-section">
            <div className="ai-rail-heading">
              <span><Sparkles size={15} /> 创作轨迹</span>
              <button className="btn btn-ghost btn-icon" type="button" onClick={() => void refreshAiJobs()} aria-label="刷新任务状态">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="ai-journey-list">
              {CREATION_STEPS.map((label, index) => {
                const itemState = stepState(activeJob, index);
                return (
                  <div className={`ai-journey-step is-${itemState}`} key={label}>
                    <span className="ai-journey-step__icon">
                      {itemState === "done" ? (
                        <Check size={13} strokeWidth={3} />
                      ) : itemState === "active" ? (
                        activeJob ? <Loader2 size={13} className="spin" /> : <Circle size={10} fill="currentColor" />
                      ) : itemState === "error" ? (
                        <X size={13} />
                      ) : (
                        <Circle size={10} />
                      )}
                    </span>
                    <span className="ai-journey-step__copy">
                      <strong>{label}</strong>
                      <small>
                        {itemState === "done"
                          ? "已完成"
                          : itemState === "active" || itemState === "error"
                            ? activeJob
                              ? STAGE_LABEL[activeJob.stage]
                              : "等待你的描述"
                            : "等待中"}
                      </small>
                    </span>
                    {itemState === "active" && activeJob && (
                      <span
                        className="ai-progress-ring"
                        style={{ "--ai-progress": `${jobProgress * 3.6}deg` } as CSSProperties}
                      >
                        {jobProgress}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {activeJob?.progressMessage && (
              <p className="ai-progress-message">{activeJob.progressMessage}</p>
            )}
            {activeJob?.error && <p className="ai-job-error">{activeJob.error}</p>}
          </div>

          <div className="ai-rail-section ai-candidates-section">
            <div className="ai-rail-heading">
              <span>候选预览 ({activeJob?.candidates.length ?? 0})</span>
            </div>
            {activeJob?.candidates.length ? (
              <div className="ai-candidate-grid">
                {activeJob.candidates.map((candidate, index) => {
                  const selected = activeJob.selectedCandidateId === candidate.candidateId;
                  return (
                    <button
                      type="button"
                      key={candidate.candidateId}
                      className={`ai-candidate${selected ? " is-selected" : ""}`}
                      onClick={() => selectCandidate(candidate.candidateId)}
                      aria-pressed={selected}
                    >
                      <img src={candidate.previewUrl} alt={`候选主图 ${index + 1}`} draggable={false} />
                      {selected && <span><Check size={12} strokeWidth={3} /></span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="ai-candidate-empty">
                <ImagePlus size={22} />
                <span>生成后可在这里比较候选图</span>
              </div>
            )}
          </div>

          {activeJob?.selectedCandidateId && activeJob.stage !== "completed" && (
            <div className="ai-rail-section ai-refine-section">
              <div className="ai-rail-heading">
                <span>精炼建议</span>
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => setRefineText("")} aria-label="清空精炼建议">
                  <RotateCcw size={13} />
                </button>
              </div>
              <div className="ai-refine-input">
                <input
                  value={refineText}
                  onChange={(event) => setRefineText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") refine(false);
                  }}
                  placeholder="例如：让夜空更亮一点"
                  aria-label="主题精炼建议"
                />
                <button type="button" onClick={() => refine(false)} disabled={!refineText.trim()} aria-label="仅调整主题配方">
                  <Send size={14} />
                </button>
              </div>
              <button type="button" className="ai-regenerate-link" onClick={() => refine(true)} disabled={!refineText.trim()}>
                <Wand2 size={13} /> 重新生成图片
              </button>
            </div>
          )}

          <div className="ai-rail-actions">
            {activeJob?.stage === "completed" && activeJob.savedThemeDir && (
              <>
                <button type="button" className="btn btn-primary" onClick={() => void applyCompletedTheme()}>
                  <Play size={14} /> 应用主题
                </button>
                <button type="button" className="btn" onClick={() => setPage("gallery")}>
                  <Save size={14} /> 查看主题
                </button>
              </>
            )}
            {activeJob && (activeJob.stage === "completed" || activeJob.stage === "failed" || activeJob.stage === "cancelled") && (
              <>
                <button type="button" className="btn" onClick={() => void retryAiJob(activeJob.jobId)}>
                  <RotateCcw size={14} /> 重试
                </button>
                <button type="button" className="btn btn-ghost btn-icon btn-danger" onClick={() => void deleteAiJob(activeJob.jobId)} aria-label="删除当前任务">
                  <Trash2 size={14} />
                </button>
              </>
            )}
            {activeJob && running && (
              <button type="button" className="btn" onClick={() => void cancelAiJob(activeJob.jobId)}>
                <X size={14} /> 停止生成
              </button>
            )}
          </div>
        </aside>
      </div>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section
            className="ai-config-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-config-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="ai-config-modal__header">
              <div>
                <h2 id="ai-config-title">生成设置</h2>
                <p>这些选项会和提示词一起交给本机 Codex。</p>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSettingsOpen(false)} aria-label="关闭生成设置">
                <X size={16} />
              </button>
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
                      <button
                        type="button"
                        key={value}
                        className={mode === value ? "is-active" : ""}
                        aria-pressed={mode === value}
                        onClick={() => setMode(value)}
                      >
                        <Icon size={15} />
                        {label}
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
                      <button
                        type="button"
                        key={value}
                        className={appearance === value ? "is-active" : ""}
                        aria-pressed={appearance === value}
                        onClick={() => setAppearance(value)}
                      >
                        <Icon size={14} />
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {mode === "generate-image" && (
                  <fieldset className="ai-config-group">
                    <legend>候选图数量</legend>
                    <div className="ai-segmented">
                      {([1, 2, 3] as const).map((count) => (
                        <button
                          type="button"
                          key={count}
                          className={candidateCount === count ? "is-active" : ""}
                          aria-pressed={candidateCount === count}
                          onClick={() => setCandidateCount(count)}
                        >
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
                      {referencePreviewUrl ? (
                        <img src={referencePreviewUrl} alt="已选择的参考图片" />
                      ) : (
                        <ImagePlus size={21} />
                      )}
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
                  <strong>布局偏好</strong>
                  <span>选择界面骨架，或交给 Codex 判断。</span>
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
              <span><CheckCircle2 size={14} /> 设置会自动保存到本次生成</span>
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
              主题生成任务通常不需要额外权限。如果该请求不在预期内，请拒绝。
              <div className="ai-approval-detail">
                <strong>类型：{pendingApproval.kind}</strong>
                <span>{pendingApproval.detail}</span>
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
