import { AlipaySdk } from "alipay-sdk";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const alipay = new AlipaySdk({
  appId: requireEnv("ALIPAY_APP_ID"),
  privateKey: requireEnv("ALIPAY_PRIVATE_KEY"),
  alipayPublicKey: requireEnv("ALIPAY_PUBLIC_KEY"),
  gateway: process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com/gateway.do",
  signType: "RSA2",
});

export interface AlipayOrder {
  outTradeNo: string;
  totalAmount: string; // yuan, two decimals
  subject: string;
}

export async function createAlipayOrder(order: AlipayOrder): Promise<{ form: string }> {
  const form = alipay.pageExecute("alipay.trade.page.pay", "GET", {
    notify_url: `${requireEnv("COMMERCE_API_URL")}/api/v1/alipay/notify`,
    return_url: `${requireEnv("COMMERCE_API_URL")}/api/v1/alipay/return`,
    biz_content: {
      out_trade_no: order.outTradeNo,
      total_amount: order.totalAmount,
      subject: order.subject,
      product_code: "FAST_INSTANT_TRADE_PAY",
    },
  }) as unknown as string;
  return { form };
}

export async function createAlipayWapOrder(order: AlipayOrder): Promise<{ form: string }> {
  const form = alipay.pageExecute("alipay.trade.wap.pay", "GET", {
    notify_url: `${requireEnv("COMMERCE_API_URL")}/api/v1/alipay/notify`,
    return_url: `${requireEnv("COMMERCE_API_URL")}/api/v1/alipay/return`,
    biz_content: {
      out_trade_no: order.outTradeNo,
      total_amount: order.totalAmount,
      subject: order.subject,
      product_code: "QUICK_WAP_WAY",
    },
  }) as unknown as string;
  return { form };
}

export async function queryAlipayOrder(outTradeNo: string): Promise<{ tradeStatus: string | null; tradeNo: string | null }> {
  const result = await alipay.exec("alipay.trade.query", {
    biz_content: {
      out_trade_no: outTradeNo,
    },
  });
  const typed = result as unknown as {
    code: string;
    trade_status?: string;
    trade_no?: string;
  };
  if (typed.code !== "10000") return { tradeStatus: null, tradeNo: null };
  return { tradeStatus: typed.trade_status ?? null, tradeNo: typed.trade_no ?? null };
}

export function verifyAlipayNotify(body: Record<string, unknown>): boolean {
  return alipay.checkNotifySign(body);
}

export function formatYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}
