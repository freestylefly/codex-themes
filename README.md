<div align="center">
  <img src="./assets/build/icon.png" width="96" alt="Codex Themes 图标" />

  <h1>Codex Themes</h1>

  <p><strong>不止给 Codex 换皮肤。创造、发布并分享属于你的工作空间。</strong></p>
  <p>Theme your Codex. Create with AI. Publish to the community.</p>

  <p>
    <a href="https://theme.codexguide.ai"><strong>访问官网</strong></a>
    ·
    <a href="https://github.com/freestylefly/codex-themes/releases/latest"><strong>下载最新版</strong></a>
    ·
    <a href="https://theme.codexguide.ai/themes"><strong>浏览主题</strong></a>
  </p>

  <p>
    <img alt="Version" src="https://img.shields.io/badge/version-v0.2.0-E8B04B?style=flat-square" />
    <img alt="macOS Apple Silicon" src="https://img.shields.io/badge/macOS-Apple%20Silicon-111111?style=flat-square&logo=apple" />
    <img alt="Electron" src="https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron" />
    <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat-square" /></a>
  </p>
</div>

![Codex Themes 主题画廊](./docs/screenshots/app-theme-gallery.jpg)

## 把灵感变成可以使用的 Codex 主题

Codex Themes 是一套完整的 macOS 主题平台：从官方精选、可视化自定义和本地 AI 创作，到社区投稿、人工审核、积分解锁与创作者收益，都在同一个客户端里完成。

它不会修改 Codex 安装包。主题通过本机 CDP（Chrome DevTools Protocol）作为纯视觉层应用，并且可以随时一键恢复官方外观。

| 选择 | 创造 | 发布 | 获得回报 |
| --- | --- | --- | --- |
| 浏览官方精选与社区作品 | 上传图片自定义，或让本机 Codex CLI 生成 | 一键投稿，经过自动校验与管理员审核后上架 | 用户首次解锁后，创作者获得实付积分的 70% |

## 一句话开始，持续对话直到满意

AI 主题工作室不是一次性生成器。它会按设置生成准确数量的候选主图，并把每次调整保存为独立版本。

- 每批支持 1 / 2 / 3 张候选图，3 张生成完成后再进入选图
- 在同一段对话里继续修改颜色、布局、玻璃感、圆角与装饰效果
- “仅调整主题”会保留当前主图；“重新生成主图”会创建新候选批次
- 任意版本都可以比较、预览、恢复，再从旧版本继续创作
- 采用当前版本后仍能继续对话，不会破坏已经保存和应用的主题

![AI 连续创作、候选主图与版本历史](./docs/screenshots/app-ai-studio.jpg)

## 不会写代码，也能做出自己的主题

自定义编辑器把创作过程拆成主图、布局、风格与完成四步。选择一张图片后，应用会在本地分析配色，并在真实 Codex 结构中实时预览首页和任务页。

![自定义主题编辑器与真实结构预览](./docs/screenshots/app-custom-theme.jpg)

## 从作品到社区广场

本地自定义主题和 AI 作品可以直接发布到官方应用广场。平台会先执行主题包、资源引用、图片尺寸与安全检查，再进入人工审核。

- 作品状态完整可见：未投稿、自动校验、人工审核、已上架、已驳回、已下架
- 每次更新都会生成新版本并重新审核，不影响当前线上版本
- 创作者可以查看唯一使用人数、近 30 天趋势、当前价格与累计收益
- 免费主题直接解锁；付费主题同时支持支付宝和积分
- 重复下载、重复应用、作者本人使用不会重复计算收益

![创作者中心、审核进度与作品数据](./docs/screenshots/app-creator-center.jpg)

## 积分让创作与使用形成循环

用户可以通过支付宝购买积分，也可以通过发布作品获得创作者奖励。所有充值、解锁和奖励都进入不可变积分流水。

| 积分包 | 售价 | 说明 |
| --- | ---: | --- |
| 60 积分 | ¥6 | 入门包 |
| 330 积分 | ¥30 | 含赠送 30 |
| 800 积分 | ¥68 | 含赠送 120 |

主题支持 `0 / 49 / 99 / 199 / 399` 积分档位。每位不同用户首次解锁时，创作者获得 `floor(实付积分 × 70%)`；积分不可提现。

![账号资料、积分钱包与支付宝充值](./docs/screenshots/app-points-wallet.jpg)

## 你会得到什么

- **主题画廊**：官方精选、社区广场、已拥有和本地作品统一管理
- **真实预览**：不是简单贴一张背景图，而是在接近真实 Codex 的首页与任务页结构中预览
- **AI 连续创作**：本机 Codex CLI 生成候选图和结构化主题配方，支持多轮修改与版本恢复
- **可视化自定义**：自动取色、布局选择、明暗模式、密度、透明度与视觉效果调节
- **创作者中心**：投稿、审核、上架、更新、下架、作品数据与积分收益
- **应用广场**：未登录可浏览，登录后可以免费解锁或使用支付宝 / 积分购买
- **主题包**：`.codextheme` 双击导入、右键导出，兼容 Codex-Dream-Skin schema v1
- **常驻守护**：Codex 刷新或新开窗口后自动重新应用，可选开机自启和自动更新

## 官网

官网提供主题浏览、详情预览、客户端下载与 `codexthemes://` 一键唤起：

- `codexthemes://theme/<theme-id>`：在客户端中定位指定主题
- `codexthemes://create/custom`：打开自定义主题编辑器
- `codexthemes://create/ai`：打开 AI 主题工作室

![Codex Themes 官网](./docs/screenshots/website-home.png)

## 下载与安装

当前公开版本为 **v0.2.0 Beta**，支持 Apple 芯片 Mac（M1–M4）。

- [下载 DMG 安装包](https://github.com/freestylefly/codex-themes/releases/download/v0.2.0/Codex-Themes-0.2.0-mac-arm64.dmg)
- [下载 ZIP 便携包](https://github.com/freestylefly/codex-themes/releases/download/v0.2.0/Codex-Themes-0.2.0-mac-arm64.zip)
- [查看最新版本与更新说明](https://github.com/freestylefly/codex-themes/releases/latest)

安装包目前尚未签名或公证。首次打开如果被 macOS 阻止，请前往「系统设置 → 隐私与安全性」并选择「仍要打开」。

## 开发

要求：Node.js >= 22、macOS，并已安装 Codex 桌面端（`/Applications/ChatGPT.app`）。

```bash
npm install
npm run dev          # Electron + Vite 开发模式
npm run dev:web      # Astro 官网开发模式
npm run typecheck    # 主进程、服务端、渲染进程与官网类型检查
npm run test         # 单元测试
npm run build        # 构建客户端
npm run build:web    # 构建官网
npm run dist         # 生成 DMG + ZIP 到 release/
```

## 安全边界

- 调试端口只监听 `127.0.0.1`，连接前校验端口进程属于 Codex 本体
- 只向 `app://` 页面注入装饰层，并通过 DOM 探针确认目标是 Codex
- 装饰层保持 `pointer-events: none`，不拦截原生交互
- 不修改 `app.asar`、代码签名、API Key 或 Base URL
- 用户 Token、一次性上传信息与私有 Storage 路径不会暴露给 Renderer

更多设计与安全说明见 [DESIGN.md](./DESIGN.md)。

## 致谢与许可

注入引擎移植自 MIT 许可的 [Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)，原始版权声明保留于 [NOTICE.md](./NOTICE.md)。

本项目使用 [MIT License](./LICENSE)。Codex Themes 是独立项目，与 OpenAI 无隶属或背书关系。
