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

export function createSupabaseClient(): SupabaseClient {
  return createClient(envOrThrow("SUPABASE_URL"), envOrThrow("SUPABASE_ANON_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function toAuthUser(session: Session): AuthUserSummary {
  const provider = session.user.app_metadata?.provider ?? "email";
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    avatarUrl: session.user.user_metadata?.avatar_url ?? null,
    provider: provider === "github" ? "github" : "email",
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
  private currentSession: Session | null = null;
  private currentState: AuthState = toAuthState("loading", null);
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingPkceVerifier: string | null = null;

  constructor(opts: AuthClientOptions) {
    super();
    this.client = createClient(opts.supabaseUrl, opts.supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
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

  async sendEmailOtp(email: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.client.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    if (error) return { ok: false, error: formatAuthError(error) };
    return { ok: true };
  }

  async verifyEmailOtp(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.client.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: "email",
    });
    if (error || !data.session) return { ok: false, error: formatAuthError(error) };
    await this.applySession(data.session, "email");
    return { ok: true };
  }

  async startGitHubSignIn(): Promise<{ ok: boolean; error?: string; url?: string }> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: "github",
      options: {
        skipBrowserRedirect: true,
        redirectTo: "codexthemes://auth/callback",
      },
    });
    if (error || !data.url) return { ok: false, error: formatAuthError(error) };
    // Extract PKCE verifier that Supabase generated for this flow.
    const verifier = (data as unknown as { provider?: string; url?: string; verifier?: string }).verifier ?? null;
    this.pendingPkceVerifier = verifier;
    this.onOpenExternalUrl(data.url);
    return { ok: true, url: data.url };
  }

  /** Called when the OS hands us codexthemes://auth/callback?code=... */
  async handleAuthCallback(url: string): Promise<void> {
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");
      if (!code) return;
      const verifier = this.pendingPkceVerifier;
      if (!verifier) {
        this.setState({ ...this.currentState, status: "error", error: "未找到 OAuth 验证信息,请重新发起登录。" });
        return;
      }
      const { data, error } = await this.client.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        this.setState({ ...this.currentState, status: "error", error: formatAuthError(error) });
        return;
      }
      await this.applySession(data.session, "github");
    } finally {
      this.pendingPkceVerifier = null;
      this.onAuthUrlHandled?.();
    }
  }

  async signOut(): Promise<{ ok: boolean; error?: string }> {
    this.clearRefreshTimer();
    const { error } = await this.client.auth.signOut();
    this.currentSession = null;
    await this.tokenStore.clear();
    this.setState(toAuthState("unauthenticated", null));
    if (error) return { ok: false, error: formatAuthError(error) };
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
    const provider = this.currentState.user?.provider ?? "email";
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
