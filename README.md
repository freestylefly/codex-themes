# Codex Themes

macOS 桌面应用:不修改 OpenAI Codex 桌面端安装包,通过本机 CDP(Chrome DevTools Protocol)注入纯视觉装饰层,给 Codex 换肤。一键应用、一键还原。

注入引擎移植自 MIT 许可的 [Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)(见 [NOTICE.md](./NOTICE.md)),设计方案见 [DESIGN.md](./DESIGN.md)。

官网:[theme.codexguide.ai](https://theme.codexguide.ai) · 浏览主题、下载应用，并通过
`codexthemes://theme/<theme-id>` 直接在桌面应用中定位主题。

## 功能

- **主题画廊**:10 款内置预设,一键应用 / 一键还原官方外观
- **自定义编辑器**:选一张图自动取色(popularity + 饱和度加权量化,零第三方依赖),实时预览后保存为本地主题
- **AI 主题工作室**(开发中):使用本机 Codex CLI 生成主题图与结构化主题配方,保存后完全离线可用
- **主题包**:`.codextheme`(zip)双击导入 / 右键导出,与原生 Codex-Dream-Skin schema v1 完全兼容
- **常驻菜单栏**:注入守护活在主进程,Codex 刷新 / 新开窗口自动重注入;可选 Codex 启动自动应用、开机自启、自动更新

## 开发

```bash
npm install
npm run dev          # electron-vite 开发模式(首次启动进入引导页)
npm run dev:web      # Astro 官网开发模式
npm run typecheck    # 主进程 + 渲染进程双 tsconfig 检查
npm run build        # 产物到 dist/
npm run build:web    # 构建静态官网到 web/dist/
npm run test         # 主题引擎单元测试
```

要求:Node >= 22(CDP 客户端依赖内置 WebSocket / fetch),macOS,已安装 Codex 桌面端(`/Applications/ChatGPT.app`)。

## 打包

```bash
npm run dist         # 构建 DMG + zip 到 release/
npm run dist:dir     # 只出未打包目录(快速冒烟)
```

未配置签名时产出未签名 DMG(首次打开需在「系统设置 → 隐私与安全性」放行);`electron-builder.yml` 已预留签名与 GitHub Releases 自动更新配置。

## 安全边界

- 调试端口只监听 `127.0.0.1`,连接前校验端口进程必须属于 Codex 本体(`lsof` + `ps` 溯源)
- 只注入 `type=page` 且 `app://` 的目标,并用 DOM 探针确认是 Codex 界面
- 装饰层恒为 `pointer-events: none`,不拦截任何原生交互
- **绝不**触碰 `app.asar`、代码签名、API Key / Base URL;`~/.codex/config.toml` 只备份 / 还原外观相关键
- 重启用户正在运行的 Codex 前必须获得明确授权(开启「Codex 启动自动应用」即视为常驻授权)

## License

MIT(含 Codex-Dream-Skin 移植部分,原始版权声明保留于 NOTICE.md)。
