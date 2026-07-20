# Codex Themes：本地 Codex CLI 驱动的 AI 主题系统开发计划

> 计划版本：3.1  
> 更新日期：2026-07-19  
> 当前阶段：M0–M3 代码已完成（待真机端到端验证）；M5 编辑器闭环已完成，主题包安全收尾待做。  
> 首发平台：macOS，继续使用当前 CDP 注入方式。

## 一、产品目标

将 Codex Themes 建设成一个本地优先的 AI 主题工作室：

- 用户直接在应用内描述想要的主题。
- 应用使用用户本机已经安装、已经登录的 Codex CLI 作为 AI 执行引擎。
- Codex 生成适合 Codex UI 的主题主图，并根据选中图片生成结构化主题 Recipe。
- 应用使用本地算法校验、补全和修正 Recipe，再交给现有主题编译器。
- 用户可以继续通过简单模式或高级编辑器调整主题。
- 生成后的主题完整保存在本地，之后预览、应用、切换和导出都不依赖 AI，也不需要联网。
- 用户仍然可以不使用 AI，直接上传图片手动制作主题。

目标体验：

```text
输入主题描述
    ↓
本地 Codex CLI / App Server
    ↓
生成候选主题图片
    ↓
用户选择图片
    ↓
Codex 输出结构化 Theme Recipe
    ↓
本地 Theme Synthesizer 校验与补全
    ↓
现有 Theme Compiler
    ↓
预览 → 微调 → 保存 → 一键应用
```

## 二、当前范围与明确不做

### 2.1 当前范围

- 集成用户本机的 Codex CLI，不以应用直连 OpenAI API 作为主路径。
- 使用 `codex app-server --listen stdio://` 建立结构化、可流式、可恢复的本地连接。
- 复用 Codex CLI 已有的 ChatGPT/API 登录状态、模型配置和能力。
- 内置一个应用专属的 `generate-codex-theme` Skill。
- 支持 AI 生成候选主图、选图、生成主题 Recipe、多轮调整和停止任务。
- 支持手动上传图片后让 Codex 只生成主题 Recipe。
- 支持“不换图片，只重新配主题”和“重新生成图片”两条独立路径。
- 保留本地主题画廊、编辑器、主题包导入导出和一键切换。

### 2.2 当前明确不做

- 在线主题市场、社区主题列表、远程主题下载。
- GitHub 登录、用户账号、投稿、审核、发布后台。
- Supabase、Edge Functions、远程 Storage 和市场索引。
- 应用自建 OpenAI API Key 管理和直接请求图片 API。
- 第一版把 Codex CLI 二进制捆绑进安装包。
- 解析 Codex TUI 的 ANSI 终端输出。
- 让 AI 直接生成或执行任意 CSS、JavaScript。
- 视频背景、动画图片和用户上传字体文件。
- 完全离线的本地图片模型。

说明：“本地 Codex CLI”代表代理进程、配置、技能和文件操作在本机运行；AI 推理和图片生成仍然需要网络以及用户账户可用的 Codex 能力。

## 三、当前代码完成度

状态说明：

- ✅ 已完成：代码中已经存在，当前检查可通过。
- 🟡 部分完成：已有数据模型或基础实现，但产品闭环未完成。
- ⬜ 未开始：当前代码中没有对应实现。
- 🧹 待移除：已经存在，但因产品范围调整不再继续建设。

本次基线检查结果：

- `npm run typecheck`：通过。
- `npm test`：51 项测试全部通过（主题引擎、App Server 客户端、Recipe 校验、Synthesizer、主题包安全）。
- `npm run build`：通过。

### 3.1 已完成功能

| 模块 | 状态 | 当前实现 |
| --- | --- | --- |
| macOS Codex 桌面端发现 | ✅ | 能发现官方 Codex App、读取版本、判断运行状态。 |
| CDP 安全连接 | ✅ | 调试端口只在验证属于 Codex 进程后使用。 |
| 应用与还原 | ✅ | 首次必要重启前确认、热切换、一键还原官方外观。 |
| 注入守护 | ✅ | Codex 刷新或新开窗口后自动重新注入。 |
| schema v1/v2 | ✅ | 支持 v1、v2 联合类型和统一 `NormalizedTheme`。 |
| v1 兼容 | ✅ | v1 自动映射到 `dream-banner` 并派生暗色配色。 |
| 七种布局枚举 | ✅ | `dream-banner`、`split-studio`、`full-canvas`、`terminal-grid`、`paper-board`、`minimal-focus`、`retro-messenger`。 |
| 共享主题编译器 | ✅ | 预览和注入使用同一套结构化变量、类名和属性。 |
| 亮色/暗色 | ✅ | 支持双调色板，缺少暗色时可自动派生。 |
| 外观参数模型 | ✅ | 已有主图、壁纸、字体、圆角、密度、阴影、玻璃、装饰和效果参数。 |
| 内置动效模型 | ✅ | 已有粒子、极光、光晕、噪点、网格、漂浮强度。 |
| 减少动态效果 | ✅ | 注入 CSS 已处理 `prefers-reduced-motion`。 |
| 11 个内置主题 | ✅ | 10 个原有预设加“蓝窗信使”；新主题使用 `retro-messenger`，支持画廊一键应用。 |
| 蓝窗信使真机适配 | ✅ | 已实现双层工具栏、右侧资料栏、原创透明机器人、紧凑预览和窄屏降级；945/820/700px 验证无横向溢出。 |
| 主图上传与拖放 | ✅ | 支持 PNG/JPEG/WebP，限制单图不超过 16MB。 |
| 自动取色 | ✅ | 可从图片提取 4 个主要颜色。 |
| 简单/高级模式 | ✅ | 已有切换和一部分高级参数表单。 |
| 基础预览 | ✅ | 支持首页近似预览、亮色/暗色、宽屏/紧凑切换。 |
| 本地主题存储 | ✅ | 支持新建、更新底层接口、复制、删除。 |
| 主题导出 | ✅ | 能导出 `.codextheme`，统一写出 v2 `theme.json`。 |
| 主题导入预检 | ✅ | 能先解包预览、归一化、检查签名并计算 SHA-256。 |
| 导入为副本 | ✅ | 可生成新 ID、UUID 和名称。 |
| Finder 双击导入 | ✅ | 已注册 `.codextheme` 打开流程。 |
| Electron IPC 隔离 | ✅ | Renderer 通过 preload 和类型化 IPC 调用主进程能力。 |
| 构建与打包基础 | ✅ | Electron Vite 构建通过，已有 DMG/zip 配置与产物。 |

