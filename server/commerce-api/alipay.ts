import fs from "node:fs";
import path from "node:path";
import { AlipaySdk } from "alipay-sdk";

const SANDBOX_GATEWAY = "https://openapi-sandbox.dl.alipaydev.com/gateway.do";
const PRODUCTION_GATEWAY = "https://openapi.alipay.com/gateway.do";

interface SandboxFile {
  appIds?: Array<{
    appId?: string;
    appPrivatePkcsKey?: string;
    alipayPublicKey?: string;
    pid?: string;
  }>;
  sandboxAccounts?: {
    partner?: {
      userId?: string;
      email?: string;
    };
  };
}

export interface AlipayRuntimeConfig {
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  sellerId: string | null;
  sellerEmail: string | null;
  gateway: string;
  sandbox: boolean;
}

export interface AlipayOrder {
  outTradeNo: string;
  totalAmount: string;
  subject: string;
}

export interface AlipayApiResult {
  code: string;
  msg?: string;
  sub_code?: string;
  sub_msg?: string;
  [key: string]: unknown;
}

let cachedConfig: AlipayRuntimeConfig | null = null;
let cachedSdk: AlipaySdk | null = null;

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing Alipay configuration: ${label}`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sandboxConfigPath(): string {
  const configured = process.env.ALIPAY_SANDBOX_CONFIG_PATH?.trim();
  return configured || path.join(process.cwd(), ".alipay-sandbox.json");
}

function readSandboxConfig(configPath: string): AlipayRuntimeConfig {
  const document = JSON.parse(fs.readFileSync(configPath, "utf8")) as SandboxFile;
  const app = document.appIds?.[0];
  const seller = document.sandboxAccounts?.partner;
  return {
    appId: requireText(app?.appId, "appIds[0].appId"),
    privateKey: requireText(app?.appPrivatePkcsKey, "appIds[0].appPrivatePkcsKey"),
    alipayPublicKey: requireText(app?.alipayPublicKey, "appIds[0].alipayPublicKey"),
    sellerId: optionalText(app?.pid) ?? optionalText(seller?.userId),
    sellerEmail: optionalText(seller?.email),
    gateway: SANDBOX_GATEWAY,
    sandbox: true,
  };
}

function readProductionConfig(): AlipayRuntimeConfig {
  return {
    appId: requireText(process.env.ALIPAY_APP_ID, "ALIPAY_APP_ID"),
    privateKey: requireText(process.env.ALIPAY_PRIVATE_KEY, "ALIPAY_PRIVATE_KEY"),
    alipayPublicKey: requireText(process.env.ALIPAY_PUBLIC_KEY, "ALIPAY_PUBLIC_KEY"),
    sellerId: optionalText(process.env.ALIPAY_SELLER_ID),
    sellerEmail: optionalText(process.env.ALIPAY_SELLER_EMAIL),
    gateway: optionalText(process.env.ALIPAY_GATEWAY) ?? PRODUCTION_GATEWAY,
    sandbox: false,
  };
}

/**
 * Local sandbox development reads the verified .alipay-sandbox.json directly.
 * Production falls back to server-only environment variables.
 */
export function getAlipayRuntimeConfig(): AlipayRuntimeConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = sandboxConfigPath();
  const vercelEnvironment = optionalText(process.env.VERCEL_ENV);
  const isHostedVercelDeployment =
    vercelEnvironment === "production" || vercelEnvironment === "preview";

  // Never let a developer's local sandbox file override secrets configured for
  // a hosted Vercel deployment. Local sandbox development remains available in
  // normal processes and `vercel dev` (`VERCEL_ENV=development`).
  cachedConfig =
    !isHostedVercelDeployment && fs.existsSync(configPath)
      ? readSandboxConfig(configPath)
      : readProductionConfig();
  return cachedConfig;
}

export function getAlipaySdk(): AlipaySdk {
  if (cachedSdk) return cachedSdk;
  const config = getAlipayRuntimeConfig();
  cachedSdk = new AlipaySdk({
    appId: config.appId,
    privateKey: config.privateKey,
    alipayPublicKey: config.alipayPublicKey,
    gateway: config.gateway,
    signType: "RSA2",
    keyType: "PKCS1",
    camelcase: false,
  } as ConstructorParameters<typeof AlipaySdk>[0]);
  return cachedSdk;
}

function commerceBaseUrl(): URL {
  const parsed = new URL(requireText(process.env.COMMERCE_API_URL, "COMMERCE_API_URL"));
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new Error("COMMERCE_API_URL must use HTTPS, except for localhost development.");
  }
  return parsed;
}

function callbackUrl(pathname: string): string {
  return new URL(pathname, commerceBaseUrl()).toString();
}

function shouldAttachNotifyUrl(): boolean {
  if (process.env.ALIPAY_NOTIFY_ENABLED?.trim().toLowerCase() === "false") return false;
  const explicit = optionalText(process.env.ALIPAY_NOTIFY_URL);
  if (explicit) return true;
  const base = commerceBaseUrl();
  return base.protocol === "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1";
}

export function createAlipayOrder(order: AlipayOrder): { form: string } {
  const requestOptions: Record<string, unknown> = {
    returnUrl: optionalText(process.env.ALIPAY_RETURN_URL) ?? callbackUrl("/api/v1/alipay/return"),
    bizContent: {
      out_trade_no: order.outTradeNo,
      total_amount: normalizeYuan(order.totalAmount),
      subject: order.subject.slice(0, 256),
      product_code: "FAST_INSTANT_TRADE_PAY",
      timeout_express: "30m",
    },
  };

  if (shouldAttachNotifyUrl()) {
    requestOptions.notifyUrl =
      optionalText(process.env.ALIPAY_NOTIFY_URL) ?? callbackUrl("/api/v1/alipay/notify");
  }

  const sdk = getAlipaySdk() as AlipaySdk & {
    pageExec(method: string, httpMethod: string, options: Record<string, unknown>): string;
  };
  const form = sdk.pageExec(
    "alipay.trade.page.pay",
    "POST",
    requestOptions,
  );
  return { form };
}

export async function queryAlipayOrder(
  outTradeNo: string,
): Promise<{ tradeStatus: string | null; tradeNo: string | null; result: AlipayApiResult }> {
  const result = (await getAlipaySdk().exec("alipay.trade.query", {
    bizContent: { out_trade_no: outTradeNo },
  })) as AlipayApiResult;
  return {
    tradeStatus: result.code === "10000" ? optionalText(result.trade_status) : null,
    tradeNo: result.code === "10000" ? optionalText(result.trade_no) : null,
    result,
  };
}

export async function closeAlipayOrder(outTradeNo: string): Promise<AlipayApiResult> {
  return (await getAlipaySdk().exec("alipay.trade.close", {
    bizContent: { out_trade_no: outTradeNo },
  })) as AlipayApiResult;
}

export async function refundAlipayOrder(input: {
  outTradeNo: string;
  refundAmount: string;
  outRequestNo: string;
  reason?: string;
}): Promise<AlipayApiResult> {
  return (await getAlipaySdk().exec("alipay.trade.refund", {
    bizContent: {
      out_trade_no: input.outTradeNo,
      refund_amount: normalizeYuan(input.refundAmount),
      out_request_no: input.outRequestNo,
      ...(input.reason ? { refund_reason: input.reason.slice(0, 256) } : {}),
    },
  })) as AlipayApiResult;
}

export async function queryAlipayRefund(input: {
  outTradeNo: string;
  outRequestNo: string;
}): Promise<AlipayApiResult> {
  return (await getAlipaySdk().exec("alipay.trade.fastpay.refund.query", {
    bizContent: {
      out_trade_no: input.outTradeNo,
      out_request_no: input.outRequestNo,
    },
  })) as AlipayApiResult;
}

export function verifyAlipayParams(body: Record<string, unknown>): boolean {
  const sdk = getAlipaySdk() as AlipaySdk & {
    checkNotifySignV2(params: Record<string, unknown>): boolean;
  };
  return sdk.checkNotifySignV2(body);
}

export function expectedSellerMatches(body: Record<string, unknown>): boolean {
  const config = getAlipayRuntimeConfig();
  const sellerId = optionalText(body.seller_id);
  const sellerEmail = optionalText(body.seller_email);
  return Boolean(
    (config.sellerId && sellerId === config.sellerId)
      || (config.sellerEmail && sellerEmail === config.sellerEmail),
  );
}

export function isPaidTradeNotification(body: Record<string, unknown>): boolean {
  const status = optionalText(body.trade_status);
  const isPaid = status === "TRADE_SUCCESS" || status === "TRADE_FINISHED";
  return isPaid && !body.out_biz_no && !body.gmt_refund && !body.refund_fee;
}

export function normalizeYuan(value: unknown): string {
  if (value == null) throw new Error("Invalid payment amount.");
  const text = String(value).trim();
  const match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("Invalid payment amount.");
  return `${BigInt(match[1]).toString()}.${(match[2] ?? "").padEnd(2, "0")}`;
}

export function formatYuan(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("Invalid price in cents.");
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function resetAlipayConfigForTests(): void {
  cachedConfig = null;
  cachedSdk = null;
}
