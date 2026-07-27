/**
 * [INPUT]: 依赖 node:test、内存 Supabase 替身和 AuthClient 公共接口
 * [OUTPUT]: 验证 OAuth 单飞/重开、成功/取消回调与刷新错误保留会话
 * [POS]: electron/auth 的接口级回归门禁，不访问真实 OAuth 提供商或系统浏览器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthError, Session, SupabaseClient } from "@supabase/supabase-js";
import { AuthClient } from "./client";
import type { AuthStorage } from "./store";

function session(expiresAt = Math.floor(Date.now() / 1000) + 3600): Session {
  return {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: "bearer",
    user: {
      id: "user-1",
      aud: "authenticated",
      role: "authenticated",
      email: "user@example.com",
      created_at: "2026-07-27T00:00:00.000Z",
      app_metadata: { provider: "github" },
      user_metadata: { name: "User" },
    },
  } as Session;
}

function createFixture(options: {
  initialSession?: Session | null;
  refreshError?: AuthError | null;
} = {}) {
  const opened: string[] = [];
  let oauthCalls = 0;
  let signedOut = 0;
  const auth = {
    getSession: async () => ({ data: { session: options.initialSession ?? null }, error: null }),
    setSession: async () => ({ data: { session: null, user: null }, error: null }),
    signInWithOAuth: async () => {
      oauthCalls += 1;
      return { data: { provider: "github", url: "https://auth.example/authorize" }, error: null };
    },
    exchangeCodeForSession: async () => ({ data: { session: session(), user: session().user }, error: null }),
    refreshSession: async () => options.refreshError
      ? { data: { session: null, user: null }, error: options.refreshError }
      : { data: { session: session(), user: session().user }, error: null },
    signOut: async () => {
      signedOut += 1;
      return { error: null };
    },
  };
  const values = new Map<string, string>();
  const storage: AuthStorage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  const client = new AuthClient({
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "anon",
    storage,
    client: { auth } as unknown as SupabaseClient,
    onOpenExternalUrl: async (url) => { opened.push(url); },
  });
  return {
    client,
    opened,
    get oauthCalls() { return oauthCalls; },
    get signedOut() { return signedOut; },
  };
}

describe("AuthClient OAuth lifecycle", () => {
  it("reopens one pending OAuth request without replacing its PKCE flow", async () => {
    const fixture = createFixture();
    await fixture.client.init();
    await fixture.client.startGitHubSignIn();
    await fixture.client.startGitHubSignIn();
    assert.equal(fixture.oauthCalls, 1);
    assert.deepEqual(fixture.opened, ["https://auth.example/authorize", "https://auth.example/authorize"]);
    assert.equal(fixture.client.getState().status, "authenticating");
    assert.equal(fixture.client.getState().pendingProvider, "github");

    await fixture.client.handleAuthCallback("codexthemes://auth/callback?code=valid");
    assert.equal(fixture.client.getState().status, "authenticated");
    await fixture.client.signOut();
  });

  it("turns an OAuth cancellation into a retryable error", async () => {
    const fixture = createFixture();
    await fixture.client.init();
    await fixture.client.startGoogleSignIn();
    await fixture.client.handleAuthCallback("codexthemes://auth/callback?error=access_denied");
    assert.equal(fixture.client.getState().status, "error");
    assert.equal(fixture.client.getState().pendingProvider, null);
    assert.match(fixture.client.getState().error ?? "", /已取消/);
  });
});

describe("AuthClient refresh behavior", () => {
  it("keeps the session on a temporary refresh failure", async () => {
    const temporary = Object.assign(new Error("fetch failed"), { status: 0 }) as AuthError;
    const fixture = createFixture({
      initialSession: session(Math.floor(Date.now() / 1000) - 1),
      refreshError: temporary,
    });
    await fixture.client.init();
    assert.equal(await fixture.client.getAccessToken(), "access");
    assert.equal(fixture.client.getState().status, "authenticated");
    assert.match(fixture.client.getState().error ?? "", /网络暂不可用/);
    await fixture.client.signOut();
  });

  it("clears a definitively invalid refresh session", async () => {
    const permanent = Object.assign(new Error("Invalid Refresh Token"), { status: 400 }) as AuthError;
    const fixture = createFixture({
      initialSession: session(Math.floor(Date.now() / 1000) - 1),
      refreshError: permanent,
    });
    await fixture.client.init();
    assert.equal(await fixture.client.getAccessToken(), null);
    assert.equal(fixture.client.getState().status, "unauthenticated");
    assert.equal(fixture.signedOut, 1);
  });
});