### 3.2 部分完成功能

| 模块 | 状态 | 已有部分 | 仍缺少 |
| --- | --- | --- | --- |
| 七种布局视觉差异 | 🟡 | 注入 CSS 已有七类布局规则，`retro-messenger` 已完成真机截图回归。 | 其余布局的任务页适配、截图基线和 DOM 变更降级。 |
| 高级主题编辑器 | 🟡 | 已有焦点、高度、遮罩、文字对齐、圆角、密度、阴影、字体和动效。 | `heroFit`、缩放、壁纸焦点/透明度/模糊、玻璃、装饰、完整配色等 UI。 |
| 高级设置分组 | 🟡 | 已有分组标题。 | 标题按钮当前没有展开/收起行为。 |
| 描述与标签 | 🟡 | 数据模型和存储支持。 | 编辑器没有开放输入。 |
| 深浅色编辑 | 🟡 | 运行时和存储支持完整 light/dark。 | 编辑器只有 4 色输入，不能完整编辑亮色/暗色调色板。 |
| 对比度 | 🟡 | 有 WCAG 计算和警告逻辑。 | 编辑器没有实时显示警告和自动修正建议。 |
| 编辑已有主题 | 🟡 | `updateTheme` 底层接口已存在。 | 没有 `loadThemeDraft` 和编辑入口，编辑器始终按新建保存。 |
| 复制并编辑 | 🟡 | 能复制主题。 | 复制完成后没有自动进入已加载编辑状态。 |
| Stamp | 🟡 | schema 和导出能保留已有 Stamp。 | 编辑器不能上传，也不会从 Hero 自动裁切生成。 |
| 任务页预览 | 🟡 | 编译器可复用。 | 当前 `PreviewCanvas` 只有首页近似预览。 |
| 主题包安全 | 🟡 | 忽略嵌套路径，图片加载有限制。 | 缺少包总体积、解压体积、文件数、动画图片、压缩炸弹、白名单的完整校验。 |
| 导入冲突 | 🟡 | 可覆盖或手动安装为副本。 | 没有版本比较、明确的 replace/copy 决策和安全更新流程。 |
| 原子替换 | 🟡 | `theme.json` 写入使用临时文件。 | 整个主题目录替换仍会先删除旧目录，失败可能破坏旧主题。 |
| 导出预览 | 🟡 | 如果主题已有 preview 会一起导出。 | 不会自动渲染标准预览图。 |
| 临时目录清理 | 🟡 | 导入完成会清理。 | 预检目录当前建在用户主题目录，取消、异常和启动时没有完整清理。 |

### 3.3 已存在但待移除的代码

以下是历史半成品，不计入目标功能：

- 🧹 在线市场页面和导航入口。
- 🧹 静态市场索引拉取、下载、安装和 `gen:market`。
- 🧹 “我的投稿”和“审核控制台”页面。
- 🧹 Supabase GitHub OAuth、投稿/审核客户端和 IPC。
- 🧹 `marketIndexUrl`、`supabaseUrl`、`supabaseAnonKey` 设置。
- 🧹 `MarketEntry`、`AuthSession`、`Submission*` 公共类型。
- 🧹 `ThemeSource` 中的 `market` 新逻辑；历史市场主题仅兼容迁移为 `imported`。

### 3.4 核心 AI 能力现状（2026-07-19 复查）

- ✅ 本地 Codex CLI 路径发现和版本检查（`electron/codex-cli/locator.ts`）。
- ✅ `codex app-server` 生命周期管理（单实例、优雅退出、断开状态上报）。
- ✅ App Server JSON-RPC 客户端（JSONL 半包/粘包/非法行、超时、乱序均有测试）。
- ✅ Codex 登录状态和图片生成能力检测（`account/read`、`modelProvider/capabilities/read`）。
- ✅ AI 主题任务目录与任务状态机（`ai-jobs/<id>/job.json`，原子写入）。
- ✅ App Server thread/turn 创建、恢复（`thread/resume`）、停止（`turn/interrupt`）和流式事件。
- ✅ `imageGeneration` 事件接收和 `savedPath` 资产导入（路径/格式/大小校验后复制）。
- ✅ 结构化 Theme Recipe 与 `outputSchema`（运行时校验拒绝未知键/未知枚举/越界值）。
- ✅ Theme Synthesizer 第一阶段（取色、派生暗色、clamp、WCAG 基础调整）。
- ✅ `generate-codex-theme` 专属 Skill（SKILL.md + references + 布局参考图 + 校验脚本）。
- ✅ AI 主题生成 UI、多候选图、多轮调整（`src/pages/AiStudio.tsx`）。
- ⬜ App Server 审批事件 UI（MVP 以 `approvalPolicy: never` 规避，审批一律拒绝）。
- 🟡 Codex CLI 版本兼容矩阵和端到端测试（已按 0.144.5 `generate-ts` 协议基线比对并修正参数形状；真机端到端待做）。

