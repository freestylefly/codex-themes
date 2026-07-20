# Codex Themes — 桌面主题管理应用设计方案

> 状态:M1–M4 已实现并持续打磨;设计系统已参考 Fei-Away/Codex-Dream-Skin 优化排版、半径、阴影与氛围感。
> 日期:2026-07-17
> 参考实现:[Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)(MIT)

## 1. 背景与目标

现有的 Codex-Dream-Skin 证明了「不修改官方安装包、通过本机 CDP(Chrome DevTools Protocol)注入给 OpenAI Codex 桌面端换肤」的可行性,但它以 shell 脚本 + `.command` 双击入口交付,用户要理解端口、重启、verify 等概念,体验不够丝滑。

**目标**:构建一个独立的桌面应用(工作名 **Codex Themes**),用户下载安装后,点击选择主题或自定义主题,应用自动完成全部配置;并支持一键还原官方外观。

已确认的产品决策:

| 决策点 | 结论 |
|--------|------|
| 技术栈 | **Electron**(注入引擎是纯 Node 代码,可直接复用) |
| 平台 | **先 macOS**,架构预留 Windows 扩展 |
| 主题来源 | 三管齐下:**内置预设 + 本地自定义 + 在线主题市场** |
| 与原仓库关系 | **独立新产品**,移植 MIT 引擎并重构,NOTICE 保留版权声明 |

本机环境已确认:Node 24 / npm 11;Codex 桌面端已安装(`/Applications/ChatGPT.app`,bundle id `com.openai.codex`),可用于真机验证。

## 2. 总体架构

```
Electron 应用(常驻菜单栏 Tray + 主窗口)
├── 主进程(Node/TypeScript)
│   ├── engine/          ← 从 injector.mjs 移植重构(核心资产)
│   │   ├── cdp.ts           CDP WebSocket 会话(loopback 校验、目标探针)
│   │   ├── payload.ts       CSS + renderer-inject 模板 + theme.json → 注入载荷
│   │   ├── watcher.ts       进程内守护:监听 Page.loadEventFired 自动重注入
│   │   └── verify.ts        DOM 验证 + Page.captureScreenshot 截图
│   ├── platform/
│   │   └── codex-macos.ts   发现 Codex.app、带 CDP 参数启动、重启流程、端口归属校验
│   ├── themes/store.ts      本地主题库(预设 + 自定义 + 市场安装的)
│   ├── themes/palette.ts    取色:nativeImage 解码 + 量化,免第三方依赖
│   ├── market/client.ts     拉取远端静态 index.json,下载校验主题包
│   ├── config/codex-config.ts  ~/.codex/config.toml 外观键备份/还原
│   └── ipc.ts               类型化 IPC 通道
├── preload.ts(contextBridge)
└── 渲染进程(React 18 + Vite + TypeScript)
    ├── 主题画廊(预设 + 已安装)     ├── 自定义主题编辑器(选图 + 取色 + 实时预览)
    ├── 在线市场                      └── 状态面板 + 设置
```

### 相对原脚本的关键架构变化

1. **守护进程内化**:原方案用 shell 脚本 fork 一个 node watch daemon,靠状态文件跟踪 PID、launchd 兜底。新方案中 Electron 主进程本身就是 Node,CDP 会话直接活在主进程里,应用常驻菜单栏 Tray——彻底删掉 PID 状态文件、`launchctl`、`stop_recorded_injector` 那一整层复杂度。
2. **不再依赖 Codex 自带的签名 Node**:原脚本为零依赖复用 `ChatGPT.app/.../cua_node/bin/node` 并做签名/TeamID/架构校验;Electron 自带运行时,这层不需要移植。
3. **安全护栏全部保留**(见 §7)。

## 3. 核心用户流程

**首次启动引导**:检测 Codex.app 是否安装(bundle id `com.openai.codex`,候选路径 `/Applications/ChatGPT.app`、`~/Applications/ChatGPT.app`,兜底 `mdfind`)→ 解释「首次应用主题需重启一次 Codex」→ 请求以调试模式启动的授权。

**一键应用主题**(点主题卡片上的「应用」):

