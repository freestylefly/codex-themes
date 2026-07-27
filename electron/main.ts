/**
 * [INPUT]: 依赖 Electron 生命周期、路径/设置/主题/认证/更新模块与 ThemeController
 * [OUTPUT]: 组合单实例窗口、托盘、IPC、深链、登录、更新和周期状态驱动
 * [POS]: Electron 主进程组合根，只编排模块并处理应用级生命周期与失败呈现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { app, BrowserWindow, dialog, nativeImage, net, protocol, screen, shell } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveAppPaths, type AppPaths } from "./paths";
import { SettingsStore } from "./settings";
import { ThemeStore } from "./themes/store";
import { ThemeController } from "./controller";
import { registerIpc } from "./ipc";
import { AppTray } from "./tray";
import { resolvePickedImage } from "./picked-images";
import { initAutoUpdater } from "./updater";
import { CODEX_THEMES_PROTOCOL, parseOpenThemeUrl } from "./deep-links";
import type { OpenThemeAction } from "./shared/types";
import type { PaymentResultAction } from "./deep-links";
import { HIDDEN_LOGIN_ARGUMENT, classifyLaunchArguments, type LaunchArgument } from "./launch-arguments";
import { AuthClient } from "./auth/client";
import { AuthTokenStore, EncryptedAuthStorage } from "./auth/store";
import { CommerceService } from "./commerce/service";
import { assertSupportedDesktopHost } from "./platform";

// Files launched before the app is ready (double-click / drag to Dock).
const pendingOpenFiles: string[] = [];
const pendingOpenThemeUrls: string[] = [];
const pendingOpenThemeActions: OpenThemeAction[] = [];
const pendingAuthCallbacks: string[] = [];
const pendingPaymentResults: PaymentResultAction[] = [];

function isCodexthemeFile(file: string): boolean {
  return path.extname(file).toLowerCase() === ".codextheme";
}

async function importPackageFromPath(
  filePath: string,
  store: ThemeStore,
  getWindow: () => BrowserWindow | null,
): Promise<void> {
  if (!isCodexthemeFile(filePath)) return;
  try {
    const summary = await store.importThemePackage(filePath);
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("package:imported", summary);
      win.show();
    }
  } catch (error) {
    dialog.showErrorBox("导入主题包失败", (error as Error).message);
  }
}

// Privileged schemes must be registered before app.whenReady().
protocol.registerSchemesAsPrivileged([
  {
    scheme: "theme-image",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
  {
    scheme: "picked-image",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

// The CDP client needs Node's built-in WebSocket (Node >= 22 / Electron >= 35).
if (typeof globalThis.WebSocket !== "function") {
  dialog.showErrorBox(
    "Codex Themes 无法启动",
    "当前 Electron 运行时不提供内置 WebSocket,无法连接 Codex 调试端口。",
  );
  app.exit(1);
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
}

if (process.platform === "win32") {
  app.setAppUserModelId("com.codexthemes.app");
}

if (process.defaultApp && process.argv[1]) {
  app.setAsDefaultProtocolClient(CODEX_THEMES_PROTOCOL.slice(0, -1), process.execPath, [
    path.resolve(process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient(CODEX_THEMES_PROTOCOL.slice(0, -1));
}

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let controller: ThemeController;
let themeStore: ThemeStore | null = null;
let authClient: AuthClient | null = null;
let commerceService: CommerceService | null = null;

async function reconcilePayment(payment: PaymentResultAction): Promise<void> {
  if (!commerceService) {
    pendingPaymentResults.push(payment);
    return;
  }
  if (payment.orderKind === "points") {
    await commerceService.reconcilePointOrder(payment.orderId);
  } else {
    await commerceService.reconcileOrder(payment.orderId);
  }
}

async function routeLaunchArgument(argument: LaunchArgument): Promise<void> {
  if (argument.type === "theme-file") {
    if (themeStore) await importPackageFromPath(argument.filePath, themeStore, () => mainWindow);
    else pendingOpenFiles.push(argument.filePath);
    return;
  }
  if (argument.type === "auth") {
    if (authClient) await authClient.handleAuthCallback(argument.rawUrl);
    else pendingAuthCallbacks.push(argument.rawUrl);
    showWindow();
    return;
  }
  if (argument.type === "payment") {
    await reconcilePayment(argument.action);
    showWindow();
    return;
  }
  if (themeStore) await enqueueOpenThemeUrl(argument.rawUrl);
  else pendingOpenThemeUrls.push(argument.rawUrl);
}

function createWindow(paths: AppPaths, showOnReady: boolean): void {
  const macosWindowOptions = process.platform === "darwin"
    ? {
        titleBarStyle: "hiddenInset" as const,
        trafficLightPosition: { x: 14, y: 14 },
      }
    : {
        titleBarStyle: "hidden" as const,
        titleBarOverlay: {
          color: "#18191c",
          symbolColor: "#b8b6b0",
          height: 40,
        },
      };
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1120, Math.max(680, workArea.width)),
    height: Math.min(760, Math.max(480, workArea.height)),
    minWidth: 680,
    minHeight: 480,
    center: true,
    title: "Codex Themes",
    ...(process.platform === "win32" && !app.isPackaged
      ? { icon: path.join(paths.assetsRoot, "build", "icon.ico") }
      : {}),
    ...macosWindowOptions,
    backgroundColor: "#141518",
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (showOnReady) mainWindow?.show();
  });
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(import.meta.dirname, "../renderer/index.html"));
  }

  // Finder/dock icon in dev; packaged apps use the bundled icns.
  if (!app.isPackaged) {
    const icon = nativeImage.createFromPath(
      path.join(paths.assetsRoot, "build", "icon.png"),
    );
    if (!icon.isEmpty()) app.dock?.setIcon(icon);
  }
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function enqueueOpenThemeUrl(raw: string): Promise<void> {
  const action = parseOpenThemeUrl(raw);
  if (!action || !themeStore) return;

  if (action.type === "open-theme") {
    const themes = await themeStore.listThemes();
    const isBuiltIn = themes.some(
      (theme) => theme.source === "preset" && theme.id === action.themeId,
    );
    if (!isBuiltIn) return;
  }

  pendingOpenThemeActions.push(action);
  showWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app:openThemeActionAvailable");
  }
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  for (const argument of classifyLaunchArguments([filePath])) void routeLaunchArgument(argument);
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  for (const argument of classifyLaunchArguments([url])) void routeLaunchArgument(argument);
});

app.on("second-instance", (_event, argv) => {
  showWindow();
  for (const argument of classifyLaunchArguments(argv)) void routeLaunchArgument(argument);
});

app.on("activate", () => {
  if (mainWindow) showWindow();
});

app.whenReady().then(async () => {
  assertSupportedDesktopHost();
  const paths = await resolveAppPaths();
  const settings = new SettingsStore(paths.settingsFile);
  await settings.load();
  if (settings.current.launchAtLogin) {
    app.setLoginItemSettings(process.platform === "win32"
      ? { openAtLogin: true, args: [HIDDEN_LOGIN_ARGUMENT] }
      : { openAtLogin: true });
  }

  const store = new ThemeStore({
    presetsRoot: paths.presetsRoot,
    userThemesRoot: paths.userThemesRoot,
    purchasedThemesRoot: paths.purchasedThemesRoot,
  });
  themeStore = store;
  void store.cleanupWorkDirs().catch(() => {});
  controller = new ThemeController(paths, store, settings);

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const commerceApiUrl = process.env.VITE_COMMERCE_API_URL ?? "https://codex-themes.vercel.app";

  if (supabaseUrl && supabaseAnonKey) {
    authClient = new AuthClient({
      supabaseUrl,
      supabaseAnonKey,
      storage: new EncryptedAuthStorage(paths.userDataRoot),
      legacyTokenStore: new AuthTokenStore(paths.userDataRoot),
      onOpenExternalUrl: (url) => shell.openExternal(url),
    });
    commerceService = new CommerceService({
      apiBaseUrl: commerceApiUrl,
      supabaseUrl,
      supabaseAnonKey,
      authClient,
      store,
      purchasedThemesRoot: paths.purchasedThemesRoot,
      onOpenCheckoutUrl: (url) => shell.openExternal(url),
    });
    await authClient.init().catch((err) => {
      console.error("Auth init failed:", (err as Error).message);
    });
  } else {
    console.warn("SUPABASE_URL or SUPABASE_ANON_KEY not set; auth/commerce disabled.");
  }

  // theme-image://<theme-id>/<filename> — confined to known theme roots.
  protocol.handle("theme-image", async (request) => {
    try {
      const url = new URL(request.url);
      const id = decodeURIComponent(url.hostname);
      const filename = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const file = await store.resolveImageFile(id, filename);
      if (!file) return new Response("not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response("bad request", { status: 400 });
    }
  });

  // picked-image://<token> — only paths the user chose in the file dialog.
  protocol.handle("picked-image", (request) => {
    try {
      const url = new URL(request.url);
      const file = resolvePickedImage(decodeURIComponent(url.hostname));
      if (!file) return new Response("not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response("bad request", { status: 400 });
    }
  });

  const updater = initAutoUpdater(
    () => mainWindow,
    (level, message) => controller.emit("log", { at: new Date().toISOString(), level, message }),
  );

  registerIpc({
    paths,
    controller,
    settings,
    store,
    authClient: authClient ?? undefined,
    commerceService: commerceService ?? undefined,
    updater,
    getWindow: () => mainWindow,
    consumeOpenThemeAction: () => pendingOpenThemeActions.shift() ?? null,
  });

  new AppTray(
    paths.trayIconPath,
    controller,
    showWindow,
    () => {
      void requestQuit();
    },
  );

  createWindow(paths, !process.argv.includes(HIDDEN_LOGIN_ARGUMENT));
  await controller.init();

  // Keep status fresh and drive Codex-launch auto-apply (M4).
  setInterval(() => {
    void controller.tick().catch((error) => {
      console.error("Periodic Codex status refresh failed:", (error as Error).message);
    });
  }, 5000);

  // Process files opened before or during launch (double-click / Dock drop).
  while (pendingOpenFiles.length > 0) {
    const file = pendingOpenFiles.shift();
    if (file) await importPackageFromPath(file, store, () => mainWindow);
  }

  // Process auth callbacks that arrived before the service was ready.
  while (pendingAuthCallbacks.length > 0) {
    const url = pendingAuthCallbacks.shift();
    if (url) await authClient?.handleAuthCallback(url);
  }

  // Process payment deep links that arrived before the service was ready.
  while (pendingPaymentResults.length > 0) {
    const payment = pendingPaymentResults.shift();
    if (payment) await reconcilePayment(payment);
  }

  for (const argument of classifyLaunchArguments([
    ...pendingOpenThemeUrls.splice(0),
    ...process.argv,
  ])) {
    await routeLaunchArgument(argument);
  }
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox("Codex Themes 无法启动", message);
  app.exit(1);
});

/** Confirm quit when a theme is live: the skin fades on Codex's next refresh. */
async function requestQuit(): Promise<void> {
  const state = controller.getState();
  if (state.activeThemeId && mainWindow) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "退出 Codex Themes",
      message: "退出后注入守护将停止",
      detail:
        "当前主题已在 Codex 中生效。退出本应用后,主题会保留到 Codex 下次刷新或重启;届时将恢复官方外观,直到你再次打开本应用。",
      buttons: ["退出", "取消"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;
  }
  quitting = true;
  await controller.shutdown({ cleanup: false });
  app.quit();
}

app.on("before-quit", (event) => {
  if (!quitting) {
    event.preventDefault();
    void requestQuit();
  }
});

app.on("window-all-closed", () => {
  // Tray app: do not quit when the last window closes.
});
