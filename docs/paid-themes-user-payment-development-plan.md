# 用户体系与支付宝付费主题开发计划

更新时间：2026-07-23

## Summary

- 首版采用“单主题一次性买断”：用户登录后在客户端购买，支付成功即可下载、安装和永久使用，并可在“已购主题”中跨设备重新下载。
- 后端默认采用 Supabase Auth、Postgres、私有 Storage，支付宝签名、回调和授权接口运行在 Vercel Node Functions。
- 支付采用支付宝“AI 网页应用收款”：客户端创建订单后打开系统浏览器收银台，支付结果只依据服务端验签通知或主动查询，不依赖浏览器返回。
- 当前已发布主题继续免费；后续付费主题只公开预览，不把完整资源打入安装包或公开 GitHub 仓库。
- 官网可展示付费标识和价格，但只能唤起客户端；不提供官网登录和直接购买。

参考文档：

- [支付宝产品矩阵](https://aipay.alipay.com/docs/overview.html)
- [支付宝异步通知说明](https://aipay.alipay.com/docs/ai-web-app-payment-qianyi/api-list/async-notify-verify.html)
- [Supabase 邮箱 OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase OAuth Deep Link](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Supabase 私有存储](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Vercel Node Functions](https://vercel.com/docs/functions/runtimes/node-js)

## Implementation Changes

### 1. 用户体系

- Electron 主进程接入 Supabase Auth，支持邮箱六位验证码登录、GitHub OAuth＋PKCE、会话恢复、刷新、退出及 GitHub 身份绑定。
- GitHub 登录通过系统浏览器完成，并通过自定义协议返回客户端。
- Token 只保存在主进程，并使用 macOS `safeStorage` 加密；Renderer、日志、主题包和 URL 中不得出现访问令牌。
- 新增客户端“账号”页面和侧栏用户入口：
  - 未登录时展示邮箱验证码和 GitHub 登录。
  - 已登录时展示头像、邮箱、登录方式、已购主题数量和退出登录。
- 扩展深链：
  - `codexthemes://auth/callback?code=...`
  - `codexthemes://payment/result?orderId=...`
- 邮箱登录采用客户端输入验证码的方式，避免邮件安全扫描提前消费登录链接。

### 2. 主题商品与授权

- 增加远程商品目录，付费主题包含：`id`、名称、版本、布局、描述、预览、人民币分价、发布状态、最低引擎版本和资源校验值。
- 数据模型：
  - `profiles`：用户资料，主键关联 `auth.users.id`。
  - `theme_products`：公开商品信息和价格。
  - `orders`：用户、主题、金额快照、支付宝订单号及状态。
  - `entitlements`：用户已拥有的主题，状态为 `active | revoked`。
  - `payment_events`：仅服务端可读的验签通知和幂等审计记录。
  - 私有 schema 保存付费包 Storage 路径，避免通过 Data API 暴露。
- 所有公开表启用 RLS：
  - 用户只能读取自己的订单、授权和资料。
  - 客户端不能直接创建订单、修改价格或授予授权。
  - 支付通知与授权写入只能由服务端执行。
- 完整付费包存入私有 Storage；下载接口验证授权后生成短时有效地址。
- 客户端增加 `purchased` 主题来源和独立购买主题目录：
  - 购买后下载 `.codextheme`，执行现有安全检查、SHA-256 和签名校验。
  - 安装为只读主题，禁止编辑、复制和导出。
  - 已下载主题允许离线使用；登录用于购买、同步和重新下载。
  - 首版不设置设备数量限制。
- 增加付费主题发布脚本：验证主题包、生成校验值、上传私有 Storage、更新商品版本；密钥全部来自部署环境变量。

### 3. 支付闭环

- 客户端点击付费主题后的流程：
  1. 未登录则先完成登录，并保留原购买意图。
  2. 调用服务端创建订单，客户端只提交 `themeId` 和幂等键。
  3. 服务端从商品目录读取价格，生成唯一 `out_trade_no` 和 30 分钟有效的支付宝订单。
  4. 客户端使用系统浏览器打开 Vercel 托管的支付宝收银台。
  5. 客户端轮询订单，并在重新获得焦点或收到支付深链时立即刷新。
  6. 服务端确认付款后，事务性写入 `paid` 订单和 `active` 授权。
  7. 客户端自动下载并安装，显示“支付成功，立即使用”，不未经确认自动换肤。
- 服务端接口：
  - `GET /api/v1/catalog`
  - `POST /api/v1/orders`
  - `GET /api/v1/orders/:id`
  - `POST /api/v1/orders/:id/reconcile`
  - `POST /api/v1/alipay/notify`
  - `GET /api/v1/me/entitlements`
  - `POST /api/v1/themes/:id/download`
- 支付宝通知必须校验 RSA2 签名、`app_id`、收款方、金额、订单号和交易状态；只接受 `TRADE_SUCCESS`、`TRADE_FINISHED`。
- 通知丢失时调用 `alipay.trade.query` 补偿；重复通知、重复下单和重复授权均保持幂等。
- 支付宝私钥、Supabase Service Role、GitHub OAuth Secret 仅配置在 Vercel；桌面安装包只包含 Supabase URL 和 publishable key。
- 首版不做退款申请界面、优惠券、订阅、购物车、发票和后台运营系统；数据模型保留 `refunded/revoked` 状态，供人工退款后撤销未来下载。

### 4. 客户端与官网体验

- 主题画廊增加“全部、免费、付费、已购、本地主题”筛选。
- 付费卡片显示人民币价格和锁定状态：
  - 未购买：“¥xx.xx 购买并使用”。
  - 已购买未下载：“下载主题”。
  - 已安装：“应用主题”。
  - 有更新：“更新后应用”。
- “已购主题”显示购买时间、版本、安装状态和重新下载入口；未登录时显示登录引导。
- 官网付费详情页显示价格和“在客户端购买”，只发出主题深链，不创建订单。
- 支付结果网页只展示处理中或已返回客户端提示，不能直接授予权限。
- Vercel 增加 Node Functions，与现有 Astro 静态站共存。

## Public Interfaces

- 新增类型：
  - `AuthUserSummary`
  - `AuthState`
  - `ThemeProduct`
  - `PurchaseOrder`
  - `ThemeEntitlement`
  - `CommerceThemeSummary`
- `PurchaseOrder.status` 固定为：
  - `pending | paid | closed | failed | refunded`
- `ThemeSource` 增加 `purchased`。
- IPC 增加：
  - `auth:getState/sendEmailOtp/verifyEmailOtp/signInGitHub/signOut`
  - `commerce:listCatalog/createOrder/getOrder/listEntitlements/downloadTheme`
  - `onAuthChanged/onOrderChanged`
- 支付金额统一使用整数人民币分；客户端传入的名称、金额和资源路径均不作为服务端依据。

## Test Plan

- 登录：邮箱 OTP 正确、错误、过期、重发限流；GitHub 成功、取消、伪造回调；会话恢复和退出。
- 支付沙箱：正常付款、用户取消、订单过期、通知延迟、通知丢失后查询、重复通知、金额篡改、错误商户和重复购买。
- 授权：未登录或未购买不能下载；购买后可下载、安装、离线应用和跨设备重下；篡改包或校验值必须拒绝。
- UI：付费筛选、登录后恢复购买、支付处理中、成功、失败、已购主题、更新主题和网络断开状态。
- 安全：确认支付宝私钥、Supabase Service Role 和用户 Token 不进入 Renderer、日志、Git、安装包或错误信息。
- 执行数据库 RLS／安全顾问检查、Electron 单元测试、类型检查、桌面构建、网站构建和支付宝沙箱全链路测试。
- 上线前先发布一个 ¥0.01 测试商品，完成真实异步通知和下载验证后再开放正式价格。

## Assumptions

- 默认采用 Supabase＋Vercel；如改用国内云，需要重新确定账号、数据库、邮件和对象存储实现。
- 默认现有免费主题保持免费，未来新增精品主题进入付费目录。
- 默认单主题永久买断、人民币定价、仅客户端发起支付。
- 付费包下载后可以离线使用；首版不承诺不可破解的 DRM，只防止未购买下载和普通复制／导出。
- 正式收款上线依赖支付宝应用、AI 网页应用收款产品、RSA2 密钥和沙箱／生产配置；缺少生产资质不阻塞沙箱开发。
- 当前未提交的“蓝窗信使”改动应先单独提交，避免与账号支付功能混入同一提交。
