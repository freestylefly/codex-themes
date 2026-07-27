/**
 * [INPUT]: 依赖 Supabase Auth、EncryptedAuthStorage、旧令牌迁移器与系统浏览器打开函数
 * [OUTPUT]: 对外提供 OAuth 单飞、回调、会话恢复/刷新/登出和 AuthState 事件
 * [POS]: electron/auth 的业务深模块，隐藏 PKCE、令牌和网络错误分类，Renderer 只消费状态机
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { EventEmitter } from "node:events";
import { createClient, type AuthError, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthProvider, AuthState, AuthUserSummary } from "../shared/types";
import { parseAuthCallbackUrl } from "../deep-links";
import { AuthTokenStore, type AuthStorage } from "./store";

const OAUTH_TIMEOUT_MS = 10 * 60_000;
const REFRESH_RETRY_MS = 30_000;

export interface AuthClientOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  storage: AuthStorage;
  legacyTokenStore?: AuthTokenStore;
  client?: SupabaseClient;
  /** Called with the OAuth authorization URL; rejection is shown to the user. */
  onOpenExternalUrl(url: string): Promise<void>;
  /** Called when a code exchange completes so the main process can drain pending auth URLs. */
  onAuthUrlHandled?(): void;
}

function providerFromSession(session: Session): AuthProvider {
  const provider = session.user.app_metadata?.provider;
  if (provider === "google") return "google";
  if (provider === "github") return "github";
  return "email";
}

function toAuthUser(session: Session): AuthUserSummary {
  const metadata = session.user.user_metadata ?? {};
  const displayNameCandidates = [
    metadata.full_name,
    metadata.name,
    metadata.user_name,
    metadata.preferred_username,
  ];
  const displayName =
    displayNameCandidates.find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    )?.trim() ??
    session.user.email ??
    "账号";
  const avatarCandidate =
    typeof metadata.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata.picture === "string"
        ? metadata.picture
        : null;
  const avatarUrl = (() => {
    if (!avatarCandidate) return null;
    try {
      const parsed = new URL(avatarCandidate);
      return parsed.protocol === "https:" ? parsed.toString() : null;
    } catch {
      return null;
    }
  })();

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    displayName,
    avatarUrl,
    provider: providerFromSession(session),
    createdAt: session.user.created_at,
  };
}

function toAuthState(
  status: AuthState["status"],
  session: Session | null,
  error: string | null = null,
  pendingProvider: "github" | "google" | null = null,
): AuthState {
  return {
    status,
    user: session ? toAuthUser(session) : null,
    entitlementCount: 0,
    pendingProvider,
    error,
  };
}

export class AuthClient extends EventEmitter {
  private client: SupabaseClient;
  private legacyTokenStore?: AuthTokenStore;
  private onOpenExternalUrl: (url: string) => Promise<void>;
  private onAuthUrlHandled?: () => void;
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private currentSession: Session | null = null;
  private currentState: AuthState = toAuthState("loading", null);
  private refreshTimer: NodeJS.Timeout | null = null;
  private oauthTimer: NodeJS.Timeout | null = null;
  private pendingOAuth: {
    provider: "github" | "google";
    url: string;
    expiresAt: number;
  } | null = null;

