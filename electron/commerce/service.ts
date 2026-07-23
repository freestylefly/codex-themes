/**
 * Privileged commerce client. Auth tokens, signed upload tokens, private
 * storage paths, package bytes and filesystem paths never cross to Renderer.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AdminOverview,
  CreatorProfile,
  PointLedgerEntry,
  PointOrder,
  PointPack,
  PointWallet,
  PurchaseOrder,
  SubmitThemeInput,
  ThemeEntitlement,
  ThemeProduct,
  ThemeSubmission,
  ThemeSubmissionStatus,
} from "../shared/types";
import type { AuthClient } from "../auth/client";
import type { ThemeStore } from "../themes/store";

export interface CommerceServiceOptions {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  authClient: AuthClient;
  store: ThemeStore;
  purchasedThemesRoot: string;
  onOpenCheckoutUrl(url: string): void;
}

interface SubmissionUpload {
  submission: ThemeSubmission;
  upload: { bucket: string; path: string; token: string };
}

const API_REQUEST_TIMEOUT_MS = 30_000;
const FINALIZE_REQUEST_TIMEOUT_MS = 75_000;
const STORAGE_UPLOAD_TIMEOUT_MS = 120_000;

export class CommerceService extends EventEmitter {
  private apiBaseUrl: string;
  private authClient: AuthClient;
  private store: ThemeStore;
  private purchasedThemesRoot: string;
  private onOpenCheckoutUrl: (url: string) => void;
  private storageClient: SupabaseClient;

  constructor(opts: CommerceServiceOptions) {
    super();
    this.apiBaseUrl = opts.apiBaseUrl.replace(/\/$/, "");
    this.authClient = opts.authClient;
    this.store = opts.store;
    this.purchasedThemesRoot = opts.purchasedThemesRoot;
    this.onOpenCheckoutUrl = opts.onOpenCheckoutUrl;
    this.storageClient = createClient(opts.supabaseUrl, opts.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) =>
          this.fetchWithTimeout(
            input,
            init,
            STORAGE_UPLOAD_TIMEOUT_MS,
            "主题包上传超时，请检查网络后重试。",
          ),
      },
    });
  }

  private async fetchWithTimeout(
    input: string | URL | Request,
    init: RequestInit | undefined,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    const relayAbort = () => controller.abort(upstreamSignal?.reason);
    if (upstreamSignal?.aborted) relayAbort();
    else upstreamSignal?.addEventListener("abort", relayAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted && !upstreamSignal?.aborted) {
        throw new Error(timeoutMessage);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener("abort", relayAbort);
    }
  }

  private async request(
    input: string | URL | Request,
    init?: RequestInit,
    timeoutMs = API_REQUEST_TIMEOUT_MS,
  ): Promise<Response> {
    const token = await this.authClient.getAccessToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
    return this.fetchWithTimeout(
      input,
      { ...init, headers },
      timeoutMs,
      "服务器响应超时，请稍后重试。",
    );
  }

  private async json<T>(
    pathname: string,
    init?: RequestInit,
    timeoutMs = API_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const response = await this.request(`${this.apiBaseUrl}${pathname}`, init, timeoutMs);
    if (!response.ok) {
      let message = `请求失败 (${response.status})`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // Preserve the status-only message for non-JSON upstream failures.
      }
      if (response.headers.get("x-vercel-error") === "FUNCTION_INVOCATION_FAILED") {
        message = "自动校验服务启动失败，请稍后重新校验。";
      }
      throw new Error(message);
    }
    return (await response.json()) as T;
  }

  async listCatalog(): Promise<ThemeProduct[]> {
    return this.json<ThemeProduct[]>("/api/v1/catalog");
  }

  /** Legacy orders remain queryable for historical purchases. */
  async createOrder(themeId: string): Promise<PurchaseOrder> {
    const order = await this.json<PurchaseOrder>("/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ themeId, idempotencyKey: crypto.randomUUID() }),
    });
    if (order.checkoutUrl) this.onOpenCheckoutUrl(order.checkoutUrl);
    return order;
  }

  async getOrder(orderId: string): Promise<PurchaseOrder> {
    return this.json<PurchaseOrder>(`/api/v1/orders/${encodeURIComponent(orderId)}`);
  }

  async reconcileOrder(orderId: string): Promise<PurchaseOrder> {
    const order = await this.json<PurchaseOrder>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/reconcile`,
      { method: "POST" },
    );
    this.emit("orderChanged", order);
    return order;
  }

  async listEntitlements(): Promise<ThemeEntitlement[]> {
    return this.json<ThemeEntitlement[]>("/api/v1/me/entitlements");
  }

  async unlockTheme(themeId: string): Promise<ThemeEntitlement> {
    const result = await this.json<{
      themeId: string;
      version: string;
      status: "active";
      acquisitionType: ThemeEntitlement["acquisitionType"];
      pointsSpent: number;
      creatorRewardPoints: number;
    }>(`/api/v1/themes/${encodeURIComponent(themeId)}/unlock`, { method: "POST" });
    const product = (await this.listCatalog()).find((item) => item.id === themeId);
    return {
      ...result,
      themeName: product?.name ?? themeId,
      createdAt: new Date().toISOString(),
    };
  }

  async getProfile(): Promise<CreatorProfile> {
    return this.json<CreatorProfile>("/api/v1/me/profile");
  }

  async updateProfile(input: { handle: string; displayName: string }): Promise<CreatorProfile> {
    return this.json<CreatorProfile>("/api/v1/me/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async uploadAvatar(bytes: Uint8Array): Promise<CreatorProfile> {
    if (bytes.byteLength < 1 || bytes.byteLength > 3 * 1024 * 1024) {
      throw new Error("处理后的头像必须非空且不超过 3 MB。");
    }
    return this.json<CreatorProfile>("/api/v1/me/avatar", {
      method: "POST",
      body: JSON.stringify({
        imageBase64: Buffer.from(bytes).toString("base64"),
      }),
    });
  }

  async getWallet(): Promise<PointWallet> {
    return this.json<PointWallet>("/api/v1/me/wallet");
  }

  async listPointPacks(): Promise<PointPack[]> {
    return this.json<PointPack[]>("/api/v1/point-packs");
  }

  async listPointLedger(): Promise<PointLedgerEntry[]> {
    return this.json<PointLedgerEntry[]>("/api/v1/me/point-ledger");
  }

  async createPointOrder(packId: string): Promise<PointOrder> {
    const order = await this.json<PointOrder>("/api/v1/point-orders", {
      method: "POST",
      body: JSON.stringify({ packId, idempotencyKey: crypto.randomUUID() }),
    });
    if (order.checkoutUrl) this.onOpenCheckoutUrl(order.checkoutUrl);
    return order;
  }

  async getPointOrder(orderId: string): Promise<PointOrder> {
    return this.json<PointOrder>(`/api/v1/point-orders/${encodeURIComponent(orderId)}`);
  }

  async reconcilePointOrder(orderId: string): Promise<PointOrder> {
    const order = await this.json<PointOrder>(
      `/api/v1/point-orders/${encodeURIComponent(orderId)}/reconcile`,
      { method: "POST" },
    );
    this.emit("pointOrderChanged", order);
    return order;
  }

  async listSubmissions(): Promise<ThemeSubmission[]> {
    return this.json<ThemeSubmission[]>("/api/v1/submissions");
  }

  async submitTheme(input: SubmitThemeInput): Promise<ThemeSubmission> {
    const themes = await this.store.listThemes();
    const local = themes.find((theme) => theme.id === input.localThemeId);
    if (!local || local.source !== "custom") {
      throw new Error("仅本地自定义主题和 AI 工作室保存的作品可以投稿。");
    }
    if (input.rightsAccepted !== true) throw new Error("投稿前必须确认内容分发权。");

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-submission-"));
    const packagePath = path.join(tempDir, `${local.id}.codextheme`);
    let inspectionDir: string | null = null;
    try {
      await this.store.exportThemePackage(local.id, packagePath);
      const inspected = await this.store.inspectThemePackage(packagePath);
      inspectionDir = inspected.tempDir;
      if (!inspected.canImport) throw new Error("主题包未通过本地安全检查。");

      const created = await this.json<SubmissionUpload>("/api/v1/submissions", {
        method: "POST",
        body: JSON.stringify({
          themeId: input.themeId,
          sourceKind: input.sourceKind,
          proposedPricePoints: input.proposedPricePoints,
          rightsAccepted: true,
          name: local.name,
          tagline: local.tagline,
          description: local.description,
          layout: local.layout,
          minEngineVersion: local.minEngineVersion,
        }),
      });
      const bytes = await fs.readFile(packagePath);
      const upload = await this.storageClient.storage
        .from(created.upload.bucket)
        .uploadToSignedUrl(created.upload.path, created.upload.token, bytes, {
          contentType: "application/zip",
        });
      if (upload.error) throw new Error(`上传主题包失败：${upload.error.message}`);

      try {
        return await this.json<ThemeSubmission>(
          `/api/v1/submissions/${encodeURIComponent(created.submission.id)}/finalize`,
          { method: "POST" },
          FINALIZE_REQUEST_TIMEOUT_MS,
        );
      } catch (error) {
        await this.json<ThemeSubmission>(
          `/api/v1/submissions/${encodeURIComponent(created.submission.id)}/fail`,
          { method: "POST" },
        ).catch(() => {});
        throw error;
      }
    } finally {
      if (inspectionDir) await this.store.discardInspection(inspectionDir).catch(() => {});
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async retrySubmission(submissionId: string): Promise<ThemeSubmission> {
    return this.json<ThemeSubmission>(
      `/api/v1/submissions/${encodeURIComponent(submissionId)}/finalize`,
      { method: "POST" },
      FINALIZE_REQUEST_TIMEOUT_MS,
    );
  }

  async withdrawSubmission(submissionId: string): Promise<ThemeSubmission> {
    return this.json<ThemeSubmission>(
      `/api/v1/submissions/${encodeURIComponent(submissionId)}/withdraw`,
      { method: "POST" },
    );
  }

  async unpublishOwnTheme(themeId: string, reason: string): Promise<{ ok: boolean }> {
    return this.json<{ ok: boolean }>(
      `/api/v1/me/themes/${encodeURIComponent(themeId)}/state`,
      { method: "POST", body: JSON.stringify({ action: "unpublish", reason }) },
    );
  }

  async adminListSubmissions(status: ThemeSubmissionStatus = "pending"): Promise<ThemeSubmission[]> {
    return this.json<ThemeSubmission[]>(
      `/api/v1/admin/submissions?status=${encodeURIComponent(status)}`,
    );
  }

  async adminReviewSubmission(
    submissionId: string,
    input: { action: "approve" | "reject"; pricePoints?: number; reason: string },
  ): Promise<ThemeSubmission> {
    return this.json<ThemeSubmission>(
      `/api/v1/admin/submissions/${encodeURIComponent(submissionId)}/review`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  async adminGetOverview(): Promise<AdminOverview> {
    return this.json<AdminOverview>("/api/v1/admin/overview");
  }

  async adminAdjustPoints(input: {
    userId: string;
    delta: number;
    reason: string;
  }): Promise<PointWallet> {
    return this.json<PointWallet>("/api/v1/admin/points/adjust", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async adminSetThemeState(
    themeId: string,
    input: {
      action: "unpublish" | "republish" | "suspend_downloads" | "restore_downloads";
      reason: string;
    },
  ): Promise<{ ok: boolean }> {
    return this.json<{ ok: boolean }>(
      `/api/v1/admin/themes/${encodeURIComponent(themeId)}/state`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  async adminReconcilePointOrder(orderId: string): Promise<PointOrder> {
    return this.json<PointOrder>(
      `/api/v1/admin/point-orders/${encodeURIComponent(orderId)}/reconcile`,
      { method: "POST" },
    );
  }

  async adminRefundPointOrder(orderId: string, reason: string): Promise<PointOrder> {
    return this.json<PointOrder>(
      `/api/v1/admin/point-orders/${encodeURIComponent(orderId)}/refund`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
  }

  async adminReconcileThemeOrder(orderId: string): Promise<PurchaseOrder> {
    return this.json<PurchaseOrder>(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/reconcile`,
      { method: "POST" },
    );
  }

  async adminRefundThemeOrder(orderId: string, reason: string): Promise<PurchaseOrder> {
    return this.json<PurchaseOrder>(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/refund`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
  }

  async downloadTheme(themeId: string): Promise<{ ok: boolean; error?: string; filePath?: string }> {
    let tempDir: string | null = null;
    let inspectionDir: string | null = null;
    try {
      const { signedUrl, sha256 } = await this.json<{ signedUrl: string; sha256: string }>(
        `/api/v1/themes/${encodeURIComponent(themeId)}/download`,
        { method: "POST" },
      );
      const packageResponse = await fetch(signedUrl);
      if (!packageResponse.ok) throw new Error("下载主题包失败。");
      const buffer = Buffer.from(await packageResponse.arrayBuffer());
      const actualSha = crypto.createHash("sha256").update(buffer).digest("hex");
      if (
        !/^[a-f0-9]{64}$/i.test(sha256)
        || !crypto.timingSafeEqual(Buffer.from(actualSha, "hex"), Buffer.from(sha256, "hex"))
      ) {
        throw new Error("主题包完整性校验失败。");
      }

      await fs.mkdir(this.purchasedThemesRoot, { recursive: true, mode: 0o700 });
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-purchase-"));
      const tempFile = path.join(tempDir, `${themeId}.codextheme`);
      await fs.writeFile(tempFile, buffer, { mode: 0o600 });

      const inspected = await this.store.inspectThemePackage(tempFile);
      inspectionDir = inspected.tempDir;
      if (!inspected.canImport) throw new Error("主题包未通过安全检查。");
      if (inspected.summary.id !== themeId) throw new Error("主题包标识与解锁主题不一致。");

      const installed = await this.store.importInspectedTheme(inspected, {
        targetSource: "purchased",
      });
      inspectionDir = null; // importInspectedTheme consumes/removes the inspection directory.
      return { ok: true, filePath: installed.dir };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    } finally {
      if (inspectionDir) await this.store.discardInspection(inspectionDir).catch(() => {});
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