1. 检查 Codex 是否已带 CDP 运行(复用已存端口,`/json/version` 健康检查 + 端口监听进程归属校验);
2. 未开调试口 → 弹一次确认对话框 → 优雅退出 Codex(AppleScript quit → 15s 超时 → TERM → KILL)→ 以 `open -na <bundle> --args --remote-debugging-address=127.0.0.1 --remote-debugging-port=<自动选口>` 重启,端口从 9341 起向后找空闲口;
3. watcher 连上 `app://` page 目标、DOM 探针确认是 Codex、注入载荷、soft verify;
4. Tray 图标与状态面板变为「主题已激活」;之后 Codex 刷新/新窗口都自动重注入(`Page.loadEventFired` + 900ms 轮询发现新目标)。

**还原官方外观**:向所有会话注入 cleanup(移除 style/chrome/类名/CSS 变量)+ 还原 config.toml 备份键 + 停 watcher。

**退出行为**:关窗口退到 Tray 而非退出;真正退出时提示「主题将在 Codex 下次刷新后消失」。

## 4. 主题系统

### 主题包格式 `.codextheme`

zip 包:`theme.json`(沿用原引擎 **schema v1**,与原生态完全兼容)+ 背景图(png/jpg/webp,≤16MB)+ `preview.jpg`。支持双击/拖拽导入、右键导出——同时是市场分发格式。

theme.json 校验规则(移植原引擎):文本字段截断(名称 80 / 标语 160 字符),颜色仅接受 `#rrggbb` 或 `rgba()` 正则,图片路径必须是纯文件名(`path.basename(image) === image` 防路径穿越)。

### 内置预设

打包 10 款主题于 `assets/presets/`。图片用程序生成的渐变/抽象图或获授权素材,**不搬运原仓库含 IP 形象的 gallery 图**。

### 自定义编辑器(体验重点)

- 选一张图(或拖入)→ 主进程用 `nativeImage` 解码 + 自研颜色量化(popularity + 饱和度加权)自动提取 accent/secondary/highlight,不引第三方取色库;
- 名称/标语/quote 文本框,颜色可手动微调;
- **实时预览**:渲染进程内做一个模仿 Codex 首页布局的静态 mock DOM,套用同一套 CSS 变量渲染,用户不启动 Codex 就能看到近似效果;
- 保存进本地主题库(`userData/themes/<id>/`),可一键应用。

### 在线市场(v1 轻量方案,无服务端)

- 一个独立 GitHub 仓库(或任意静态托管)存 `index.json` + 各主题包;
- `index.json` 每项含:id、名称、作者、预览图 URL、包 URL、**sha256**、大小、版本;
- 应用拉取索引 → 网格展示 → 下载包 → 校验哈希 → 解包安装进本地库;
- 社区投稿走该仓库 PR;后续升级动态服务端/评分时客户端接口不变。

## 5. 目录结构

```
codex-themes/
├── package.json / electron-builder.yml / tsconfig.node.json / tsconfig.web.json
├── electron.vite.config.ts
├── electron/            # 主进程
│   ├── main.ts  preload.ts  ipc.ts  tray.ts
│   ├── engine/  platform/  themes/  market/  config/
├── src/                 # 渲染进程 (React)
│   ├── index.html
│   ├── pages/  Gallery · Editor · Market · Settings · Onboarding
│   └── components/  ThemeCard · PreviewCanvas · StatusBar · PaletteEditor
├── assets/
│   ├── inject/dream-skin.css + renderer-inject.js   # 移植自原仓库
│   └── presets/
├── scripts/gen-presets.mjs   # 生成内置预设背景图(纯 JS PNG 编码,零依赖)
├── NOTICE.md            # Fei-Away/Codex-Dream-Skin MIT 版权声明
└── market-index/        # 市场索引示例(后拆独立仓库)
```

## 6. 技术选型

- **Electron + electron-vite + electron-builder**(DMG 产物;签名/公证需 Apple Developer 账号,构建脚本预留参数)
- **React 18 + Vite + TypeScript**;状态用 zustand
- 主题包 zip 用 `adm-zip`;自动更新用 `electron-updater`(M4)
- **CDP 客户端不引第三方库**:原 `injector.mjs` 的原生 WebSocket 实现 <150 行且久经打磨,直接移植为 TS(Node ≥22 自带全局 WebSocket/fetch)
- **取色不引第三方库**:Electron `nativeImage` 解码 + 自研量化

