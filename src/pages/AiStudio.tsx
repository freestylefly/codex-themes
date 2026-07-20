/**
 * AI Theme Studio MVP page.
 *
 * Lets the user describe a theme, start a local Codex CLI job, view generated
 * candidate images, pick one, and save the resulting theme.
 */

import { useEffect, useState } from "react";
import {
  Loader2,
  RefreshCw,
  Sparkles,
  ImagePlus,
  Play,
  Save,
  X,
  Wand2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import { useApp } from "../store";
import { LAYOUT_KINDS } from "../../electron/shared/types";
import type { AiThemeJob, ThemeGenerationRequest } from "../../electron/shared/types";
import { PreviewCanvas } from "../components/PreviewCanvas";
import { TaskPreviewCanvas } from "../components/TaskPreviewCanvas";
import { defaultNormalizedTheme } from "../../electron/engine/normalize";

const STAGE_LABEL: Record<AiThemeJob["stage"], string> = {
  created: "已创建",
  preparing: "准备中",
  "generating-images": "正在生成候选图",
  "awaiting-selection": "等待选图",
  "generating-recipe": "正在生成主题配方",
  synthesizing: "正在合成主题",
  "preview-ready": "预览就绪",
  saving: "保存中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

export function AiStudio() {
  const state = useApp((s) => s.state);
  const activeJob = useApp((s) => s.activeAiJob);
  const aiJobs = useApp((s) => s.aiJobs);
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
  const [candidateCount, setCandidateCount] = useState<1 | 2 | 3>(1);
  const [referenceImagePath, setReferenceImagePath] = useState<string | null>(null);
  const [refineText, setRefineText] = useState("");
  const [previewTab, setPreviewTab] = useState<"home" | "task">("home");

  const themes = useApp((s) => s.themes);

  const cliReady = Boolean(
    state?.codexCli.installed && state.codexCli.supported && state.codexCli.appServerRunning && state.codexCli.authenticated,
  );

  useEffect(() => {
    void refreshAiJobs();
  }, [refreshAiJobs]);

  const pickReference = async () => {
    const picked = await api.pickImage();
    if (picked) setReferenceImagePath(picked.path);
  };

  const create = async () => {
    if (!prompt.trim()) return;
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
  };

  const selectCandidate = (candidateId: string) => {
    if (!activeJob) return;
    void selectAiCandidate(activeJob.jobId, candidateId);
  };

  const refine = (regenerateImage: boolean) => {
    if (!activeJob || !refineText.trim()) return;
    void refineAiJob(activeJob.jobId, refineText.trim(), regenerateImage);
    setRefineText("");
  };

  const applyCompletedTheme = async () => {
    if (!activeJob?.savedThemeDir) return;
    const theme = themes.find((t) => t.dir === activeJob.savedThemeDir);
    if (!theme) {
      toast("err", "找不到已保存的主题。");
      return;
    }
    try {
      await apply(theme.id);
      toast("ok", "AI 主题已应用。");
    } catch (err) {
      toast("err", `应用失败:${(err as Error).message}`);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI 生成主题</h1>
          <p className="page-sub">用一句话描述想要的 Codex 主题,由本机 Codex CLI 生成图片与配方。</p>
        </div>
        <button className="btn" onClick={() => void refreshAiJobs()}>
          <RefreshCw size={14} /> 刷新任务
        </button>
      </div>

      {!cliReady && (
        <div className="note-block" style={{ borderTop: 0 }}>
          <div>
            AI 主题生成本机 Codex CLI 支持。当前状态:
            {state?.codexCli.error ? ` ${state.codexCli.error}` : " 未就绪。"}
            请前往设置检测或选择 Codex CLI。
          </div>
        </div>
      )}

      <div className="editor-layout">
        <div className="editor-panel">
          <div className="field">
            <span className="field-label">主题描述</span>
            <textarea
              className="input"
              rows={3}
              placeholder="例如:一个雨夜赛博朋克城市,蓝色霓虹反光,主光源在右侧"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="field">
            <span className="field-label">模式</span>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as ThemeGenerationRequest["mode"])}>
              <option value="generate-image">生成新图片 + 主题</option>
              <option value="use-reference-image">使用参考图生成主题</option>
              <option value="recipe-only">仅生成主题配方</option>
            </select>
          </div>

          {(mode === "generate-image" || mode === "use-reference-image") && (
            <div className="field">
              <span className="field-label">参考图片(可选)</span>
              <button className="btn" onClick={() => void pickReference()}>
                <ImagePlus size={14} /> {referenceImagePath ? "更换图片" : "选择图片"}
              </button>
              {referenceImagePath && <div className="kv-value mono faint">{referenceImagePath}</div>}
            </div>
          )}

          <div className="field">
            <span className="field-label">外观偏好</span>
            <select className="input" value={appearance} onChange={(e) => setAppearance(e.target.value as ThemeGenerationRequest["appearance"])}>
              <option value="auto">自动</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>

          <div className="field">
            <span className="field-label">布局偏好(可选)</span>
            <select className="input" value={layoutPreference ?? ""} onChange={(e) => setLayoutPreference((e.target.value || undefined) as ThemeGenerationRequest["layoutPreference"])}>
              <option value="">自动</option>
              {LAYOUT_KINDS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          {mode === "generate-image" && (
            <div className="field">
              <span className="field-label">候选图数量</span>
              <select className="input" value={candidateCount} onChange={(e) => setCandidateCount(Number(e.target.value) as 1 | 2 | 3)}>
                <option value={1}>1 张</option>
                <option value={2}>2 张</option>
                <option value={3}>3 张</option>
              </select>
            </div>
          )}

          <div className="editor-actions">
            <button className="btn btn-primary" disabled={!prompt.trim() || !cliReady} onClick={() => void create()}>
              <Sparkles size={14} /> 生成主题
            </button>
          </div>

          {activeJob && (
            <div className="settings-group" style={{ marginTop: 18 }}>
              <div className="settings-group-title">当前任务</div>
              <div className="kv-row">
                <span className="kv-key">状态</span>
                <span className="kv-value">
                  {STAGE_LABEL[activeJob.stage]}
                  {(activeJob.stage === "generating-images" || activeJob.stage === "generating-recipe" || activeJob.stage === "synthesizing") && (
                    <Loader2 size={13} className="spin" style={{ marginLeft: 6 }} />
                  )}
                </span>
              </div>
              {activeJob.progressMessage && (
                <div className="kv-row">
                  <span className="kv-key">进度</span>
                  <span className="kv-value faint" style={{ maxWidth: "100%", wordBreak: "break-word" }}>
                    {activeJob.progressMessage}
                  </span>
                </div>
              )}
              {activeJob.error && (
                <div className="kv-row">
                  <span className="kv-key">错误</span>
                  <span className="kv-value faint">{activeJob.error}</span>
                </div>
              )}

              {activeJob.candidates.length > 0 && (
                <div className="field">
                  <span className="field-label">候选图</span>
                  <div className="theme-grid">
                    {activeJob.candidates.map((c) => (
                      <div
                        key={c.candidateId}
                        className={`theme-card${activeJob.selectedCandidateId === c.candidateId ? " active" : ""}`}
                        style={{ cursor: "pointer" }}
                        onClick={() => selectCandidate(c.candidateId)}
                      >
                        <div className="card-preview">
                          <img src={c.previewUrl} alt="candidate" draggable={false} />
                        </div>
                        <div className="card-body">
                          <button className="btn btn-primary" style={{ width: "100%" }}>
                            {activeJob.selectedCandidateId === c.candidateId ? "已选中" : "选这张"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeJob.stage === "completed" && activeJob.savedThemeDir && (
                <div className="editor-actions">
                  <button className="btn btn-primary" onClick={() => void applyCompletedTheme()}>
                    <Play size={14} /> 应用主题
                  </button>
                  <button className="btn" onClick={() => setPage("gallery")}>
                    <Save size={14} /> 去画廊查看
                  </button>
                </div>
              )}

              {activeJob.stage === "awaiting-selection" && activeJob.candidates.length === 0 && (
                <div className="note-block">正在等待候选图生成…</div>
              )}

              {activeJob.stage === "completed" || activeJob.stage === "failed" || activeJob.stage === "cancelled" ? (
                <div className="editor-actions">
                  <button className="btn" onClick={() => void retryAiJob(activeJob.jobId)}>
                    <RotateCcw size={14} /> 重试
                  </button>
                  <button className="btn btn-ghost btn-icon btn-danger" onClick={() => void deleteAiJob(activeJob.jobId)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <div className="editor-actions">
                  <button className="btn" onClick={() => void cancelAiJob(activeJob.jobId)}>
                    <X size={14} /> 停止
                  </button>
                </div>
              )}

              {activeJob.selectedCandidateId && activeJob.stage !== "completed" && (
                <div className="field">
                  <span className="field-label">调整指令</span>
                  <input
                    className="input"
                    placeholder="例如:整体更暖一点,或减少玻璃效果"
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                  />
                  <div className="editor-actions">
                    <button className="btn" onClick={() => refine(false)}>
                      <Wand2 size={14} /> 仅调整配方
                    </button>
                    <button className="btn" onClick={() => refine(true)}>
                      <Sparkles size={14} /> 重新生成图片
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {aiJobs.length > 0 && (
            <div className="settings-group" style={{ marginTop: 18 }}>
              <div className="settings-group-title">历史任务</div>
              {aiJobs.map((job) => (
                <div
                  key={job.jobId}
                  className="kv-row"
                  style={{ cursor: "pointer" }}
                  onClick={() => void loadAiJob(job.jobId)}
                >
                  <span className="kv-key">{job.prompt.slice(0, 30)}…</span>
                  <span className="kv-value">{STAGE_LABEL[job.stage]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeJob?.recipe && activeJob.selectedCandidateId && (
          <div className="editor-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="preview-tabs" style={{ display: "flex", gap: 8 }}>
              <button
                className={`preview-toggle${previewTab === "home" ? " on" : ""}`}
                onClick={() => setPreviewTab("home")}
              >
                首页
              </button>
              <button
                className={`preview-toggle${previewTab === "task" ? " on" : ""}`}
                onClick={() => setPreviewTab("task")}
              >
                任务页
              </button>
            </div>
            {previewTab === "home" ? (
              <PreviewCanvas
                theme={previewThemeFromRecipe(activeJob)}
                heroUrl={activeJob.candidates.find((c) => c.candidateId === activeJob.selectedCandidateId)?.previewUrl ?? null}
              />
            ) : (
              <TaskPreviewCanvas
                theme={previewThemeFromRecipe(activeJob)}
                heroUrl={activeJob.candidates.find((c) => c.candidateId === activeJob.selectedCandidateId)?.previewUrl ?? null}
              />
            )}
          </div>
        )}

        {pendingApproval && (
          <div
            className="modal-overlay"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "grid",
              placeItems: "center",
              zIndex: 100,
            }}
          >
            <div
              className="modal-card"
              style={{
                background: "var(--panel)",
                borderRadius: "var(--ds-radius)",
                padding: 24,
                width: "min(520px, 90vw)",
                boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              }}
            >
              <h3 style={{ margin: "0 0 8px", color: "var(--text)" }}>Codex 请求审批</h3>
              <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13 }}>
                主题生成任务通常不需要额外权限。如果该请求不在预期内，请拒绝。
              </p>
              <div
                style={{
                  background: "var(--panel-alt)",
                  borderRadius: "var(--ds-radius)",
                  padding: 12,
                  fontSize: 12,
                  color: "var(--muted)",
                  maxHeight: 160,
                  overflow: "auto",
                  marginBottom: 16,
                }}
              >
                <div>
                  <strong>类型:</strong> {pendingApproval.kind}
                </div>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{pendingApproval.detail}</div>
              </div>
              <div className="editor-actions" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-danger" onClick={() => void respondToApproval(pendingApproval.requestId, "decline")}>
                  拒绝
                </button>
                <button className="btn" onClick={() => void dismissApproval()}>
                  忽略
                </button>
                <button className="btn btn-primary" onClick={() => void respondToApproval(pendingApproval.requestId, "accept")}>
                  允许
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function previewThemeFromRecipe(job: AiThemeJob) {
  const base = defaultNormalizedTheme();
  const r = job.recipe;
  if (!r) return base;
  return {
    ...base,
    name: r.name || base.name,
    tagline: r.tagline || base.tagline,
    layout: r.layout,
    hero: {
      fit: r.hero.fit,
      focusX: r.hero.focusX,
      focusY: r.hero.focusY,
      zoom: r.hero.zoom,
      height: r.hero.height,
      textAlign: r.hero.textAlign,
      scrim: r.hero.scrim,
    },
    wallpaper: {
      enabled: r.wallpaper.enabled,
      focusX: r.wallpaper.focusX,
      focusY: r.wallpaper.focusY,
      opacity: r.wallpaper.opacity,
      blur: r.wallpaper.blur,
    },
    appearance: {
      radius: r.appearance.radius,
      density: r.appearance.density,
      fontPreset: r.appearance.fontPreset,
      glass: r.appearance.glass,
      shadow: r.appearance.shadow,
      decoration: r.appearance.decoration,
    },
    effects: r.effects,
    copy: r.copy,
  };
}