## 四、目标技术架构

```text
┌─────────────────────────────────────────────────────────┐
│ Renderer                                                 │
│ AI Theme Studio / Gallery / Editor / Preview            │
└──────────────────────┬──────────────────────────────────┘
                       │ 受限、类型化 Electron IPC
┌──────────────────────▼──────────────────────────────────┐
│ Electron Main                                           │
│                                                         │
│ CodexCliLocator                                         │
│ CodexAppServerClient                                    │
│ AiThemeJobService                                       │
│ ThemeGenerationOrchestrator                             │
│ ThemeSynthesizer                                        │
│ ThemeStore / ThemeController                            │
└───────────────┬───────────────────────┬─────────────────┘
                │ stdio JSONL / JSON-RPC│
                │                       │
┌───────────────▼─────────────┐   ┌─────▼────────────────┐
│ Local Codex CLI             │   │ Local Theme Engine   │
│ codex app-server            │   │ normalize / compile  │
│ auth / thread / image gen   │   │ preview / CDP inject │
└─────────────────────────────┘   └──────────────────────┘
```

### 4.1 核心技术决定

1. 正式集成使用 App Server，不解析 TUI。
2. 首版使用 `stdio://`，不开放 WebSocket 端口。
3. App Server 只由 Electron 主进程启动和通信。
4. Renderer 不获取子进程句柄、认证信息或未经校验的本地路径。
5. MVP 只依赖 App Server 稳定协议，不依赖 experimental API。
6. 使用 `codex exec --json` 仅作为未来可选降级，不与主路径同时开发。
7. AI 输出 Theme Recipe，不输出任意 CSS/JS。
8. 主题最终保存为现有 schema v2，确保应用、导入导出和离线切换继续兼容。
9. AI 生成记录与 Codex thread ID 存放在应用私有任务数据中，默认不导出到主题包。
10. 每个 AI 任务使用独立工作目录，不把项目源码或整个用户目录作为 Codex 工作目录。

## 五、数据模型与状态调整

### 5.1 区分 Codex Desktop 和 Codex CLI

当前 `CodexStatus` 实际表示 Codex 桌面端/CDP 状态，新增 CLI 后必须消除歧义：

```ts
interface CodexDesktopStatus {
  installed: boolean;
  bundlePath: string | null;
  version: string | null;
  running: boolean;
  cdpPort: number | null;
  cdpHealthy: boolean;
}

interface CodexCliStatus {
  installed: boolean;
  executablePath: string | null;
  version: string | null;
  supported: boolean;
  appServerRunning: boolean;
  authenticated: boolean;
  authMode: string | null;
  imageGeneration: boolean | null;
  error: string | null;
}
```

`AppState.codex` 重命名为 `codexDesktop`，新增 `codexCli`。

### 5.2 AI 任务状态机

```ts
type AiThemeJobStage =
  | "created"
  | "preparing"
  | "generating-images"
  | "awaiting-selection"
  | "generating-recipe"
  | "synthesizing"
  | "preview-ready"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";
```

允许的主流程：

```text
created
  → preparing
  → generating-images
  → awaiting-selection
  → generating-recipe
  → synthesizing
  → preview-ready
  → saving
  → completed
```

任意运行阶段可以进入 `failed` 或 `cancelled`；可恢复任务从最近一个已持久化阶段继续。

### 5.3 生成请求

```ts
interface ThemeGenerationRequest {
  prompt: string;
  mode: "generate-image" | "use-reference-image" | "recipe-only";
  appearance: "auto" | "light" | "dark";
  layoutPreference?: LayoutKind;
  candidateCount: 1 | 2 | 3;
  referenceImagePath?: string;
}
```

候选数量默认 1，用户主动选择后可改为 2 或 3，避免默认产生不必要的生成消耗。

### 5.4 Theme Recipe

Recipe 只描述现有主题引擎允许的结构化字段：

```ts
interface ThemeGenerationRecipe {
  schemaVersion: 1;
  name: string;
  description: string;
  tagline: string;
  tags: string[];
  layout: LayoutKind;
  hero: {
    fit: ImageFit;
    focusX: number;
    focusY: number;
    zoom: number;
    height: number;
    textAlign: TextAlign;
    scrim: number;
  };
  wallpaper: {
    enabled: boolean;
    focusX: number;
    focusY: number;
    opacity: number;
    blur: number;
  };
  appearance: {
    radius: RadiusPreset;
    density: DensityPreset;
    fontPreset: FontPreset;
    glass: boolean;
    shadow: ShadowPreset;
    decoration: number;
  };
  effects: NormalizedEffects;
  copy: NormalizedCopy;
  paletteIntent: {
    appearance: "light" | "dark";
    contrast: "soft" | "normal" | "high";
    temperature: "cool" | "neutral" | "warm";
  };
}
```