## 7. 安全护栏(全部继承自原项目)

- `webSocketDebuggerUrl` 强制 loopback(127.0.0.1/localhost/[::1])+ 端口一致才连接;
- 仅接受 `type === "page"` 且 `url` 以 `app://` 开头的目标,再用 DOM 探针(`main.main-surface` + 侧栏 + 输入框选择器)确认是 Codex 界面;
- 端口监听进程必须是 Codex 进程或其后代(`lsof` + `ps` 溯源);
- 装饰层恒为 `pointer-events: none`,原生控件全部保持可交互;
- 图片 ≤16MB、纯文件名、白名单扩展名;颜色/文本字段严格校验;
- **绝不**触碰 `app.asar`、代码签名、API Key / Base URL;config.toml 只备份/还原外观相关键(`appearanceTheme`、`appearanceDarkCodeThemeId`),原子写入;
- 重启用户正在运行的 Codex 前必须弹窗获得明确授权;
- 设置页明示 CDP 调试口的本机暴露面风险(沿用原 README 安全边界文案)。

## 8. 里程碑

| 阶段 | 内容 | 验收 |
|------|------|------|
| M1 引擎+最小闭环 | 移植 engine、Codex 启动器、Tray、预设画廊、一键应用/还原 | 点击预设 → Codex 变身;还原 → 官方外观 |
| M2 自定义编辑器 | 选图、自动取色、实时预览、保存本地主题 | 任意图片 30 秒内变成可应用主题 |
| M3 市场+主题包 | `.codextheme` 导入导出、静态市场索引、下载安装 | 从市场安装一款主题并应用 |
| M4 打磨 | 开机自启选项、Codex 启动自动应用、DMG 打包、自动更新、首次引导 | 完整安装体验走通 |

## 9. 关键移植映射(原仓库 → 新代码)

| 原文件 | 移植去向 | 说明 |
|--------|----------|------|
| `macos/scripts/injector.mjs` | `electron/engine/{cdp,payload,watcher,verify}.ts` | 拆四模块,去掉 CLI argv 层 |
| `macos/assets/renderer-inject.js` | `assets/inject/renderer-inject.js` | 基本原样(幂等注入+MutationObserver+cleanup 是精华) |
| `macos/assets/dream-skin.css` | `assets/inject/dream-skin.css` | 原样,品牌类名可后改 |
| `macos/scripts/common-macos.sh` 的发现/启停/端口归属逻辑 | `electron/platform/codex-macos.ts` | shell → Node(`lsof`/`ps`/`osascript` 子进程调用) |
| `macos/scripts/theme-config.mjs` | `electron/config/codex-config.ts` | 外观键备份/还原,逻辑不变 |
| `macos/scripts/write-theme.mjs` 校验规则 | `electron/themes/store.ts` | 文本截断/hex 校验/16MB 限制 |

## 10. 风险与对策

- **Codex 版本更新改 DOM 选择器** → 探针/验证选择器集中在 engine 一个常量模块;verify 用 soft 模式(原 1.1.x 行为),UI 上区分「完全生效/部分生效」。
- **CDP 调试口的本机暴露面** → 沿用 loopback-only + 归属校验;设置页明示该风险。
- **签名公证** → 无 Apple Developer 账号时先出未签名 DMG + 绕 Gatekeeper 说明,构建管线预留签名参数。
- **Electron 包体积(100MB+)** → 接受;后续若在意可评估迁移 Tauri(引擎逻辑已模块化,迁移成本可控)。

## 11. 验证方式

1. `npm run dev` 启动开发模式,走完首次引导;
2. 应用一款预设主题:确认 Codex 被带调试口重启、界面主题化、原生侧栏/输入框可交互、刷新页面后主题自动恢复;
3. 一键还原:Codex 恢复官方外观,`~/.codex/config.toml` 外观键与安装前一致;
4. 自定义:拖入一张图 → 自动取色 → 预览 → 保存 → 应用;
5. 市场:从本地起的静态服务器加载 index.json,安装主题包(含坏哈希包被拒的负例);
6. `npm run build` 产出 DMG,全新用户目录安装冒烟。
