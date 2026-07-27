# electron/platform/
> L2 | 父级: ../CLAUDE.md

codex-macos.ts: macOS Codex bundle 发现、参数启动、进程停止和端口归属实现
codex-windows.ts: Windows Store 包发现、AUMID 激活、包族身份与 loopback CDP 验证实现
codex-windows.test.ts: Windows Adapter 的解析、身份、授权停止与启动测试
index.ts: 根据 process.platform 选择唯一桌面 Adapter 的组合入口
types.ts: 控制器依赖的平台接口、安装信息、停止授权和启动结果契约

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