Recipe 不接受：

- CSS 选择器。
- CSS 字符串。
- JavaScript。
- Shell 命令。
- 任意文件路径。
- 未知布局和未注册效果。

最终 `ThemeDraftInput` 由 Recipe、选中图片、本地图片分析结果共同生成。

### 5.5 私有 AI 任务数据

```text
Application Support/Codex Themes/
├── themes/
├── ai-jobs/
│   └── <job-id>/
│       ├── job.json
│       ├── input/
│       ├── candidates/
│       ├── selected/
│       ├── recipe/
│       └── logs/
└── ai-cache/
```

`job.json` 可以保存：

- Job ID、阶段和错误。
- Codex thread ID。
- 用户原始描述。
- 候选图片元数据。
- 选中图片。
- Recipe 和校验结果。
- 创建、更新时间。

默认导出 `.codextheme` 时不包含 prompt、thread ID、日志和生成历史。

## 六、本地 Codex CLI / App Server 集成

### 6.1 CLI 发现

新增 `CodexCliLocator`：

- 优先使用用户在设置中手动选择的绝对路径。
- 检查 `/opt/homebrew/bin/codex`、`/usr/local/bin/codex` 等常见路径。
- 检查应用启动环境的 `PATH`。
- 可以通过受控的登录 Shell 探测路径，但不能拼接用户输入执行 Shell。
- 使用 `codex --version` 读取版本。
- 设置页提供“重新检测”和“选择 Codex CLI”。
- 记录最小支持版本；版本范围由第一阶段兼容性 Spike 后确定，不在计划中猜测。

首版不自动下载、不自动升级、不覆盖用户的 Codex CLI。

### 6.2 App Server 进程

新增 `CodexAppServerClient`：

- 使用 `child_process.spawn(executable, ["app-server", "--listen", "stdio://"])`。
- 整个应用实例最多维护一个 App Server 子进程。
- stdin/stdout 使用逐行 JSONL。
- stderr 进入脱敏后的应用日志，不当作协议数据。
- 连接后发送 `initialize` 和 `initialized`。
- 请求使用递增 ID，维护 pending map、超时、取消和错误映射。
- 应用退出时优雅关闭子进程。
- 意外退出时最多按退避策略自动恢复；运行中的 Job 标记为可重试，不默默重复生成图片。

禁止：

- Renderer 直接 `spawn`。
- 使用 Shell 字符串拼接执行 Codex。
- 打开非本地 WebSocket 监听。
- 使用 `danger-full-access` 或跳过所有审批。

### 6.3 协议兼容

- 只实现当前产品需要的最小协议子集。
- MVP 使用稳定方法：`initialize`、`account/read`、`model/list`、能力读取、`thread/start`、`thread/resume`、`turn/start`、`turn/steer`、`turn/interrupt`。
- 订阅 turn、item、agent message、image generation、error 和 account 事件。
- 开发时使用 `codex app-server generate-ts` / `generate-json-schema` 生成对应版本协议作为测试基线。
- 运行时对消息进行结构校验，接受未知字段和未知通知，避免 CLI 小版本新增字段导致应用崩溃。
- 启动时进行版本和能力探测，不仅依赖版本字符串。
- MVP 不使用 experimental `dynamicTools`；Recipe 使用稳定的 `outputSchema`。

### 6.4 登录与能力检测

- 使用 `account/read` 获取当前登录模式，不读取用户 token。
- 已登录用户直接复用 Codex CLI 状态。
- 未登录时通过 `account/login/start` 发起 Codex 管理的 ChatGPT 浏览器登录。
- 登录 URL 只交给 Electron `shell.openExternal`。
- 应用设置中不保存 ChatGPT token 或 API Key。
- 如果用户的 Codex CLI 使用 API Key，应用只显示认证模式，不读取或复制 Key。
- 使用模型和 Provider 能力接口判断 `imageGeneration` 是否可用。
- 没有图片生成能力时允许“上传图片 + 只生成 Recipe”或完全手动编辑。

### 6.5 Thread 与 Turn

- 每个 AI 主题 Job 对应一个 Codex thread。
- Job 保存 thread ID，可在应用重启后通过 `thread/resume` 继续。
- “更暖一点”“卡片更克制”等调整使用同一 thread。
- “重新生成图片”启动新 turn。
- “仅重新配主题”附带当前选中图片并要求新的 Recipe，不重新生成图片。
- 用户点击停止时调用 `turn/interrupt`。
- App Server 崩溃后不自动重放可能产生费用的 turn；由用户明确重试。

### 6.6 审批和权限

- Codex 工作目录仅设置为当前 `ai-jobs/<job-id>`。
- 只给任务目录写权限，参考图片先复制到任务目录。
- 任何命令执行、文件修改或额外权限请求都通过主进程转成受限 UI 事件。
- 路径不属于任务目录、请求未知权限或 UI 已失去 Job 上下文时默认拒绝。
- 主题生成正常路径不应需要执行任意 Shell 命令。
- Renderer 只能提交 `accept/decline/cancel` 等决策，不接触原始认证数据。

### 6.7 降级策略

