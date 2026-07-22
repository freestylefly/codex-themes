/**
 * Main process entry: single instance, privileged image protocols, the main
 * window (hidden-inset title bar), tray, IPC wiring, and quit semantics.
 *
 * Window close retreats to the tray instead of quitting (DESIGN §3); a real
 * quit stops the watcher, and the injected skin fades on Codex's next
 * refresh — the user is told this in the Settings page and quit dialog.
 */

import { app, BrowserWindow, dialog, nativeImage, net, protocol, shell } from "electron";
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
import { CODEX_THEMES_PROTOCOL, parseOpenThemeUrl, parseAuthCallbackUrl, parsePaymentResultUrl } from "./deep-links";
import type { OpenThemeAction } from "./shared/types";
import { AuthClient } from "./auth/client";
import { AuthTokenStore } from "./auth/store";
import { CommerceService } from "./commerce/service";

// Files launched before the app is ready (double-click / drag to Dock).
const pendingOpenFiles: string[] = [];
const pendingOpenThemeUrls: string[] = [];
const pendingOpenThemeActions: OpenThemeAction[] = [];
const pendingAuthCallbacks: string[] = [];
const pendingPaymentResults: string[] = [];

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

function createWindow(paths: AppPaths): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    title: "Codex Themes",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: "#141518",
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
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
  pendingOpenFiles.push(filePath);
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  if (parseAuthCallbackUrl(url)) {
    if (authClient) void authClient.handleAuthCallback(url);
    else pendingAuthCallbacks.push(url);
    return;
  }
  const payment = parsePaymentResultUrl(url);
  if (payment) {
    if (commerceService) void commerceService.reconcileOrder(payment.orderId);
    else pendingPaymentResults.push(payment.orderId);
    showWindow();
    return;
  }
  if (themeStore) void enqueueOpenThemeUrl(url);
  else pendingOpenThemeUrls.push(url);
});

app.on("second-instance", (_event, argv) => {
  showWindow();
  const file = argv.find((arg) => isCodexthemeFile(arg));
  if (file) pendingOpenFiles.push(file);
  const url = argv.find((arg) => arg.startsWith(CODEX_THEMES_PROTOCOL));
  if (url) {
    if (parseAuthCallbackUrl(url)) {
      if (authClient) void authClient.handleAuthCallback(url);
      else pendingAuthCallbacks.push(url);
      return;
    }
    const payment = parsePaymentResultUrl(url);
    if (payment) {
      if (commerceService) void commerceService.reconcileOrder(payment.orderId);
      else pendingPaymentResults.push(payment.orderId);
      return;
    }
    if (themeStore) void enqueueOpenThemeUrl(url);
    else pendingOpenThemeUrls.push(url);
  }
});

app.on("activate", () => {
  if (mainWindow) showWindow();
});

app.whenReady().then(async () => {
  const paths = await resolveAppPaths();
  const settings = new SettingsStore(paths.settingsFile);
  await settings.load();
  if (settings.current.launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: true });
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
      tokenStore: new AuthTokenStore(paths.userDataRoot),
      onOpenExternalUrl: (url) => shell.openExternal(url),
    });
    commerceService = new CommerceService({
      apiBaseUrl: commerceApiUrl,
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

  registerIpc({
    paths,
    controller,
    settings,
    store,
    authClient: authClient ?? undefined,
    commerceService: commerceService ?? undefined,
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

  createWindow(paths);
  await controller.init();
  initAutoUpdater(
    () => mainWindow,
    (level, message) => controller.emit("log", { at: new Date().toISOString(), level, message }),
  );

  // Keep status fresh and drive Codex-launch auto-apply (M4).
  setInterval(() => {
    void controller.tick();
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
    const orderId = pendingPaymentResults.shift();
    if (orderId) await commerceService?.reconcileOrder(orderId);
  }

  const startupUrls = new Set([
    ...pendingOpenThemeUrls.splice(0),
    ...process.argv.filter((arg) => arg.startsWith(CODEX_THEMES_PROTOCOL)),
  ]);
  for (const raw of startupUrls) {
    if (parseAuthCallbackUrl(raw)) {
      await authClient?.handleAuthCallback(raw);
      continue;
    }
    const payment = parsePaymentResultUrl(raw);
    if (payment) {
      await commerceService?.reconcileOrder(payment.orderId);
      continue;
    }
    await enqueueOpenThemeUrl(raw);
  }
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
