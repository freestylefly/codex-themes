/**
 * [INPUT]: 依赖 Electron safeStorage、用户数据目录与 Node 文件系统
 * [OUTPUT]: 提供 Supabase SupportedStorage 兼容的加密键值存储和旧令牌只读迁移器
 * [POS]: electron/auth 的本地安全 Adapter，会话与 PKCE verifier 不离开主进程明文内存
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { safeStorage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { AuthProvider } from "../shared/types";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp when the access token expires. */
  expiresAt: string | null;
  /** Provider used to sign in. */
  provider: AuthProvider;
}

export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class EncryptedAuthStorage implements AuthStorage {
  private readonly file: string;
  private cache: Record<string, string> | null = null;
  private mutation: Promise<void> = Promise.resolve();

  constructor(userDataRoot: string) {
    this.file = path.join(userDataRoot, "auth-storage.enc");
  }

  async getItem(key: string): Promise<string | null> {
    await this.mutation;
    const values = await this.load();
    return Object.hasOwn(values, key) ? values[key] : null;
  }

  setItem(key: string, value: string): Promise<void> {
    return this.mutate((values) => {
      values[key] = value;
    });
  }

  removeItem(key: string): Promise<void> {
    return this.mutate((values) => {
      delete values[key];
    });
  }

  private mutate(update: (values: Record<string, string>) => void): Promise<void> {
    const operation = this.mutation.then(async () => {
      const values = await this.load();
      update(values);
      await this.save(values);
    });
    this.mutation = operation.catch(() => {});
    return operation;
  }

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    try {
      const encrypted = await fs.readFile(this.file);
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("当前系统不支持安全存储,无法读取登录凭据。");
      }
      const parsed: unknown = JSON.parse(safeStorage.decryptString(encrypted));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      this.cache = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.cache = {};
    }
    return this.cache ?? {};
  }

  private async save(values: Record<string, string>): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("当前系统不支持安全存储,无法保存登录凭据。");
    }
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.file, safeStorage.encryptString(JSON.stringify(values)), { mode: 0o600 });
    this.cache = values;
  }
}

/** 仅用于从 0.2.9 及更早版本迁移 auth-tokens.enc。 */
export class AuthTokenStore {
  private file: string;

  constructor(userDataRoot: string) {
    this.file = path.join(userDataRoot, "auth-tokens.enc");
  }

  async save(tokens: StoredTokens): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("当前系统不支持安全存储,无法保存登录凭据。");
    }
    const payload = Buffer.from(JSON.stringify(tokens), "utf8");
    const encrypted = safeStorage.encryptString(payload.toString("base64"));
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.file, encrypted, { mode: 0o600 });
  }

  async load(): Promise<StoredTokens | null> {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const encrypted = await fs.readFile(this.file);
      const decrypted = safeStorage.decryptString(encrypted);
      const parsed = JSON.parse(Buffer.from(decrypted, "base64").toString("utf8"));
      if (
        typeof parsed?.accessToken === "string" &&
        typeof parsed?.refreshToken === "string"
      ) {
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : null,
          provider:
            parsed.provider === "google"
              ? "google"
              : parsed.provider === "github"
                ? "github"
                : "email",
        };
      }
    } catch {
      // Missing, corrupt, or unreadable tokens are treated as logged-out.
    }
    return null;
  }

  async clear(): Promise<void> {
    await fs.rm(this.file, { force: true });
  }
}