| 场景 | 产品行为 |
| --- | --- |
| 未安装 Codex CLI | 显示安装提示和“选择路径”，手动主题编辑器仍可使用。 |
| CLI 版本过低 | 显示当前版本和最低支持版本，不启动 AI Job。 |
| 未登录 | 引导使用 Codex 管理的登录流程。 |
| 无图片生成能力 | 允许上传图片并生成 Recipe；手动编辑不受影响。 |
| 网络中断 | 保留 Job 和已生成候选图，允许稍后重试。 |
| App Server 崩溃 | 停止当前 turn、保留状态、重新连接后由用户决定是否重试。 |
| Recipe 不合法 | 本地校验拒绝，向同一 thread 发送精简修正请求；仍失败则允许手动编辑。 |
| 图片路径无效 | 不读取、不展示，Job 失败并给出可操作错误。 |

## 七、专属 `generate-codex-theme` Skill

### 7.1 目标

Skill 负责让 Codex 稳定完成两类任务：

1. 生成适合 Codex 桌面 UI 的主题候选图片。
2. 根据选中图片和用户意图输出符合约束的 Theme Recipe。

Skill 不负责：

- 应用主题。
- 修改 Codex 配置。
- 注入 CSS。
- 写入用户主题库。
- 绕过应用的 Recipe 校验。

### 7.2 存放与加载

Skill 作为应用资源随包发布，不安装到用户全局 Skill 目录：

```text
assets/skills/generate-codex-theme/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── references/
│   ├── theme-recipe-schema.md
│   ├── layout-catalog.md
│   ├── image-composition.md
│   └── examples.md
├── scripts/
│   └── validate-theme-recipe.mjs
└── assets/
    └── layout-references/
        ├── dream-banner.png
        ├── split-studio.png
        ├── full-canvas.png
        ├── terminal-grid.png
        ├── paper-board.png
        ├── minimal-focus.png
        └── retro-messenger.png
```

应用通过 App Server 的 Skill 输入项显式附带 Skill 路径，避免依赖模型自行搜索，也不污染用户全局配置。

### 7.3 SKILL.md 设计要求

- 名称使用 `generate-codex-theme`。
- Frontmatter 只包含 `name` 和清晰的 `description`。
- 主体保持精简，只包含核心工作流、决策顺序和必须遵守的限制。
- 详细 Schema、布局说明、构图规范和样例放入 `references/`。
- 不创建 README、安装指南、Changelog 等额外文件。
- 使用命令式说明。
- 当只需要 Recipe 时，明确禁止重新生成图片。
- 当生成图片时，要求：
  - 横向桌面构图。
  - 根据布局预留文字安全区。
  - 不在图片内生成标题、Logo、水印和 UI 控件。
  - 重要主体远离易裁剪边缘。
  - 颜色层次适合叠加真实 UI。
  - 同时考虑宽屏与紧凑裁剪。

### 7.4 单一数据源

避免 Skill、App Server `outputSchema` 和 TypeScript 类型漂移：

- `ThemeGenerationRecipe` TypeScript 类型是源定义。
- 构建脚本由源定义生成 JSON Schema。
- 同一 JSON Schema 用于：
  - `turn/start.outputSchema`。
  - 主进程运行时校验。
  - Skill 的 `theme-recipe-schema.md`。
  - 自动化测试 fixtures。
- `validate-theme-recipe.mjs` 只做确定性校验，不自行发明默认值。
- 默认值和主题补全统一由 `ThemeSynthesizer` 负责。

### 7.5 Skill 验证

- 使用 Skill Creator 的 `quick_validate.py` 校验目录和 frontmatter。
- 对以下真实任务做正向测试：
  - 深色雨夜主题，主体在右、文字在左。
  - 明亮纸张主题，低玻璃、轻微便签效果。
  - 终端网格主题，高对比度、低圆角、等宽字体。
  - 用户上传参考图，只生成 Recipe。
  - 图片不变，只把主题调整得更暖、更克制。
- 检查每次输出是否：
  - 生成了可捕获的 image generation item。
  - Recipe 严格通过 Schema。
  - 没有 CSS/JS/任意路径。
  - 没有在 recipe-only 模式重新生成图片。

## 八、Theme Synthesizer

Theme Synthesizer 是 AI 输出与现有主题引擎之间的可信边界。

### 8.1 输入

- 用户生成请求。
- 选中图片。
- Codex Theme Recipe。
- 本地图片分析结果。
- 当前主题引擎能力和布局列表。

### 8.2 本地图片分析

第一阶段：

- 复用现有 4 色提取。
- 计算平均亮度、对比度和主要色温。
- 判断图片更适合亮色还是暗色 UI。

第二阶段：

- 增加显著区域/主体位置分析。
- 增加左右留白和边缘复杂度分析。
- 自动建议 Hero 焦点、文字方向和遮罩强度。
- 生成 Wallpaper 的裁剪、模糊和透明度建议。

### 8.3 合并规则

1. 先校验 Recipe Schema。
2. 所有枚举必须来自当前注册列表。
3. 所有数值再次 clamp。
4. 颜色以本地图片分析为基础，AI 只表达色温、明暗和对比度意图。
5. 自动构建完整 light/dark 调色板。
6. 运行 WCAG 对比度检查。
7. 对文字不清晰的主题自动调整文字颜色和 scrim。
8. 生成现有 `ThemeDraftInput`。
9. 使用现有 `normalizeTheme` 再次归一化。
10. 只有通过本地校验的结果才能进入预览和保存。

