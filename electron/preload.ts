/**
 * Preload bridge: exposes the typed codexThemes API on window while keeping
 * the renderer fully sandboxed from Node. One invoke wrapper per channel.
 */

import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AiThemeJob,
  AppState,
  AuthState,
  CodexApprovalRequest,
  CodexThemesApi,
  CustomThemeInput,
  InspectedThemePackage,
  LogLine,
  OpenThemeAction,
  PurchaseOrder,
  RendererSettings,
  ThemeDraftInput,
  ThemeGenerationRequest,
  ThemeSummary,
} from "./shared/types";

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: CodexThemesApi = {
  consumeOpenThemeAction: () => ipcRenderer.invoke("app:consumeOpenThemeAction"),
  getState: () => ipcRenderer.invoke("app:getState"),
  getSettings: () => ipcRenderer.invoke("app:getSettings"),
  updateSettings: (patch: Partial<RendererSettings>) =>
    ipcRenderer.invoke("app:updateSettings", patch),
  listThemes: () => ipcRenderer.invoke("themes:list"),
  applyTheme: (id: string, opts?: { confirmRestart?: boolean }) =>
    ipcRenderer.invoke("themes:apply", id, opts),
  restoreOfficial: () => ipcRenderer.invoke("themes:restoreOfficial"),
  openCodex: () => ipcRenderer.invoke("codex:open"),
  saveCustomTheme: (input: CustomThemeInput) => ipcRenderer.invoke("themes:saveCustom", input),
  saveThemeDraft: (input: ThemeDraftInput) => ipcRenderer.invoke("themes:saveDraft", input),
  updateTheme: (id: string, input: ThemeDraftInput) =>
    ipcRenderer.invoke("themes:update", id, input),
  loadThemeDraft: (id: string) => ipcRenderer.invoke("themes:loadDraft", id),
  duplicateTheme: (id: string) => ipcRenderer.invoke("themes:duplicate", id),
  deleteTheme: (id: string) => ipcRenderer.invoke("themes:delete", id),
  pickImage: () => ipcRenderer.invoke("images:pick"),
  inspectImage: (path: string) => ipcRenderer.invoke("images:inspect", path),
  autoCropStamp: (heroPath: string) => ipcRenderer.invoke("images:autoCropStamp", heroPath),
  extractPalette: (imagePath: string) => ipcRenderer.invoke("images:extractPalette", imagePath),
  inspectThemePackage: () => ipcRenderer.invoke("themes:inspectPackage"),
  importInspectedTheme: (inspection: InspectedThemePackage, opts?: { newId?: string }) =>
    ipcRenderer.invoke("themes:importInspected", inspection, opts),
  importThemePackage: () => ipcRenderer.invoke("themes:importPackage"),
  discardInspection: (tempDir: string) => ipcRenderer.invoke("themes:discardInspection", tempDir),
  exportThemePackage: (id: string) => ipcRenderer.invoke("themes:exportPackage", id),

  getCodexCliStatus: () => ipcRenderer.invoke("codexCli:getStatus"),
  selectCodexCli: () => ipcRenderer.invoke("codexCli:select"),
  refreshCodexCliStatus: () => ipcRenderer.invoke("codexCli:refresh"),

  createAiThemeJob: (input: ThemeGenerationRequest) => ipcRenderer.invoke("ai:createJob", input),
  startAiThemeJob: (jobId: string) => ipcRenderer.invoke("ai:startJob", jobId),
  selectAiThemeCandidate: (jobId: string, candidateId: string) =>
    ipcRenderer.invoke("ai:selectCandidate", jobId, candidateId),
  refineAiThemeJob: (jobId: string, instruction: string, regenerateImage: boolean) =>
    ipcRenderer.invoke("ai:refineJob", jobId, instruction, regenerateImage),
  cancelAiThemeJob: (jobId: string) => ipcRenderer.invoke("ai:cancelJob", jobId),
  retryAiThemeJob: (jobId: string) => ipcRenderer.invoke("ai:retryJob", jobId),
  getAiThemeJob: (jobId: string) => ipcRenderer.invoke("ai:getJob", jobId),
  listAiThemeJobs: () => ipcRenderer.invoke("ai:listJobs"),
  deleteAiThemeJob: (jobId: string) => ipcRenderer.invoke("ai:deleteJob", jobId),
  respondToCodexApproval: (requestId: string, decision: "accept" | "decline" | "cancel") =>
    ipcRenderer.invoke("ai:respondApproval", requestId, decision),

  authGetState: () => ipcRenderer.invoke("auth:getState"),
  authSendEmailOtp: (email: string) => ipcRenderer.invoke("auth:sendEmailOtp", email),
  authVerifyEmailOtp: (email: string, token: string) =>
    ipcRenderer.invoke("auth:verifyEmailOtp", email, token),
  authSignInGitHub: () => ipcRenderer.invoke("auth:signInGitHub"),
  authSignOut: () => ipcRenderer.invoke("auth:signOut"),

  commerceListCatalog: () => ipcRenderer.invoke("commerce:listCatalog"),
  commerceCreateOrder: (themeId: string, idempotencyKey: string) =>
    ipcRenderer.invoke("commerce:createOrder", themeId, idempotencyKey),
  commerceGetOrder: (orderId: string) => ipcRenderer.invoke("commerce:getOrder", orderId),
  commerceReconcileOrder: (orderId: string) =>
    ipcRenderer.invoke("commerce:reconcileOrder", orderId),
  commerceListEntitlements: () => ipcRenderer.invoke("commerce:listEntitlements"),
  commerceDownloadTheme: (themeId: string) =>
    ipcRenderer.invoke("commerce:downloadTheme", themeId),

  onStateChanged: (cb: (state: AppState) => void) => subscribe("app:stateChanged", cb),
  onOpenThemeActionAvailable: (cb: () => void) =>
    subscribe<OpenThemeAction | undefined>("app:openThemeActionAvailable", () => cb()),
  onLog: (cb: (line: LogLine) => void) => subscribe("app:log", cb),
  onPackageImported: (cb: (summary: ThemeSummary) => void) => subscribe("package:imported", cb),
  onAiThemeJobChanged: (cb: (job: AiThemeJob) => void) => subscribe("ai:jobChanged", cb),
  onCodexApprovalRequested: (cb: (request: CodexApprovalRequest) => void) =>
    subscribe("ai:approvalRequested", cb),
  onAuthChanged: (cb: (state: AuthState) => void) => subscribe("auth:changed", cb),
  onOrderChanged: (cb: (order: PurchaseOrder) => void) => subscribe("commerce:orderChanged", cb),
};

contextBridge.exposeInMainWorld("codexThemes", {
  ...api,
  // File.path was removed in modern Electron; webUtils is the supported way.
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
