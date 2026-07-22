declare module "alipay-sdk" {
  export class AlipaySdk {
    constructor(options: {
      appId: string;
      privateKey: string;
      alipayPublicKey?: string;
      gateway?: string;
      signType?: "RSA2";
    });
    exec(method: string, params?: Record<string, unknown>): Promise<unknown>;
    pageExecute(method: string, httpMethod?: string, params?: Record<string, unknown>): string;
    checkNotifySign(body: Record<string, unknown>): boolean;
  }
}
