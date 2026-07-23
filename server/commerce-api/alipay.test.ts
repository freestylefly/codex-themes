import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  formatYuan,
  getAlipayRuntimeConfig,
  isPaidTradeNotification,
  normalizeYuan,
  resetAlipayConfigForTests,
} from "./alipay.js";

test("normalizes yuan amounts without floating-point comparison", () => {
  assert.equal(normalizeYuan("88"), "88.00");
  assert.equal(normalizeYuan("088.8"), "88.80");
  assert.equal(normalizeYuan("0.09"), "0.09");
  assert.throws(() => normalizeYuan("8.888"));
  assert.throws(() => normalizeYuan("-1.00"));
});

test("formats integer cents as yuan", () => {
  assert.equal(formatYuan(0), "0.00");
  assert.equal(formatYuan(9), "0.09");
  assert.equal(formatYuan(12345), "123.45");
  assert.throws(() => formatYuan(1.5));
});

test("accepts only paid trade notifications and excludes refund markers", () => {
  assert.equal(isPaidTradeNotification({ trade_status: "TRADE_SUCCESS" }), true);
  assert.equal(isPaidTradeNotification({ trade_status: "TRADE_FINISHED" }), true);
  assert.equal(
    isPaidTradeNotification({ trade_status: "TRADE_SUCCESS", refund_fee: "1.00" }),
    false,
  );
  assert.equal(
    isPaidTradeNotification({ trade_status: "TRADE_SUCCESS", gmt_refund: "2026-07-23" }),
    false,
  );
  assert.equal(isPaidTradeNotification({ trade_status: "WAIT_BUYER_PAY" }), false);
});

test("hosted Vercel deployments ignore a local sandbox file", (t) => {
  const originalEnvironment = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    ALIPAY_SANDBOX_CONFIG_PATH: process.env.ALIPAY_SANDBOX_CONFIG_PATH,
    ALIPAY_APP_ID: process.env.ALIPAY_APP_ID,
    ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY,
    ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY,
    ALIPAY_SELLER_ID: process.env.ALIPAY_SELLER_ID,
    ALIPAY_SELLER_EMAIL: process.env.ALIPAY_SELLER_EMAIL,
    ALIPAY_GATEWAY: process.env.ALIPAY_GATEWAY,
  };
  const sandboxDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-themes-alipay-"));
  const sandboxPath = path.join(sandboxDirectory, ".alipay-sandbox.json");
  fs.writeFileSync(
    sandboxPath,
    JSON.stringify({
      appIds: [
        {
          appId: "sandbox-app",
          appPrivatePkcsKey: "sandbox-private",
          alipayPublicKey: "sandbox-public",
          pid: "sandbox-seller",
        },
      ],
    }),
  );

  process.env.VERCEL_ENV = "production";
  process.env.ALIPAY_SANDBOX_CONFIG_PATH = sandboxPath;
  process.env.ALIPAY_APP_ID = "production-app";
  process.env.ALIPAY_PRIVATE_KEY = "production-private";
  process.env.ALIPAY_PUBLIC_KEY = "production-public";
  process.env.ALIPAY_SELLER_ID = "production-seller";
  delete process.env.ALIPAY_SELLER_EMAIL;
  process.env.ALIPAY_GATEWAY = "https://openapi.alipay.com/gateway.do";
  resetAlipayConfigForTests();

  const config = getAlipayRuntimeConfig();
  assert.equal(config.appId, "production-app");
  assert.equal(config.sandbox, false);
  assert.equal(config.sellerId, "production-seller");

  t.after(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    resetAlipayConfigForTests();
    fs.rmSync(sandboxDirectory, { recursive: true, force: true });
  });
});
