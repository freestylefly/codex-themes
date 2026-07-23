/**
 * Auth service: Supabase Auth wrapper for the Electron main process.
 *
 * Responsibilities:
 * - hold the Supabase client (anon key only, no service role);
 * - manage the current session and refresh it before expiry;
 * - persist tokens via AuthTokenStore (safeStorage encrypted);
 * - expose email OTP, GitHub OAuth+PKCE, sign-out;
 * - emit auth state changes for the renderer.
 */

import { EventEmitter } from "node:events";
import { createClient, type AuthError, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthProvider, AuthState, AuthUserSummary } from "../shared/types";
import { AuthTokenStore } from "./store";

export interface AuthClientOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  tokenStore: AuthTokenStore;
  /** Called with the OAuth authorization URL when starting GitHub sign-in. */
  onOpenExternalUrl(url: string): void;
  /** Called when a code exchange completes so the main process can drain pending auth URLs. */
  onAuthUrlHandled?(): void;
}

function envOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}。`);
  return value;
}

function providerFromSession(session: Session): AuthProvider {
  const provider = session.user.app_metadata?.provider;
  if (provider === "google") return "google";
  if (provider === "github") return "github";
  return "email";
}

export function createSupabaseClient(): SupabaseClient {
  return createClient(envOrThrow("SUPABASE_URL"), envOrThrow("SUPABASE_ANON_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
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
): AuthState {
  return {
    status,
    user: session ? toAuthUser(session) : null,
    entitlementCount: 0,
    error,
  };
}

export class AuthClient extends EventEmitter {
  private client: SupabaseClient;
  private tokenStore: AuthTokenStore;
  private onOpenExternalUrl: (url: string) => void;
  private onAuthUrlHandled?: () => void;
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private currentSession: Session | null = null;
  private currentState: AuthState = toAuthState("loading", null);
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(opts: AuthClientOptions) {
    super();
    this.client = createClient(opts.supabaseUrl, opts.supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
    this.supabaseUrl = opts.supabaseUrl;
    this.supabaseAnonKey = opts.supabaseAnonKey;
    this.tokenStore = opts.tokenStore;
    this.onOpenExternalUrl = opts.onOpenExternalUrl;
    this.onAuthUrlHandled = opts.onAuthUrlHandled;
  }

  async init(): Promise<void> {
    const tokens = await this.tokenStore.load();
    if (!tokens) {
      this.setState(toAuthState("unauthenticated", null));
      return;
    }
    const { data, error } = await this.client.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    if (error || !data.session) {
      await this.tokenStore.clear();
      this.setState(toAuthState("unauthenticated", null));
      return;
    }
    this.applySession(data.session, tokens.provider);
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
    this.onOpenExternalUrl(data.url);
    return { ok: true, url: data.url };
  }

  /** Called when the OS hands us codexthemes://auth/callback?code=... */
  async handleAuthCallback(url: string): Promise<void> {
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");
      if (!code) return;
      const { data, error } = await this.client.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        this.setState({ ...this.currentState, status: "error", error: formatAuthError(error) });
        return;
      }
      await this.applySession(data.session, providerFromSession(data.session));
    } finally {
      this.onAuthUrlHandled?.();
    }
  }

  async signOut(): Promise<{ ok: boolean; error?: string }> {
    this.clearRefreshTimer();
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
      await this.tokenStore.clear().catch(() => {});
      this.setState(toAuthState("unauthenticated", null));
    }
    return { ok: true };
  }

  private async refreshSession(): Promise<void> {
    const refreshToken = this.currentSession?.refresh_token;
    if (!refreshToken) return;
    const { data, error } = await this.client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      await this.tokenStore.clear();
      this.setState(toAuthState("unauthenticated", null));
      return;
    }
    const provider = this.currentState.user?.provider ?? providerFromSession(data.session);
    await this.applySession(data.session, provider);
  }

  private async applySession(session: Session, provider: AuthProvider): Promise<void> {
    this.currentSession = session;
    await this.tokenStore.save({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      provider,
    });
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
