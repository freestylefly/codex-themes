/**
 * [INPUT]: 依赖 electron-builder afterExtract 上下文与 Node 文件系统
 * [OUTPUT]: Windows 制品移除 Win11 D3D11 路径不需要的 Vulkan/SwiftShader 编译器
 * [POS]: Windows 体积门禁的最小裁剪钩子，macOS 与其他平台不做修改
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { rm } from "node:fs/promises";
import path from "node:path";

const OPTIONAL_WINDOWS_GPU_FILES = [
  "dxcompiler.dll",
  "dxil.dll",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json",
  "vulkan-1.dll",
];

export default async function trimElectronRuntime(context) {
  if (context.electronPlatformName !== "win32") return;
  await Promise.all(OPTIONAL_WINDOWS_GPU_FILES.map((name) => (
    rm(path.join(context.appOutDir, name), { force: true })
  )));
}
