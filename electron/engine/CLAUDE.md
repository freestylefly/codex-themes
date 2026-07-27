# engine/
> L2 | 父级: ../CLAUDE.md

cdp.test.ts: CDP 连接、目标选择与协议异常回归测试
cdp.ts: CDP 会话封装，连接经平台身份验证的 Codex 调试端口
compiler.ts: 规范化主题到注入 CSS 的纯编译器
constants.ts: 主题包格式、资源扩展名与安全上限常量
home-detection.ts: Codex 原生/主题首页可见性判定，避免覆盖活动会话
layout-catalog.test.ts: 布局目录完整性、隐藏规则与预览资源门禁
normalize.ts: v1/v2 清单规范化、色板派生与对比度校验
package-safety.test.ts: 主题包路径、动画资源与原子导入安全测试
package-safety.ts: 主题包文件白名单、遍历防护与动画检测
payload.ts: 加载主题资源并组合注入载荷
theme.test.ts: 规范化、编译与全部内置主题载荷回归测试
verify.ts: 注入后 DOM 与主题状态验证
watcher.ts: Codex 导航/刷新后的主题重注入守护器

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
