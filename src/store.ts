/**
 * Renderer state (zustand): mirrors the main-process AppState, keeps the
 * theme list, the log ring buffer, toasts, and the apply/restart flow.
 */

import { create } from "zustand";
import type {
  AiThemeJob,
  AiThemeJobSummary,
  AppState,
  CodexApprovalRequest,
  LoadedThemeDraft,
  LogLine,
  OpenThemeAction,
  RendererSettings,
  ThemeGenerationRequest,
  ThemeSummary,
} from "../electron/shared/types";
import { api } from "./api";

export type Page = "gallery" | "editor" | "ai-studio" | "settings";

export interface Toast {
  id: number;
  kind: "ok" | "err" | "info";
  text: string;
}

interface AppStore {
  ready: boolean;
  state: AppState | null;
  settings: RendererSettings | null;
  themes: ThemeSummary[];
  logs: LogLine[];
  page: Page;
  toasts: Toast[];
  applyingId: string | null;
  pendingRestartThemeId: string | null;
  pendingWebThemeId: string | null;
  aiJobs: AiThemeJobSummary[];
  activeAiJob: AiThemeJob | null;
  pendingApproval: CodexApprovalRequest | null;
  /** Draft loaded for in-place editing; null means the editor creates a new theme. */
  editingDraft: LoadedThemeDraft | null;

  init(): Promise<void>;
  setPage(page: Page): void;
  /** Open the editor with a saved theme loaded for in-place editing. */
  editTheme(id: string): Promise<void>;
  /** Duplicate a theme, then open the copy in the editor. */
  duplicateAndEdit(id: string): Promise<void>;
  refreshThemes(): Promise<void>;
  toast(kind: Toast["kind"], text: string): void;
  dismissToast(id: number): void;
  apply(id: string): Promise<void>;
  confirmRestartAndApply(): Promise<void>;
  cancelRestart(): void;
  confirmWebTheme(): Promise<void>;
  cancelWebTheme(): void;
  restore(): Promise<void>;
  finishOnboarding(): Promise<void>;
  updateSettings(patch: Partial<RendererSettings>): Promise<void>;

  refreshAiJobs(): Promise<void>;
  createAiJob(input: ThemeGenerationRequest): Promise<AiThemeJob>;
  startAiJob(jobId: string): Promise<void>;
  selectAiCandidate(jobId: string, candidateId: string): Promise<void>;
  refineAiJob(jobId: string, instruction: string, regenerateImage: boolean): Promise<void>;
  cancelAiJob(jobId: string): Promise<void>;
  retryAiJob(jobId: string): Promise<void>;
  deleteAiJob(jobId: string): Promise<void>;
  loadAiJob(jobId: string): Promise<void>;
  respondToApproval(requestId: string, decision: "accept" | "decline" | "cancel"): Promise<void>;
  dismissApproval(): void;
  /** Validate and present a website-requested built-in theme. */
  openThemeFromWeb(action: OpenThemeAction): void;
}

let toastSeq = 0;

function toAiJobSummary(job: AiThemeJob): AiThemeJobSummary {
  return {
    jobId: job.jobId,
    stage: job.stage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    prompt: job.request.prompt,
    selectedCandidateId: job.selectedCandidateId,
    savedThemeDir: job.savedThemeDir,
    error: job.error,
  };
}