### 8.4 生成后离线

- 图片和具体主题配置保存后，应用不再依赖 Codex thread。
- 切换主题不发起 AI 请求。
- 导出包包含具体图片和 v2 配置。
- 删除 AI Job 不能破坏已保存主题。

## 九、AI Theme Studio UI

### 9.1 新入口

导航收敛为：

- 主题画廊。
- AI 生成主题。
- 手动主题编辑器。
- 设置。

### 9.2 生成页面

提供：

- 主题描述输入。
- 深色/浅色/自动。
- 布局偏好/自动。
- 候选图片数量。
- 可选参考图片。
- 当前 Codex CLI 状态和登录状态。
- 生成、停止、重试。
- 流式状态和简化后的 Codex 进度。
- 候选图片卡片和选中操作。

不把完整通用 Codex 客户端作为目标，不展示与主题生成无关的命令和文件操作。

### 9.3 选图后

- 自动生成 Recipe。
- 显示布局、配色、焦点、遮罩、字体和效果的自动决策。
- 同时提供：
  - “采用并预览”。
  - “重新生成图片”。
  - “图片不变，重新配主题”。
  - “在高级编辑器中继续编辑”。
- 预览必须覆盖：
  - 首页/任务页。
  - 亮色/暗色。
  - 宽屏/紧凑。

### 9.4 多轮调整

在当前 Job/thread 上提供窄范围调整输入：

- “整体更暖一点。”
- “主图主体保留在右侧。”
- “减少玻璃和光晕。”
- “不换图片，改成 paper-board。”

应用必须明确显示本次调整是否会重新生成图片。

## 十、IPC 与主进程接口

建议新增：

```ts
getCodexCliStatus(): Promise<CodexCliStatus>;
selectCodexCli(): Promise<CodexCliStatus | null>;
refreshCodexCliStatus(): Promise<CodexCliStatus>;
startCodexLogin(): Promise<void>;

createAiThemeJob(input: ThemeGenerationRequest): Promise<AiThemeJob>;
startAiThemeJob(jobId: string): Promise<void>;
selectAiThemeCandidate(jobId: string, candidateId: string): Promise<void>;
refineAiThemeJob(jobId: string, instruction: string, regenerateImage: boolean): Promise<void>;
cancelAiThemeJob(jobId: string): Promise<void>;
retryAiThemeJob(jobId: string): Promise<void>;
getAiThemeJob(jobId: string): Promise<AiThemeJob>;
listAiThemeJobs(): Promise<AiThemeJobSummary[]>;
deleteAiThemeJob(jobId: string): Promise<void>;

respondToCodexApproval(requestId: string, decision: CodexApprovalDecision): Promise<void>;
onAiThemeJobChanged(cb: (job: AiThemeJob) => void): () => void;
onCodexApprovalRequested(cb: (request: CodexApprovalRequest) => void): () => void;
```

IPC 安全规则：

- 不提供“执行任意 Codex 方法”的通用 IPC。
- 不把原始子进程 stdin/stdout 暴露给 Renderer。
- 不接受 Renderer 提供的任意工作目录。
- Job ID、candidate ID、request ID 都在主进程重新验证。
- 本地文件通过现有自定义协议或新的受限资产协议展示。

## 十一、保留并完成现有本地主题能力

AI 功能不能取代以下收尾：

### 11.1 产品范围清理

- 移除市场、投稿、审核和 Supabase 页面、路由、IPC、类型与设置。
- `ThemeSource` 收敛为 `preset | custom | imported`。
- 历史 `.market-meta.json` 主题兼容显示为 `imported`，不删除用户数据。
- 移除相关网络请求和正式构建脚本。
- 更新 README 和产品文案。

### 11.2 编辑器闭环

- 增加 `loadThemeDraft(id)`。
- 画廊提供“编辑”和“复制并编辑”。
- 补齐高级参数 UI。
- 增加主图可视化焦点拖动。
- 增加描述、标签和完整调色板。
- 增加自动/手动暗色配色。
- 增加实时对比度警告。
- 增加 Stamp 上传或自动方形裁切。
- 增加任务页预览。
- 增加未保存修改保护。

### 11.3 主题包闭环

包结构继续使用：

```text
theme.json
hero.png
wallpaper.png       # 可选
stamp.png           # 可选
preview.webp
README.md           # 可选
LICENSE             # 可选
```

补齐：

- 压缩包不超过 24MB。
- 解压后不超过 32MB。
- 最多 16 个文件。
- 图片合计不超过 20MB。
- 只允许根目录白名单文件。
- 拒绝绝对路径、`..`、符号链接和未知可执行文件。
- 仅允许 PNG、JPEG、静态 WebP。
- 拒绝 APNG 和动画 WebP。
- Hero/Wallpaper 建议至少 1200×675，最大边长 8192。
- 预检使用系统临时目录，并清理取消、失败和过期目录。
- 明确处理更新、替换、安装为副本和取消。
- 整目录使用 staging + 原子重命名。
- 导出时自动生成标准预览。
- v1 继续可导入，导出统一为 v2。

## 十二、交付阶段

### M0：范围清理与基线固定

状态：✅ 已完成（2026-07-19 检查：运行路径中已无市场/投稿/审核/Supabase 代码，仅保留历史 `.market-meta.json` 的兼容迁移）

工作：

