/**
 * Renderer state (zustand): mirrors the main-process AppState, keeps the
 * theme list, the log ring buffer, toasts, and the apply/restart flow.
 */

import { create } from "zustand";
import type {
  AiThemeJob,
  AiThemeJobSummary,
  AppState,
  AuthState,
  CodexApprovalRequest,
  LoadedThemeDraft,
  LogLine,
  OpenThemeAction,
  RendererSettings,
  ThemeEntitlement,
  ThemeGenerationRequest,
  ThemeProduct,
  ThemeSummary,
} from "../electron/shared/types";
import { api } from "./api";

export type Page = "gallery" | "editor" | "ai-studio" | "settings" | "account";

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
  auth: AuthState | null;
  catalog: ThemeProduct[];
  entitlements: ThemeEntitlement[];
  pendingOrderId: string | null;
  purchasingThemeId: string | null;

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

  /** Auth */
  refreshAuth(): Promise<void>;
  sendEmailOtp(email: string): Promise<{ ok: boolean; error?: string }>;
  verifyEmailOtp(email: string, token: string): Promise<{ ok: boolean; error?: string }>;
  signInGitHub(): Promise<{ ok: boolean; error?: string; url?: string }>;
  signOut(): Promise<void>;

  /** Commerce */
  refreshCatalog(): Promise<void>;
  refreshEntitlements(): Promise<void>;
  purchaseTheme(themeId: string): Promise<void>;
  pollOrder(orderId: string): Promise<void>;
  downloadPurchasedTheme(themeId: string): Promise<void>;
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
  auth: null,
  catalog: [],
  entitlements: [],
  pendingOrderId: null,
  purchasingThemeId: null,

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
    api.onAuthChanged((auth) => {
      set({ auth });
      if (auth.status === "authenticated") {
        void get().refreshEntitlements();
      } else {
        set({ entitlements: [] });
      }
    });
    api.onOrderChanged((order) => {
      if (order.status === "paid") {
        set({ pendingOrderId: null, purchasingThemeId: null });
        void get().refreshEntitlements();
        get().toast("ok", `支付成功:「${order.themeName}」已加入已购主题。`);
      }
    });
    const [state, settings, themes, aiJobs, auth] = await Promise.all([
      api.getState(),
      api.getSettings(),
      api.listThemes(),
      api.listAiThemeJobs(),
      api.authGetState(),
    ]);
    set({ state, settings, themes, aiJobs, auth, ready: true });
    await consumeOpenThemeActions();
    if (auth.status === "authenticated") {
      void get().refreshCatalog();
      void get().refreshEntitlements();
    }
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

  async refreshAuth() {
    set({ auth: await api.authGetState() });
  },

  async sendEmailOtp(email) {
    const result = await api.authSendEmailOtp(email);
    if (!result.ok) get().toast("err", result.error ?? "发送验证码失败");
    return result;
  },

  async verifyEmailOtp(email, token) {
    const result = await api.authVerifyEmailOtp(email, token);
    if (result.ok) {
      await get().refreshAuth();
      await get().refreshCatalog();
      await get().refreshEntitlements();
      get().toast("ok", "登录成功。");
    } else {
      get().toast("err", result.error ?? "验证码无效");
    }
    return result;
  },

  async signInGitHub() {
    const result = await api.authSignInGitHub();
    if (!result.ok) get().toast("err", result.error ?? "GitHub 登录失败");
    return result;
  },

  async signOut() {
    const result = await api.authSignOut();
    if (result.ok) {
      set({ auth: { status: "unauthenticated", user: null, entitlementCount: 0, error: null }, catalog: [], entitlements: [] });
      get().toast("info", "已退出登录。");
    } else {
      get().toast("err", result.error ?? "退出失败");
    }
  },

  async refreshCatalog() {
    try {
      set({ catalog: await api.commerceListCatalog() });
    } catch (error) {
      console.warn("Failed to refresh catalog:", (error as Error).message);
    }
  },

  async refreshEntitlements() {
    try {
      const entitlements = await api.commerceListEntitlements();
      set({ entitlements });
      // Refresh themes so purchased themes appear as source === "purchased".
      await get().refreshThemes();
    } catch (error) {
      console.warn("Failed to refresh entitlements:", (error as Error).message);
    }
  },

  async purchaseTheme(themeId) {
    const auth = get().auth;
    if (!auth || auth.status !== "authenticated") {
      get().toast("info", "请先登录账号。");
      set({ page: "account" });
      return;
    }
    set({ purchasingThemeId: themeId });
    try {
      const order = await api.commerceCreateOrder(themeId, crypto.randomUUID());
      set({ pendingOrderId: order.id });
      // The main process already opened the Alipay cashier when the order was created on the server.
      // Poll until paid or until the payment deep link wakes us up.
      await get().pollOrder(order.id);
    } catch (error) {
      get().toast("err", `创建订单失败:${(error as Error).message}`);
    } finally {
      set((s) => (s.purchasingThemeId === themeId ? { purchasingThemeId: null } : {}));
    }
  },

  async pollOrder(orderId) {
    let attempts = 0;
    const maxAttempts = 40; // ~2 minutes at 3s intervals
    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const order = await api.commerceGetOrder(orderId);
      if (order.status === "paid") {
        set({ pendingOrderId: null });
        await get().refreshEntitlements();
        get().toast("ok", `支付成功:「${order.themeName}」已加入已购主题。`);
        return;
      }
      if (order.status === "closed" || order.status === "failed") {
        set({ pendingOrderId: null });
        get().toast("err", "订单已关闭或支付失败。");
        return;
      }
      attempts++;
    }
    // Final reconcile attempt before giving up.
    const finalOrder = await api.commerceReconcileOrder(orderId);
    if (finalOrder.status === "paid") {
      set({ pendingOrderId: null });
      await get().refreshEntitlements();
      get().toast("ok", `支付成功:「${finalOrder.themeName}」已加入已购主题。`);
    } else {
      get().toast("err", "支付状态未知,请在已购主题中刷新。");
    }
  },

  async downloadPurchasedTheme(themeId) {
    const result = await api.commerceDownloadTheme(themeId);
    if (result.ok) {
      await get().refreshThemes();
      get().toast("ok", "主题已下载。");
    } else {
      get().toast("err", result.error ?? "下载失败");
    }
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