  constructor(opts: AuthClientOptions) {
    super();
    this.client = opts.client ?? createClient(opts.supabaseUrl, opts.supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        storage: opts.storage,
      },
    });
    this.supabaseUrl = opts.supabaseUrl;
    this.supabaseAnonKey = opts.supabaseAnonKey;
    this.legacyTokenStore = opts.legacyTokenStore;
    this.onOpenExternalUrl = opts.onOpenExternalUrl;
    this.onAuthUrlHandled = opts.onAuthUrlHandled;
  }

  async init(): Promise<void> {
    try {
      const existing = await this.client.auth.getSession();
      if (existing.data.session) {
        this.applySession(existing.data.session);
        return;
      }

      const tokens = await this.legacyTokenStore?.load();
      if (tokens) {
        const migrated = await this.client.auth.setSession({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        });
        if (migrated.data.session && !migrated.error) {
          this.applySession(migrated.data.session);
          await this.legacyTokenStore?.clear();
          return;
        }
      }
      this.setState(toAuthState("unauthenticated", null));
    } catch (error) {
      this.setState(toAuthState("error", null, `无法读取登录状态:${(error as Error).message}`));
    }
  }

  getState(): AuthState {
    return { ...this.currentState };
  }

  getSession(): Session | null {
    return this.currentSession;
  }

  /** Return a valid access token, refreshing if necessary. */
  async getAccessToken(): Promise<string | null> {
    if (!this.currentSession) return null;
    const expiresAt = this.currentSession.expires_at;
    const bufferSeconds = 120;
    if (expiresAt && expiresAt - bufferSeconds <= Date.now() / 1000) {
      await this.refreshSession();
    }
    return this.currentSession?.access_token ?? null;
  }

  async startGitHubSignIn(): Promise<{ ok: boolean; error?: string; url?: string }> {
    return this.startOAuthSignIn("github");
  }

  async startGoogleSignIn(): Promise<{ ok: boolean; error?: string; url?: string }> {
    return this.startOAuthSignIn("google");
  }

  private async startOAuthSignIn(
    provider: "github" | "google",
  ): Promise<{ ok: boolean; error?: string; url?: string }> {
    const providerName = provider === "google" ? "Google" : "GitHub";
    if (this.pendingOAuth && this.pendingOAuth.expiresAt > Date.now()) {
      if (this.pendingOAuth.provider !== provider) {
        return { ok: false, error: `已有 ${this.pendingOAuth.provider === "google" ? "Google" : "GitHub"} 登录正在进行。` };
      }
      try {
        await this.onOpenExternalUrl(this.pendingOAuth.url);
        return { ok: true, url: this.pendingOAuth.url };
      } catch (error) {
        const message = `无法打开系统浏览器:${(error as Error).message}`;
        this.setState(toAuthState("error", null, message));
        return { ok: false, error: message };
      }
    }
    this.clearPendingOAuth();

    try {
      const response = await fetch(`${this.supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: this.supabaseAnonKey },
      });
      if (response.ok) {
        const settings = await response.json() as {
          external?: Partial<Record<"github" | "google", boolean>>;
        };
        if (!settings.external?.[provider]) {
          return {
            ok: false,
            error: `${providerName} 登录尚未在认证服务中启用。`,
          };
        }
      }
    } catch {
      // A temporary settings lookup failure should not block a configured
      // provider; the OAuth endpoint remains the source of truth.
    }

    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: {
        skipBrowserRedirect: true,
        redirectTo: "codexthemes://auth/callback",
      },
    });
    if (error || !data.url) return { ok: false, error: formatAuthError(error) };
    this.pendingOAuth = {
      provider,
      url: data.url,
      expiresAt: Date.now() + OAUTH_TIMEOUT_MS,
    };
    this.setState(toAuthState("authenticating", null, null, provider));
    this.scheduleOAuthTimeout();
    try {
      await this.onOpenExternalUrl(data.url);
      return { ok: true, url: data.url };
    } catch (openError) {
      this.clearPendingOAuth();
      const message = `无法打开系统浏览器:${(openError as Error).message}`;
      this.setState(toAuthState("error", null, message));
      return { ok: false, error: message };
    }
  }

  /** Called when the OS hands us codexthemes://auth/callback?code=... */
  async handleAuthCallback(url: string): Promise<void> {
    try {
      const callback = parseAuthCallbackUrl(url);
      if (!callback || this.currentSession) return;
      if (callback.error) {
        this.clearPendingOAuth();
        this.setState(toAuthState("error", null, formatOAuthCallbackError(callback.error)));
        return;
      }
      if (!callback.code) return;
      const { data, error } = await this.client.auth.exchangeCodeForSession(callback.code);
      if (error || !data.session) {
        this.clearPendingOAuth();
        this.setState(toAuthState("error", null, formatAuthError(error)));
        return;
      }
      this.clearPendingOAuth();
      this.applySession(data.session);
    } finally {
      this.onAuthUrlHandled?.();
    }
  }

  async signOut(): Promise<{ ok: boolean; error?: string }> {
    this.clearRefreshTimer();
    this.clearPendingOAuth();
    try {
      // A desktop "退出登录" should only end this installation's session.
      // Supabase defaults to `global`, which unnecessarily signs out every
      // device and makes the local action depend on a broader remote revoke.
      await this.client.auth.signOut({ scope: "local" });
    } catch {
      // Remote revocation is best-effort; local session removal below is the
      // authoritative result for this desktop installation.
    } finally {
      // Local logout must still complete if the network/revocation request
      // fails. The access token is no longer available to this app, and the
      // server-issued token will expire normally.
      this.currentSession = null;
      this.setState(toAuthState("unauthenticated", null));
    }
    return { ok: true };
  }

  private async refreshSession(): Promise<void> {
    const refreshToken = this.currentSession?.refresh_token;
    if (!refreshToken) return;
    try {
      const { data, error } = await this.client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) {
        if (isPermanentSessionError(error)) {
          await this.client.auth.signOut({ scope: "local" }).catch(() => {});
          this.currentSession = null;
          this.setState(toAuthState("unauthenticated", null, "登录状态已失效,请重新登录。"));
          return;
        }
        this.scheduleRefreshRetry();
        this.setState(toAuthState("authenticated", this.currentSession, "网络暂不可用,登录状态将在连接恢复后刷新。"));
        return;
      }
      this.applySession(data.session);
    } catch {
      this.scheduleRefreshRetry();
      this.setState(toAuthState("authenticated", this.currentSession, "网络暂不可用,登录状态将在连接恢复后刷新。"));
    }
  }

  private applySession(session: Session): void {
    this.currentSession = session;
    this.scheduleRefresh(session);
    this.setState(toAuthState("authenticated", session));
  }

  private scheduleRefresh(session: Session): void {
    this.clearRefreshTimer();
    const expiresAt = session.expires_at;
    if (!expiresAt) return;
    const delayMs = expiresAt * 1000 - Date.now() - 2 * 60 * 1000;
    if (delayMs <= 0) return;
    this.refreshTimer = setTimeout(() => {
      void this.refreshSession();
    }, delayMs);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private scheduleRefreshRetry(): void {
    this.clearRefreshTimer();
    this.refreshTimer = setTimeout(() => {
      void this.refreshSession();
    }, REFRESH_RETRY_MS);
  }

  private scheduleOAuthTimeout(): void {
    if (this.oauthTimer) clearTimeout(this.oauthTimer);
    this.oauthTimer = setTimeout(() => {
      this.clearPendingOAuth();
      this.setState(toAuthState("error", null, "登录等待已超时,请重新发起授权。"));
    }, OAUTH_TIMEOUT_MS);
  }

  private clearPendingOAuth(): void {
    this.pendingOAuth = null;
    if (this.oauthTimer) {
      clearTimeout(this.oauthTimer);
      this.oauthTimer = null;
    }
  }

  private setState(state: AuthState): void {
    this.currentState = state;
    this.emit("authChanged", state);
  }
}

function formatAuthError(error: AuthError | null): string {
  if (!error) return "登录失败,请重试。";
  const message = error.message?.toLowerCase() ?? "";
  if (message.includes("token")) return "验证码无效或已过期,请重新获取。";
  if (message.includes("email")) return "邮箱格式不正确。";
  if (message.includes("rate")) return "请求过于频繁,请稍后再试。";
  return error.message || "登录失败,请重试。";
}

function formatOAuthCallbackError(error: string): string {
  const normalized = error.toLowerCase();
  if (normalized.includes("access_denied")) return "登录已取消。";
  return `登录失败:${error}`;
}

function isPermanentSessionError(error: AuthError | null): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return [400, 401, 403].includes(error.status ?? 0)
    && /(refresh token|invalid.*token|session.*(expired|missing|invalid)|jwt)/.test(message);
}
