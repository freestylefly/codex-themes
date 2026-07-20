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
  CustomThemeInput,
  InspectedThemePackage,
  OpenThemeAction,
  PickedImage,
  RendererSettings,
  ThemeDraftInput,
  ThemeGenerationRequest,
  ThemeSummary,
} from "./shared/types";
import type { AppPaths } from "./paths";
import type { ThemeController } from "./controller";
import type { SettingsStore } from "./settings";
import type { ThemeStore } from "./themes/store";
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
  getWindow: () => BrowserWindow | null;
  consumeOpenThemeAction: () => OpenThemeAction | null;
}

function send(getWindow: () => BrowserWindow | null, channel: string, payload: unknown) {
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

export function registerIpc(ctx: IpcContext): void {
  const { controller, settings, store, getWindow, consumeOpenThemeAction } = ctx;

  controller.on("stateChanged", (state) => send(getWindow, "app:stateChanged", state));
  controller.on("log", (line) => send(getWindow, "app:log", line));
  controller.on("aiJobChanged", (job) => send(getWindow, "ai:jobChanged", job));
  controller.on("codexApprovalRequested", (request) => send(getWindow, "ai:approvalRequested", request));

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
  ipcMain.handle("ai:selectCandidate", (_event, jobId: string, candidateId: string) => controller.selectAiThemeCandidate(jobId, candidateId));
  ipcMain.handle("ai:refineJob", (_event, jobId: string, instruction: string, regenerateImage: boolean) => controller.refineAiThemeJob(jobId, instruction, regenerateImage));
  ipcMain.handle("ai:cancelJob", (_event, jobId: string) => controller.cancelAiThemeJob(jobId));
  ipcMain.handle("ai:retryJob", (_event, jobId: string) => controller.retryAiThemeJob(jobId));
  ipcMain.handle("ai:getJob", (_event, jobId: string) => controller.getAiThemeJob(jobId));
  ipcMain.handle("ai:listJobs", () => controller.listAiThemeJobs());
  ipcMain.handle("ai:deleteJob", (_event, jobId: string) => controller.deleteAiThemeJob(jobId));
  ipcMain.handle("ai:respondApproval", (_event, requestId: string, decision: "accept" | "decline" | "cancel") => controller.respondToCodexApproval(requestId, decision));
}