export const useApp = create<AppStore>((set, get) => ({
  ready: false,
  state: null,
  settings: null,
  themes: [],
  logs: [],
  page: "gallery",
  toasts: [],
  applyingId: null,
  pendingRestartThemeId: null,
  pendingWebThemeId: null,
  aiJobs: [],
  activeAiJob: null,
  pendingApproval: null,
  editingDraft: null,

  async init() {
    const consumeOpenThemeActions = async () => {
      while (true) {
        const action = await api.consumeOpenThemeAction();
        if (!action) break;
        get().openThemeFromWeb(action);
      }
    };

    api.onOpenThemeActionAvailable(() => {
      if (get().ready) void consumeOpenThemeActions();
    });
    api.onStateChanged((state) => set({ state }));
    api.onLog((line) =>
      set((s) => ({ logs: [...s.logs.slice(-199), line] })),
    );
    api.onPackageImported(async (summary) => {
      await get().refreshThemes();
      get().toast("ok", `已导入「${summary.name}」。`);
    });
    api.onAiThemeJobChanged(async (job) => {
      set((s) => ({
        aiJobs: s.aiJobs.map((j) =>
          j.jobId === job.jobId
            ? {
                jobId: job.jobId,
                stage: job.stage,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
                prompt: job.request.prompt,
                selectedCandidateId: job.selectedCandidateId,
                savedThemeDir: job.savedThemeDir,
                error: job.error,
              }
            : j,
        ),
        activeAiJob: s.activeAiJob?.jobId === job.jobId ? job : s.activeAiJob,
      }));
      if (job.stage === "completed" || job.stage === "failed") {
        await get().refreshThemes();
      }
    });
    api.onCodexApprovalRequested((request) => {
      set({ pendingApproval: request });
    });
    const [state, settings, themes, aiJobs] = await Promise.all([
      api.getState(),
      api.getSettings(),
      api.listThemes(),
      api.listAiThemeJobs(),
    ]);
    set({ state, settings, themes, aiJobs, ready: true });
    await consumeOpenThemeActions();
  },

  openThemeFromWeb(action: OpenThemeAction) {
    if (action.type === "open-workspace") {
      if (action.workspace === "editor") {
        set({ page: "editor", editingDraft: null });
        get().toast("info", "已从官网打开自定义主题工作台。");
      } else {
        set({ page: "ai-studio" });
        get().toast("info", "已连接本地 AI 主题工作台。");
      }
      return;
    }

    const theme = get().themes.find(
      (candidate) => candidate.source === "preset" && candidate.id === action.themeId,
    );
    if (!theme) {
      get().toast("err", "网页请求的主题不存在或已不可用。");
      return;
    }
    set({ page: "gallery", pendingWebThemeId: theme.id });
  },

  setPage(page) {
    // Entering the editor via navigation always means "create new"; edit
    // flows go through editTheme/duplicateAndEdit which set the draft first.
    set(page === "editor" ? { page, editingDraft: null } : { page });
  },

  async editTheme(id) {
    try {
      const editingDraft = await api.loadThemeDraft(id);
      set({ editingDraft, page: "editor" });
    } catch (error) {
      get().toast("err", `载入主题失败:${(error as Error).message}`);
    }
  },

  async duplicateAndEdit(id) {
    try {
      const duplicated = await api.duplicateTheme(id);
      await get().refreshThemes();
      get().toast("ok", `已复制为「${duplicated.name}」。`);
      await get().editTheme(duplicated.id);
    } catch (error) {
      get().toast("err", `复制失败:${(error as Error).message}`);
    }
  },

  async refreshThemes() {
    set({ themes: await api.listThemes() });
  },

  toast(kind, text) {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  async apply(id) {
    if (get().applyingId) return;
    set({ applyingId: id });
    try {
      const result = await api.applyTheme(id);
      if (result.needsRestart) {
        set({ pendingRestartThemeId: id });
        return;
      }
      reportApplyResult(result.status, result.notes, result.error, get().toast);
    } catch (error) {
      get().toast("err", `应用失败:${(error as Error).message}`);
    } finally {
      set({ applyingId: null });
    }
  },

  async confirmRestartAndApply() {
    const id = get().pendingRestartThemeId;
    if (!id) return;
    set({ pendingRestartThemeId: null, applyingId: id });
    try {
      const result = await api.applyTheme(id, { confirmRestart: true });
      reportApplyResult(result.status, result.notes, result.error, get().toast);
    } catch (error) {
      get().toast("err", `应用失败:${(error as Error).message}`);
    } finally {
      set({ applyingId: null });
    }
  },

  cancelRestart() {
    set({ pendingRestartThemeId: null });
  },

  async confirmWebTheme() {
    const id = get().pendingWebThemeId;
    if (!id) return;
    set({ pendingWebThemeId: null, page: "gallery" });
    await get().apply(id);
  },

  cancelWebTheme() {
    set({ pendingWebThemeId: null });
  },

  async restore() {
    const result = await api.restoreOfficial();
    if (result.ok) get().toast("ok", "已还原官方外观,Codex 刷新后完全生效。");
    else get().toast("err", `还原失败:${result.error}`);
  },

  async finishOnboarding() {
    const settings = await api.updateSettings({ onboardingDone: true });
    set({ settings });
  },

  async updateSettings(patch) {
    set({ settings: await api.updateSettings(patch) });
  },

  async refreshAiJobs() {
    set({ aiJobs: await api.listAiThemeJobs() });
  },

  async createAiJob(input) {
    const job = await api.createAiThemeJob(input);
    set((s) => ({ aiJobs: [toAiJobSummary(job), ...s.aiJobs], activeAiJob: job }));
    return job;
  },

  async startAiJob(jobId) {
    await api.startAiThemeJob(jobId);
    const job = await api.getAiThemeJob(jobId);
    set((s) => ({
      aiJobs: s.aiJobs.map((j) => (j.jobId === jobId ? toAiJobSummary(job) : j)),
      activeAiJob: s.activeAiJob?.jobId === jobId ? job : s.activeAiJob,
    }));
  },

  async selectAiCandidate(jobId, candidateId) {
    await api.selectAiThemeCandidate(jobId, candidateId);
    const job = await api.getAiThemeJob(jobId);
    set((s) => ({
      aiJobs: s.aiJobs.map((j) => (j.jobId === jobId ? toAiJobSummary(job) : j)),
      activeAiJob: s.activeAiJob?.jobId === jobId ? job : s.activeAiJob,
    }));
  },

  async refineAiJob(jobId, instruction, regenerateImage) {
    await api.refineAiThemeJob(jobId, instruction, regenerateImage);
  },

  async cancelAiJob(jobId) {
    await api.cancelAiThemeJob(jobId);
    const job = await api.getAiThemeJob(jobId);
    set((s) => ({
      aiJobs: s.aiJobs.map((j) => (j.jobId === jobId ? toAiJobSummary(job) : j)),
      activeAiJob: s.activeAiJob?.jobId === jobId ? job : s.activeAiJob,
    }));
  },

  async retryAiJob(jobId) {
    await api.retryAiThemeJob(jobId);
    const job = await api.getAiThemeJob(jobId);
    set((s) => ({
      aiJobs: s.aiJobs.map((j) => (j.jobId === jobId ? toAiJobSummary(job) : j)),
      activeAiJob: s.activeAiJob?.jobId === jobId ? job : s.activeAiJob,
    }));
  },

  async deleteAiJob(jobId) {
    await api.deleteAiThemeJob(jobId);
    set((s) => ({
      aiJobs: s.aiJobs.filter((j) => j.jobId !== jobId),
      activeAiJob: s.activeAiJob?.jobId === jobId ? null : s.activeAiJob,
    }));
  },

  async loadAiJob(jobId) {
    const job = await api.getAiThemeJob(jobId);
    set((s) => ({
      aiJobs: s.aiJobs.map((j) => (j.jobId === jobId ? toAiJobSummary(job) : j)),
      activeAiJob: job,
    }));
  },

  async respondToApproval(requestId, decision) {
    try {
      await api.respondToCodexApproval(requestId, decision);
      set({ pendingApproval: null });
    } catch (error) {
      get().toast("err", `审批响应失败:${(error as Error).message}`);
    }
  },

  dismissApproval() {
    set({ pendingApproval: null });
  },
}));

function reportApplyResult(
  status: "applied" | "partial" | "failed",
  notes: string[],
  error: string | undefined,
  toast: (kind: Toast["kind"], text: string) => void,
) {
  if (status === "applied") {
    toast("ok", "主题已生效。Codex 刷新或新开窗口会自动保持。");
  } else if (status === "partial") {
    toast("info", `主题部分生效。${notes[0] ?? ""}`.trim());
  } else {
    toast("err", `应用失败:${error ?? "未知错误"}`);
  }
}