- 移除市场、投稿、审核、Supabase 正式运行路径。
- 迁移历史 `market` 主题来源。
- 修正 README 和导航。
- 固定当前 typecheck、15 项测试和 build 为回归基线。

验收：

- 应用内没有市场、投稿、审核和账号入口。
- 启动后不产生相关网络请求。
- 历史主题数据不丢失。

### M1：Codex CLI / App Server 基础桥接

状态：✅ 已完成（已按 codex-cli 0.144.5 `generate-ts` 协议基线比对修正；真机冒烟已通过：initialize 握手、`account/read`（chatgpt 登录）、`modelProvider/capabilities/read`（imageGeneration: true）、`thread/start`（workspace-write + never）均返回预期结果。最低支持版本暂定 0.144.0）

工作：

- CLI 路径发现、手动选择、版本和能力检测。
- App Server stdio 客户端与协议握手。
- 登录状态、模型和 image generation 能力读取。
- 主进程生命周期、错误、日志、超时和重连。
- 版本兼容 Spike，确定最小支持版本。

验收：

- 可在 UI 中可靠显示 CLI 安装、版本、登录和图片能力状态。
- Finder 启动时即使 PATH 不完整也能通过常见路径或手动选择工作。
- App Server 崩溃不会拖垮 Electron 应用。

### M2：生成契约与专属 Skill

状态：✅ 代码完成（Recipe 类型 / JSON Schema / 运行时校验（含未知键拒绝）/ Skill 目录均已就绪；五类代表性提示词的真机回归待做）

工作：

- 定义 `ThemeGenerationRecipe`。
- 生成并接入 `outputSchema`。
- 创建 `generate-codex-theme` Skill 和 references/assets。
- 增加 Recipe 运行时校验。
- 增加 Skill `quick_validate` 和固定测试案例。

验收：

- Skill 能生成可捕获图片。
- 五类代表性请求均产生合法 Recipe。
- Recipe 中不能出现 CSS、JS、Shell 或任意路径。

### M3：AI Theme Studio MVP

状态：🟡 代码完成（Job 目录/状态机/thread resume/候选图校验/合成保存/停止重试与 UI 均已实现），端到端真机验收待做

工作：

- AI Job 目录、持久化和状态机。
- 生成一张候选图。
- 接收 `imageGeneration.savedPath`，验证并复制图片。
- 选图后生成 Recipe。
- Theme Synthesizer 第一阶段。
- 预览、保存、应用。
- 停止和显式重试。

验收：

1. 用户输入一句描述。
2. 应用通过本地 Codex CLI 生成主题图。
3. 应用自动生成合法主题。
4. 用户可以预览、保存并一键应用。
5. 保存后断网仍能切换主题。

### M4：多候选与多轮调整

状态：🟡 部分完成（1/2/3 候选、参考图输入、thread 恢复、重新生成图片、图片不变重配主题已实现；流式进度细化、审批 UI、构图/留白分析未做）

工作：

- 1/2/3 张候选图。
- 参考图输入。
- 多轮 thread 恢复。
- 重新生成图片。
- 图片不变只重新生成 Recipe。
- 流式进度、审批 UI、取消和恢复。
- Theme Synthesizer 构图/留白/焦点分析。

验收：

- 用户能清楚知道每次操作是否会重新生成图片。
- 应用重启后可以恢复未完成 Job。
- App Server 重连不会自动重复产生生成消耗。

### M5：手动工作室和主题包闭环

状态：🟡 编辑器闭环与主题包安全闭环已完成（loadThemeDraft、画廊「编辑」/「复制并编辑」、原地更新保持 ID/UUID；包体积/文件数/白名单/动画图片/路径穿越/符号链接校验、系统临时目录预检与清理、staging + 原子重命名替换）；高级参数补齐、Stamp、任务页预览、导出标准预览图待做

工作：

- 编辑已有主题。
- 补齐高级参数和完整调色板。
- 任务页预览。
- Stamp。
- 导入安全限制、冲突处理和原子替换。
- 标准预览图生成。

验收：

- AI 生成主题和手动主题都能进入同一个高级编辑器。
- 自定义主题更新时 ID/UUID 保持不变。
- 损坏包和替换失败不会破坏旧主题。

### M6：稳定性、真机与发布

状态：⬜ 未开始

工作：

- 七布局 × 两模式 × 两尺寸截图基线。
- Codex DOM 更新降级。
- CLI 多版本兼容测试。
- 未安装、未登录、无图片能力、离线、超限、取消、崩溃场景。
- AI Job 数据清理和隐私检查。
- Electron Renderer sandbox 可行性与安全加固。
- DMG 真机安装、首次运行和升级冒烟。

验收：

- 主题生成失败不影响手动编辑和已有主题应用。
- 一键还原能移除全部样式、类名、图片 Blob 和装饰层。
- 不记录认证 token。
- 导出包默认不包含 prompt、thread ID 和 AI 日志。

## 十三、测试计划

### 13.1 现有主题引擎

- v1/v2 归一化。
- 参数裁剪。
- 亮暗色生成。
- 对比度。
- 七种布局编译。
- 主图、壁纸和效果变量。
- 新建、编辑、复制、删除、导出、导入。

### 13.2 App Server 客户端

- JSONL 半包、粘包和非法 JSON。
- 请求响应乱序。
- 未知通知。
- 请求超时。
- 子进程正常退出、异常退出和重启。
- 初始化前请求被拒。
- CLI 路径含空格。
- Finder 启动 PATH 不完整。
- 不兼容版本。

