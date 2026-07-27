# Codex Themes - 跨平台 Codex 桌面主题与创作社区客户端

Electron 43 + React 19 + TypeScript 5.9 + Astro 5 + Supabase + Vercel Functions

<directory>
.github/ - GitHub Actions 持续集成与签名发布门禁
api/ - Vercel HTTP 路由，承接目录、账号、订单、投稿与管理操作
assets/ - 内置主题、注入载荷、图标与安装器资源
docs/ - 产品截图与辅助说明
electron/ - 桌面主进程、平台 Adapter、主题引擎、认证、AI 与 IPC
native/ - 必须保留系统包身份的原生辅助程序
scripts/ - 构建、发布、迁移与真机验收脚本
server/ - HTTP 路由复用的认证、支付、主题包与下载实现
src/ - Electron Renderer 的 React 应用壳层与业务页面
supabase/ - 数据库迁移与数据库级验收
web/ - Astro 官网与下载/深链入口
</directory>

<config>
package.json - 版本、Node 约束与桌面/Web/测试/发布命令
electron.vite.config.ts - 主进程、preload 与 Renderer 构建及公开环境变量注入
electron-builder.yml - macOS/Windows 制品、签名、协议和安装器配置
vercel.json - 官网与 Serverless Functions 部署配置
tsconfig*.json - Node、Server、Web 与共享 TypeScript 编译边界
</config>

法则：平台差异只进入 electron/platform；令牌只进入主进程安全存储；发布声明必须由自动化或真机证据支撑。
