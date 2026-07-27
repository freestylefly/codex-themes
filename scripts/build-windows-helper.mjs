/**
 * [INPUT]: 依赖 native/windows/CodexActivator.cs 与系统 C# 编译器
 * [OUTPUT]: 生成 assets/windows/codex-activator.exe
 * [POS]: scripts 的 Windows 原生辅助程序可复现构建入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(repoRoot, "native", "windows", "CodexActivator.cs");
const outputDir = path.join(repoRoot, "assets", "windows");
const outputPath = path.join(outputDir, "codex-activator.exe");

function run(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = options.capture ? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() : "";
    throw new Error(`${file} exited with code ${result.status}${details ? `: ${details}` : ""}`);
  }
  return result;
}

function frameworkCompilerCandidates() {
  const windowsRoot = process.env.WINDIR || "C:\\Windows";
  return [
    path.join(windowsRoot, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(windowsRoot, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
  ];
}

function buildWithFrameworkCompiler(compiler) {
  fs.mkdirSync(outputDir, { recursive: true });
  run(compiler, [
    "/nologo",
    "/target:exe",
    "/platform:x64",
    "/optimize+",
    `/out:${outputPath}`,
    sourcePath,
  ]);
}

function buildWithDotnet() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-activator-build-"));
  const projectPath = path.join(tempRoot, "CodexActivator.csproj");
  const copiedSource = path.join(tempRoot, "CodexActivator.cs");
  fs.copyFileSync(sourcePath, copiedSource);
  fs.writeFileSync(
    projectPath,
    `<Project Sdk="Microsoft.NET.Sdk">\n` +
      `  <PropertyGroup>\n` +
      `    <OutputType>Exe</OutputType>\n` +
      `    <TargetFramework>net8.0-windows</TargetFramework>\n` +
      `    <RuntimeIdentifier>win-x64</RuntimeIdentifier>\n` +
      `    <SelfContained>true</SelfContained>\n` +
      `    <PublishSingleFile>true</PublishSingleFile>\n` +
      `    <PublishTrimmed>false</PublishTrimmed>\n` +
      `    <EnableCompressionInSingleFile>true</EnableCompressionInSingleFile>\n` +
      `    <DebugType>none</DebugType>\n` +
      `    <Nullable>disable</Nullable>\n` +
      `    <ImplicitUsings>disable</ImplicitUsings>\n` +
      `    <AssemblyName>codex-activator</AssemblyName>\n` +
      `  </PropertyGroup>\n` +
      `</Project>\n`,
    "utf8",
  );
  try {
    run("dotnet", [
      "publish",
      projectPath,
      "--configuration",
      "Release",
      "--output",
      outputDir,
      "--nologo",
    ]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.platform !== "win32") {
  throw new Error("The Codex Windows activation helper can only be built on Windows.");
}

const frameworkCompiler = frameworkCompilerCandidates().find((candidate) => fs.existsSync(candidate));
if (frameworkCompiler) {
  buildWithFrameworkCompiler(frameworkCompiler);
  console.log(`Built Windows activation helper with ${frameworkCompiler}`);
} else {
  buildWithDotnet();
  console.log("Built Windows activation helper with the dotnet SDK fallback.");
}

if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
  throw new Error(`Windows activation helper was not created at ${outputPath}.`);
}
console.log(outputPath);
