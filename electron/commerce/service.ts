/**
 * Commerce service: calls the remote Vercel API on behalf of the logged-in
 * user and downloads/installs purchased themes. Tokens are taken from
 * AuthClient.getAccessToken() and never exposed to the renderer.
 */

import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type {
  PurchaseOrder,
  ThemeEntitlement,
  ThemeProduct,
} from "../shared/types";
import type { AuthClient } from "../auth/client";
import type { ThemeStore } from "../themes/store";

export interface CommerceServiceOptions {
  apiBaseUrl: string;
  authClient: AuthClient;
  store: ThemeStore;
  purchasedThemesRoot: string;
  /** Called with the Alipay checkout URL after an order is created. */
  onOpenCheckoutUrl(url: string): void;
}

export class CommerceService extends EventEmitter {
  private apiBaseUrl: string;
  private authClient: AuthClient;
  private store: ThemeStore;
  private purchasedThemesRoot: string;
  private onOpenCheckoutUrl: (url: string) => void;

  constructor(opts: CommerceServiceOptions) {
    super();
    this.apiBaseUrl = opts.apiBaseUrl.replace(/\/$/, "");
    this.authClient = opts.authClient;
    this.store = opts.store;
    this.purchasedThemesRoot = opts.purchasedThemesRoot;
    this.onOpenCheckoutUrl = opts.onOpenCheckoutUrl;
  }

  private async request(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const token = await this.authClient.getAccessToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
    return fetch(input, { ...init, headers });
  }

  async listCatalog(): Promise<ThemeProduct[]> {
    const response = await this.request(`${this.apiBaseUrl}/api/v1/catalog`);
    if (!response.ok) throw new Error(`无法加载主题目录 (${response.status})`);
    return (await response.json()) as ThemeProduct[];
  }

  async createOrder(themeId: string): Promise<PurchaseOrder> {
    const idempotencyKey = crypto.randomUUID();
    const response = await this.request(`${this.apiBaseUrl}/api/v1/orders`, {
      method: "POST",
      body: JSON.stringify({ themeId, idempotencyKey }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`创建订单失败 (${response.status}): ${body}`);
    }
    const order = (await response.json()) as PurchaseOrder;
    if (order.checkoutUrl) {
      this.onOpenCheckoutUrl(order.checkoutUrl);
    }
    return order;
  }

  async getOrder(orderId: string): Promise<PurchaseOrder> {
    const response = await this.request(`${this.apiBaseUrl}/api/v1/orders/${encodeURIComponent(orderId)}`);
    if (!response.ok) throw new Error(`无法获取订单 (${response.status})`);
    return (await response.json()) as PurchaseOrder;
  }

  async reconcileOrder(orderId: string): Promise<PurchaseOrder> {
    const response = await this.request(
      `${this.apiBaseUrl}/api/v1/orders/${encodeURIComponent(orderId)}/reconcile`,
      { method: "POST" },
    );
    if (!response.ok) throw new Error(`对账失败 (${response.status})`);
    const order = (await response.json()) as PurchaseOrder;
    this.emit("orderChanged", order);
    return order;
  }

  async listEntitlements(): Promise<ThemeEntitlement[]> {
    const response = await this.request(`${this.apiBaseUrl}/api/v1/me/entitlements`);
    if (!response.ok) throw new Error(`无法获取授权 (${response.status})`);
    return (await response.json()) as ThemeEntitlement[];
  }

  async downloadTheme(themeId: string): Promise<{ ok: boolean; error?: string; filePath?: string }> {
    try {
      const response = await this.request(
        `${this.apiBaseUrl}/api/v1/themes/${encodeURIComponent(themeId)}/download`,
        { method: "POST" },
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`无法获取下载地址 (${response.status}): ${body}`);
      }
      const { signedUrl } = (await response.json()) as { signedUrl: string };
      if (!signedUrl) throw new Error("服务器未返回下载地址。");

      const packageResponse = await fetch(signedUrl);
      if (!packageResponse.ok) throw new Error("下载主题包失败。");
      const buffer = Buffer.from(await packageResponse.arrayBuffer());

      await fs.mkdir(this.purchasedThemesRoot, { recursive: true, mode: 0o700 });
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-purchase-"));
      const tempFile = path.join(tempDir, `${themeId}.codextheme`);
      await fs.writeFile(tempFile, buffer, { mode: 0o600 });

      const inspected = await this.store.inspectThemePackage(tempFile);
      if (!inspected.canImport) throw new Error("主题包未通过安全检查。");
      if (inspected.summary.id !== themeId) throw new Error("主题包标识与购买主题不一致。");

      const targetDir = path.join(this.purchasedThemesRoot, themeId);
      await fs.rm(targetDir, { recursive: true, force: true });
      await fs.mkdir(targetDir, { recursive: true, mode: 0o700 });
      const installed = await this.store.importInspectedTheme(inspected, { targetSource: "purchased" });

      await fs.rm(tempDir, { recursive: true, force: true });
      return { ok: true, filePath: installed.dir };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}
