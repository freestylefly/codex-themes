# electron/
> L2 | 父级: ../CLAUDE.md

## 子模块
ai/: Codex App Server 驱动的连续主题创作与图片分析
auth/: Supabase OAuth、会话状态机与 Electron 安全存储
codex-cli/: 独立 CLI 发现、版本探测和 App Server 生命周期
commerce/: 客户端目录、权益、积分、投稿与订单编排
config/: Codex 配置文件的读取、补丁与精确恢复
engine/: CDP 会话、主题编译、注入、验证和守护
platform/: macOS/Windows Codex 发现、启动、停止与身份校验 Adapter
shared/: 主进程、preload 和 Renderer 共用的数据契约
test-stubs/: Node 测试使用的 Electron 最小替身
themes/: 预设、本地、已购主题的文件存储与图像处理

## 顶层成员
controller.ts: 桌面业务总编排，维持主题应用/恢复的事务状态与 AI 生命周期
controller-platform.test.ts: 平台 Adapter 与控制器协作契约测试
deep-links.ts: codexthemes 协议的白名单解析与结构化动作
deep-links.test.ts: 深链信任边界测试
gallery-themes.test.ts: 本地、预设、目录和权益合并规则测试
ipc.ts: 主进程能力的类型化 IPC 注册与事件转发
launch-arguments.ts: 首实例/次实例命令行参数分类
launch-arguments.test.ts: Windows 引号与深链启动参数测试
main.ts: 单实例、窗口、托盘、认证、更新和控制器的组合根
paths.ts: 开发与打包状态下的资源和用户数据路径
picked-images.ts: 文件选择后图片路径的短期令牌注册
preload.ts: contextBridge 暴露的最小 Renderer 接口
settings.ts: 用户设置持久化与兼容默认值
tray.ts: 托盘状态和打开/退出动作
updater.ts: electron-updater 生命周期与用户确认
updater-platform.ts: 平台更新文件名和手动下载文案
updater-platform.test.ts: 更新平台映射测试
updater-state.ts: 更新状态归一化
updater-state.test.ts: 更新状态机测试

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