### 13.3 AI Job

- 合法状态迁移。
- 非法状态迁移拒绝。
- 取消时停止 turn。
- 重启恢复。
- 重试不覆盖已有候选图。
- 无效 `savedPath`、目录越界、文件不存在。
- 图片格式、大小和像素限制。
- 删除 Job 不删除已保存主题。

### 13.4 Recipe 与 Synthesizer

- JSON Schema 正负例。
- 未知字段和未知枚举。
- 极端数值 clamp。
- CSS/JS/路径注入拒绝。
- 自动 light/dark 配色。
- 对比度修正。
- Recipe-only 不生成图片。
- AI 输出失败后进入手动编辑的降级。

### 13.5 Skill

- `quick_validate.py`。
- SKILL.md 与 `agents/openai.yaml` 一致。
- references 可被按需读取。
- 七种布局参考与实际引擎一致。
- 代表性提示词回归。

### 13.6 主题包安全

- 路径穿越。
- 压缩炸弹。
- 文件数量和大小。
- APNG/动画 WebP。
- 未知文件和符号链接。
- staging 失败时旧主题完整。

## 十四、发布门槛

每个里程碑必须保持：

- `npm run typecheck` 通过。
- `npm test` 通过。
- `npm run build` 通过。

AI 主题 MVP 发布还必须满足：

- 已确定并在 UI 中检查最低 Codex CLI 版本。
- App Server 只使用本机 stdio。
- 没有任何认证 token 进入 Renderer、日志或主题包。
- AI 不能向主题系统注入任意 CSS/JS。
- 图片和 Recipe 都经过主进程本地校验。
- CLI 不可用时，手动编辑器、主题画廊和主题应用仍然可用。
- 生成完成后的主题可完全离线切换。

## 十五、优先级总结

P0，形成首个可用 AI 闭环：

1. M0 范围清理。
2. M1 App Server 基础桥接。
3. M2 Recipe 与专属 Skill。
4. M3 AI Theme Studio MVP。

P1，提升自由度和产品完整性：

5. M4 多候选、多轮调整、构图分析。
6. M5 手动编辑器和主题包闭环。

P2，发布质量：

7. M6 真机、兼容、安全与发布。

社区市场不在本计划范围内，也不作为任何阶段的前置依赖。

## 十六、进展记录

### 2026-07-19（计划 3.1）

- 复查代码基线：M0 清理已完成，M1–M3 全链路(Locator → App Server 客户端 → Job 状态机 → Synthesizer → 保存/应用)代码均已存在并接线。
- 用本机 codex-cli 0.144.5 `app-server generate-ts` 生成协议基线，按其修正 `job-service.ts`：
  - `turn/started` 事件按 `{ turn: { id } }` 解析（此前取 `turnId` 恒为 null，导致停止/interrupt 失效）；
  - 移除 `turn/start` 上形状错误的 `sandboxPolicy` / granular `approvalPolicy` 覆盖，策略统一在 `thread/start`/`thread/resume` 上声明（`sandbox: "workspace-write"` + `approvalPolicy: "never"`，cwd 限定在任务目录）；
  - text 输入项补上必需的 `text_elements`；
  - `selectCandidate`/`refineJob` 补 `ensureThread` 与 `activeJobId`（应用重启后可继续收事件）；
  - `savedPath` 复制前校验绝对路径/扩展名/大小；
  - recipe turn 结束但无合法配方时置为 failed（不再永久停留在 generating-recipe）；
  - 通知按 threadId 过滤，防跨线程串扰。
- Recipe 运行时校验与 Skill `validate-theme-recipe.mjs` 同步补齐未知键拒绝（对齐 JSON Schema 的 `additionalProperties: false`）。
- 新增离线测试（13 → 34 项）：Recipe 校验正负例、Synthesizer、App Server 客户端(假 JSONL 服务端覆盖半包/粘包/非法行/乱序/超时/进程退出)。
- M5 编辑器闭环：`loadThemeDraft` IPC 全链路、画廊「编辑」（自定义主题）与「复制并编辑」（任意主题）、编辑态用 `updateTheme` 原地保存（ID/UUID 不变）；修复原地保存时 `copyFile` 自拷贝会清空主图的问题。
- 真机冒烟（本机 codex-cli 0.144.5，ChatGPT 已登录）：initialize 握手、`account/read`、`modelProvider/capabilities/read`（imageGeneration: true）、`thread/start`（workspace-write + never + 任务目录 cwd）全部通过；`thread/resume` 对"从未有过 turn"的线程返回 no rollout found，`ensureThread` 的回退新建路径覆盖该情况。
- M5 主题包安全闭环：新增 `electron/engine/package-safety.ts`（24MB 包 / 32MB 解压 / 16 文件 / 20MB 图片上限、根目录白名单、路径穿越与符号链接拒绝、APNG/动画 WebP 检测、边长 ≤8192）；预检改用系统临时目录（取消/异常/启动均清理，崩溃遗留 `.backup-*` 会先尝试恢复）；安装改为 staging + 原子重命名，损坏包不再破坏旧主题。测试 34 → 47 项。
- 待办（真机）：五类代表性提示词回归、AI 生成端到端验收（涉及生成消耗，需用户确认后进行）；随后进入 M4 剩余项与 M5 编辑器高级参数/Stamp/任务页预览。
