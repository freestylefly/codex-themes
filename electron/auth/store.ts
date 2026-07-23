/**
 * Secure token store: session tokens live only in the main process and are
 * encrypted with macOS safeStorage (or the platform equivalent). The encrypted
 * blob is written to userData/auth-tokens.enc so it survives restarts, but it
 * can only be decrypted by this app installation.
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
