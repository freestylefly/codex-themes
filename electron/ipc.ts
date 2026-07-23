/**
 * Typed IPC surface. Every renderer call routes through ipcMain.handle and
 * every main-process event is forwarded from the controller/store to the
 * focused window. Channel names are mirrored one-to-one in preload.ts.
 */

import { app, dialog, ipcMain, nativeImage, type BrowserWindow } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AiThemeMessageInput,
  CustomThemeInput,
  InspectedThemePackage,
  OpenThemeAction,
  PickedImage,
  RendererSettings,
  SubmitThemeInput,
  ThemeDraftInput,
  ThemeGenerationRequest,
  ThemeSubmissionStatus,
  ThemeSummary,
} from "./shared/types";
import type { AppPaths } from "./paths";
import type { ThemeController } from "./controller";
import type { SettingsStore } from "./settings";
import type { ThemeStore } from "./themes/store";
import { AuthClient } from "./auth/client";
import { CommerceService } from "./commerce/service";
import { extractPalette } from "./themes/palette";
import { registerPickedImage } from "./picked-images";
import { IMAGE_EXTENSIONS, MAX_ART_BYTES } from "./engine/constants";

const IMAGE_FILE_FILTERS = [
  { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
];

const CLI_FILE_FILTERS = [
  { name: "Codex CLI", extensions: ["*"] },
];

interface IpcContext {
  paths: AppPaths;
  controller: ThemeController;
  settings: SettingsStore;
  store: ThemeStore;
  authClient?: AuthClient;
  commerceService?: CommerceService;
  getWindow: () => BrowserWindow | null;
  consumeOpenThemeAction: () => OpenThemeAction | null;
}

function send(getWindow: () => BrowserWindow | null, channel: string, payload: unknown) {
  const win = getWindow();
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  try {
    // Renderer reloads dispose the old WebFrameMain before BrowserWindow itself
    // is destroyed. Notifications are best-effort and the renderer refreshes
    // state on mount, so dropping that narrow-race event is safe.
    win.webContents.send(channel, payload);
  } catch {
    // Avoid an uncaught `write EIO` / disposed-frame exception during reload.
  }
}

export function registerIpc(ctx: IpcContext): void {
  const { controller, settings, store, authClient, commerceService, getWindow, consumeOpenThemeAction } = ctx;

  controller.on("stateChanged", (state) => send(getWindow, "app:stateChanged", state));
  controller.on("log", (line) => send(getWindow, "app:log", line));
  controller.on("aiJobChanged", (job) => send(getWindow, "ai:jobChanged", job));
  controller.on("codexApprovalRequested", (request) => send(getWindow, "ai:approvalRequested", request));
  authClient?.on("authChanged", (state) => send(getWindow, "auth:changed", state));
  commerceService?.on("orderChanged", (order) => send(getWindow, "commerce:orderChanged", order));
  commerceService?.on("pointOrderChanged", (order) => send(getWindow, "commerce:pointOrderChanged", order));

  ipcMain.handle("app:getState", () => controller.getState());
  ipcMain.handle("app:consumeOpenThemeAction", () => consumeOpenThemeAction());

  ipcMain.handle("app:getSettings", (): RendererSettings => settings.current);

  ipcMain.handle("app:updateSettings", async (_event, patch: Partial<RendererSettings>) => {
    const allowed: Partial<RendererSettings> = {};
    if (typeof patch?.onboardingDone === "boolean") allowed.onboardingDone = patch.onboardingDone;
    if (typeof patch?.launchAtLogin === "boolean") allowed.launchAtLogin = patch.launchAtLogin;
    if (typeof patch?.autoApply === "boolean") allowed.autoApply = patch.autoApply;
    if (typeof patch?.codexCliPath === "string" && (patch.codexCliPath === "" || path.isAbsolute(patch.codexCliPath))) {
      allowed.codexCliPath = patch.codexCliPath === "" ? null : patch.codexCliPath;
    }
    const next = await settings.update(allowed);
    if (typeof allowed.launchAtLogin === "boolean") {
      app.setLoginItemSettings({ openAtLogin: allowed.launchAtLogin });
    }
    return next;
  });

  ipcMain.handle("themes:list", () => store.listThemes());

  ipcMain.handle("themes:apply", (_event, id: string, opts?: { confirmRestart?: boolean }) =>
    controller.applyTheme(id, opts),
  );

  ipcMain.handle("themes:restoreOfficial", () => controller.restoreOfficial());

  ipcMain.handle("codex:open", () => controller.openCodex());

  ipcMain.handle("themes:saveCustom", (_event, input: CustomThemeInput) =>
    store.saveCustomTheme(input),
  );

  ipcMain.handle("themes:saveDraft", (_event, input: ThemeDraftInput) =>
    store.saveThemeDraft(input),
  );

  ipcMain.handle("themes:update", (_event, id: string, input: ThemeDraftInput) =>
    store.updateTheme(id, input),
  );

  ipcMain.handle("themes:duplicate", (_event, id: string) => store.duplicateTheme(id));

  ipcMain.handle("themes:loadDraft", async (_event, id: string) => {
    const loaded = await store.loadThemeDraft(id);
    return {
      editingId: loaded.editingId,
      source: loaded.source,
      draft: loaded.draft,
      heroPreviewUrl: registerPickedImage(loaded.heroImagePath),
      wallpaperPreviewUrl: loaded.wallpaperImagePath ? registerPickedImage(loaded.wallpaperImagePath) : null,
      stampPreviewUrl: loaded.stampImagePath ? registerPickedImage(loaded.stampImagePath) : null,
    };
  });

  ipcMain.handle("themes:delete", async (_event, id: string) => {
    try {
      if (controller.getState().activeThemeId === id) {
        await controller.restoreOfficial();
      }
      await store.deleteTheme(id);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("images:pick", async (): Promise<PickedImage | null> => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: "选择背景图片",
      properties: ["openFile"],
      filters: IMAGE_FILE_FILTERS,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      previewUrl: registerPickedImage(filePath),
      palette: extractPalette(filePath),
      bytes: stat.size,
    };
  });

  ipcMain.handle("images:inspect", async (_event, filePath: string): Promise<PickedImage> => {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
      throw new Error("无效的图片路径。");
    }
    const extension = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      throw new Error("仅支持 PNG / JPEG / WebP 图片。");
    }
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_ART_BYTES) {
      throw new Error("图片必须非空且不超过 16 MB。");
    }
    return {
      path: filePath,
      previewUrl: registerPickedImage(filePath),
      palette: extractPalette(filePath),
      bytes: stat.size,
    };
  });

  ipcMain.handle("images:autoCropStamp", async (_event, heroPath: string): Promise<PickedImage> => {
    if (typeof heroPath !== "string" || !path.isAbsolute(heroPath)) {
      throw new Error("无效的图片路径。");
    }
    const extension = path.extname(heroPath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      throw new Error("仅支持 PNG / JPEG / WebP 图片。");
    }
    const stat = await fs.stat(heroPath);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_ART_BYTES) {
      throw new Error("图片必须非空且不超过 16 MB。");
    }

    const image = nativeImage.createFromPath(heroPath);
    if (image.isEmpty()) throw new Error("无法解码主图。");
    const { width, height } = image.getSize();
    const size = Math.min(width, height);
    const x = Math.round((width - size) / 2);
    const y = Math.round((height - size) / 2);
    const cropped = image
      .crop({ x, y, width: size, height: size })
      .resize({ width: 512, height: 512, quality: "good" });

    const stampDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-stamp-"));
    const stampPath = path.join(stampDir, `stamp${extension}`);
    const buf = extension === ".png" ? cropped.toPNG() : cropped.toJPEG(90);
    await fs.writeFile(stampPath, buf);

    return {
      path: stampPath,
      previewUrl: registerPickedImage(stampPath),
      palette: extractPalette(stampPath),
      bytes: buf.length,
    };
  });

  ipcMain.handle("images:extractPalette", (_event, imagePath: string) =>
    extractPalette(imagePath),
  );

  ipcMain.handle("themes:inspectPackage", async (): Promise<InspectedThemePackage | null> => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: "导入主题包",
      properties: ["openFile"],
      filters: [{ name: "Codex 主题包", extensions: ["codextheme", "zip"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return store.inspectThemePackage(result.filePaths[0]);
  });

  ipcMain.handle("themes:importInspected", async (_event, inspection: InspectedThemePackage, opts?: { newId?: string }) => {
    return store.importInspectedTheme(inspection, opts);
  });

  ipcMain.handle("themes:discardInspection", (_event, tempDir: string) =>
    store.discardInspection(tempDir),
  );

  ipcMain.handle("themes:importPackage", async (): Promise<ThemeSummary | null> => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: "导入主题包",
      properties: ["openFile"],
      filters: [{ name: "Codex 主题包", extensions: ["codextheme", "zip"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return store.importThemePackage(result.filePaths[0]);
  });

  ipcMain.handle("themes:exportPackage", async (_event, id: string): Promise<string | null> => {
    const win = getWindow();
    const result = await dialog.showSaveDialog(win!, {
      title: "导出主题包",
      defaultPath: path.join(app.getPath("downloads"), `${id}.codextheme`),
      filters: [{ name: "Codex 主题包", extensions: ["codextheme"] }],
    });
    if (result.canceled || !result.filePath) return null;
    return store.exportThemePackage(id, result.filePath);
  });

  ipcMain.handle("codexCli:getStatus", () => controller.getState().codexCli);

  ipcMain.handle("codexCli:select", async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: "选择 Codex CLI 可执行文件",
      properties: ["openFile", "treatPackageAsDirectory"],
      filters: CLI_FILE_FILTERS,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return controller.selectCodexCliPath(result.filePaths[0]);
  });

  ipcMain.handle("codexCli:refresh", () => controller.refreshCliStatus());

  ipcMain.handle("ai:createJob", (_event, input: ThemeGenerationRequest) => controller.createAiThemeJob(input));
  ipcMain.handle("ai:startJob", (_event, jobId: string) => controller.startAiThemeJob(jobId));
  ipcMain.handle("ai:selectCandidate", (_event, jobId: string, batchId: string, candidateId: string) =>
    controller.selectAiThemeCandidate(jobId, batchId, candidateId));
  ipcMain.handle("ai:sendMessage", (_event, jobId: string, input: AiThemeMessageInput) =>
    controller.sendAiThemeMessage(jobId, input));
  ipcMain.handle("ai:setRevision", (_event, jobId: string, revisionId: string) =>
    controller.setCurrentAiThemeRevision(jobId, revisionId));
  ipcMain.handle("ai:adoptRevision", (_event, jobId: string, revisionId: string) =>
    controller.adoptAiThemeRevision(jobId, revisionId));
  ipcMain.handle(
    "ai:applyRevision",
    (_event, jobId: string, revisionId: string, opts?: { confirmRestart?: boolean }) =>
      controller.applyAiThemeRevision(jobId, revisionId, opts),
  );
  ipcMain.handle("ai:cancelOperation", (_event, jobId: string, operationId: string) =>
    controller.cancelAiThemeOperation(jobId, operationId));
  ipcMain.handle("ai:retryOperation", (_event, jobId: string, operationId: string) =>
    controller.retryAiThemeOperation(jobId, operationId));
  ipcMain.handle("ai:refineJob", (_event, jobId: string, instruction: string, regenerateImage: boolean) => controller.refineAiThemeJob(jobId, instruction, regenerateImage));
  ipcMain.handle("ai:cancelJob", (_event, jobId: string) => controller.cancelAiThemeJob(jobId));
  ipcMain.handle("ai:retryJob", (_event, jobId: string) => controller.retryAiThemeJob(jobId));
  ipcMain.handle("ai:getJob", (_event, jobId: string) => controller.getAiThemeJob(jobId));
  ipcMain.handle("ai:listJobs", () => controller.listAiThemeJobs());
  ipcMain.handle("ai:deleteJob", (_event, jobId: string) => controller.deleteAiThemeJob(jobId));
  ipcMain.handle("ai:respondApproval", (_event, requestId: string, decision: "accept" | "decline" | "cancel") => controller.respondToCodexApproval(requestId, decision));

  ipcMain.handle("auth:getState", () => authClient?.getState() ?? { status: "unauthenticated", user: null, entitlementCount: 0, error: null });
  ipcMain.handle("auth:signInGitHub", () => authClient?.startGitHubSignIn() ?? { ok: false, error: "认证服务未启用。" });
  ipcMain.handle("auth:signInGoogle", () => authClient?.startGoogleSignIn() ?? { ok: false, error: "认证服务未启用。" });
  ipcMain.handle("auth:signOut", () => authClient?.signOut() ?? { ok: false, error: "认证服务未启用。" });

  ipcMain.handle("commerce:listCatalog", () => commerceService?.listCatalog() ?? []);
  ipcMain.handle("commerce:createOrder", (_event, themeId: string) =>
    commerceService?.createOrder(themeId) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:getOrder", (_event, orderId: string) => commerceService?.getOrder(orderId) ?? Promise.reject(new Error("Commerce service not enabled.")));
  ipcMain.handle("commerce:reconcileOrder", (_event, orderId: string) =>
    commerceService?.reconcileOrder(orderId) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:listEntitlements", () => commerceService?.listEntitlements() ?? []);
  ipcMain.handle("commerce:unlockTheme", (_event, themeId: string) =>
    commerceService?.unlockTheme(themeId) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:downloadTheme", (_event, themeId: string) =>
    commerceService?.downloadTheme(themeId) ?? { ok: false, error: "Commerce service not enabled." },
  );
  ipcMain.handle("commerce:getProfile", () =>
    commerceService?.getProfile() ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:updateProfile", (_event, input: { handle: string; displayName: string }) =>
    commerceService?.updateProfile(input) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:uploadAvatar", async () => {
    if (!commerceService) throw new Error("Commerce service not enabled.");
    const win = getWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: "选择头像",
      properties: ["openFile"],
      filters: IMAGE_FILE_FILTERS,
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const avatarPath = result.filePaths[0];
    const stat = await fs.stat(avatarPath);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_ART_BYTES) {
      throw new Error("头像图片必须非空且不超过 16 MB。");
    }
    const image = nativeImage.createFromPath(avatarPath);
    if (image.isEmpty()) throw new Error("无法读取所选头像图片。");
    const { width, height } = image.getSize();
    if (width < 96 || height < 96) throw new Error("头像尺寸不能小于 96 × 96。");
    if (width * height > 40_000_000) throw new Error("头像图片尺寸过大。");

    const size = Math.min(width, height);
    const normalized = image
      .crop({
        x: Math.round((width - size) / 2),
        y: Math.round((height - size) / 2),
        width: size,
        height: size,
      })
      .resize({ width: 512, height: 512, quality: "best" });
    let bytes = normalized.toPNG();
    if (bytes.byteLength > 3 * 1024 * 1024) bytes = normalized.toJPEG(90);
    return commerceService.uploadAvatar(bytes);
  });
  ipcMain.handle("commerce:getWallet", () =>
    commerceService?.getWallet() ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:listPointPacks", () => commerceService?.listPointPacks() ?? []);
  ipcMain.handle("commerce:listPointLedger", () => commerceService?.listPointLedger() ?? []);
  ipcMain.handle("commerce:createPointOrder", (_event, packId: string) =>
    commerceService?.createPointOrder(packId) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:getPointOrder", (_event, orderId: string) =>
    commerceService?.getPointOrder(orderId) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:reconcilePointOrder", (_event, orderId: string) =>
    commerceService?.reconcilePointOrder(orderId) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:listSubmissions", () => commerceService?.listSubmissions() ?? []);
  ipcMain.handle("commerce:submitTheme", (_event, input: SubmitThemeInput) =>
    commerceService?.submitTheme(input) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:retrySubmission", (_event, submissionId: string) =>
    commerceService?.retrySubmission(submissionId)
    ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:withdrawSubmission", (_event, submissionId: string) =>
    commerceService?.withdrawSubmission(submissionId) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:unpublishOwnTheme", (_event, themeId: string, reason: string) =>
    commerceService?.unpublishOwnTheme(themeId, reason)
    ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:adminListSubmissions", (_event, status?: ThemeSubmissionStatus) =>
    commerceService?.adminListSubmissions(status) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle(
    "commerce:adminReviewSubmission",
    (
      _event,
      submissionId: string,
      input: { action: "approve" | "reject"; pricePoints?: number; reason: string },
    ) =>
      commerceService?.adminReviewSubmission(submissionId, input)
      ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:adminGetOverview", () =>
    commerceService?.adminGetOverview() ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle(
    "commerce:adminAdjustPoints",
    (_event, input: { userId: string; delta: number; reason: string }) =>
      commerceService?.adminAdjustPoints(input) ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle(
    "commerce:adminSetThemeState",
    (
      _event,
      themeId: string,
      input: {
        action: "unpublish" | "republish" | "suspend_downloads" | "restore_downloads";
        reason: string;
      },
    ) =>
      commerceService?.adminSetThemeState(themeId, input)
      ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:adminReconcilePointOrder", (_event, orderId: string) =>
    commerceService?.adminReconcilePointOrder(orderId)
    ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:adminRefundPointOrder", (_event, orderId: string, reason: string) =>
    commerceService?.adminRefundPointOrder(orderId, reason)
    ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:adminReconcileThemeOrder", (_event, orderId: string) =>
    commerceService?.adminReconcileThemeOrder(orderId)
    ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
  ipcMain.handle("commerce:adminRefundThemeOrder", (_event, orderId: string, reason: string) =>
    commerceService?.adminRefundThemeOrder(orderId, reason)
    ?? Promise.reject(new Error("Commerce service not enabled.")),
  );
}
