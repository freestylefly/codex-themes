# src/
> L2 | 父级: ../CLAUDE.md

assets/: Renderer 内置头像与布局预览资源
components/: 可复用预览、编辑、状态、通知和确认交互
pages/: 画廊、编辑器、AI、创作者、管理、账号、设置与引导页面
api.ts: preload 接口的类型化单点访问
App.tsx: 响应式应用壳层、导航、侧栏和页面路由
galleryThemes.ts: 画廊主题分类与合并规则
index.html: Renderer HTML 入口
layoutCatalog.ts: 三种主题布局族的元数据目录
layoutPreviewAssets.ts: 布局预览静态资源映射
main.tsx: React 根节点挂载与全局样式加载
store.ts: Zustand 客户端状态、IPC 调用和跨页面业务动作
styles.css: 应用壳层、页面、组件与响应式视觉规则
themePreview.ts: 主题预览数据投影

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
