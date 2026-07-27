/**
 * [INPUT]: 依赖 electron/main.ts、electron-builder.yml 与 assets/build/installer.nsh 文本
 * [OUTPUT]: 验证 Windows 应用身份/图标、Win11 x64、每用户无提权和安装注册清理
 * [POS]: scripts 的 Windows 桌面静态门禁，真实生命周期仍由 Windows Sandbox 验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const builderConfig = fs.readFileSync(path.join(root, "electron-builder.yml"), "utf8");
const electronMain = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const installerInclude = fs.readFileSync(
  path.join(root, "assets", "build", "installer.nsh"),
  "utf8",
);

test("Windows NSIS stays per-user and non-elevating", () => {
  assert.match(builderConfig, /nsis:\s[\s\S]*?perMachine:\s*false/);
  assert.match(builderConfig, /nsis:\s[\s\S]*?allowElevation:\s*false/);
  assert.doesNotMatch(installerInclude, /WriteReg(?:Str|None|DWORD)\s+HKLM/);
  assert.match(installerInclude, /CurrentBuildNumber/);
  assert.match(installerInclude, /IsWow64Process2/);
});

test("Windows package keeps only supported locales and the D3D11 runtime", () => {
  assert.match(builderConfig, /electronLanguages:\s*\n\s*- en-US\s*\n\s*- zh-CN/);
  assert.match(builderConfig, /afterExtract: scripts\/trim-electron-runtime\.mjs/);
  assert.match(builderConfig, /afterPack: scripts\/sign-windows-helper\.mjs/);
});

test("Windows development and packaged windows keep the branded app identity", () => {
  assert.match(electronMain, /app\.setAppUserModelId\("com\.codexthemes\.app"\)/);
  assert.match(electronMain, /path\.join\(paths\.assetsRoot, "build", "icon\.ico"\)/);
  assert.match(builderConfig, /win:\s[\s\S]*?icon: assets\/build\/icon\.ico/);
});

test("Windows NSIS owns protocol and theme-package registrations", () => {
  const topLevelConfig = builderConfig.slice(0, builderConfig.indexOf("\nwin:"));
  assert.doesNotMatch(topLevelConfig, /^fileAssociations:/m);
  assert.doesNotMatch(topLevelConfig, /^protocols:/m);
  assert.match(installerInclude, /!macro customInstall/);
  assert.match(installerInclude, /WriteRegStr HKCU "\$\{CODEX_THEMES_PROTOCOL_KEY\}" "URL Protocol" ""/);
  assert.match(installerInclude, /WriteRegStr HKCU "\$\{CODEX_THEME_EXTENSION_KEY\}" "" "\$\{CODEX_THEME_PROGID\}"/);

  const quotedLaunchCommand = /\$\\"\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}\$\\" \$\\"%1\$\\"/;
  assert.match(installerInclude, quotedLaunchCommand);
});

test("Windows NSIS removes only registrations still owned by this install", () => {
  assert.match(installerInclude, /!macro customUnInstall/);

  const protocolRead = installerInclude.indexOf(
    'ReadRegStr $0 HKCU "${CODEX_THEMES_PROTOCOL_KEY}\\shell\\open\\command" ""',
  );
  const protocolDelete = installerInclude.indexOf(
    'DeleteRegKey HKCU "${CODEX_THEMES_PROTOCOL_KEY}"',
  );
  const fileRead = installerInclude.indexOf(
    'ReadRegStr $0 HKCU "${CODEX_THEME_PROGID_KEY}\\shell\\open\\command" ""',
  );
  const fileDelete = installerInclude.indexOf(
    'DeleteRegKey HKCU "${CODEX_THEME_PROGID_KEY}"',
  );

  assert.ok(protocolRead >= 0 && protocolDelete > protocolRead);
  assert.ok(fileRead >= 0 && fileDelete > fileRead);
  assert.match(installerInclude, /ReadRegStr \$1 HKCU "\$\{CODEX_THEME_EXTENSION_KEY\}" ""/);
  assert.match(installerInclude, /\$\{If\} \$1 == "\$\{CODEX_THEME_PROGID\}"/);
  assert.match(installerInclude, /ReadRegStr \$0 HKCU "\$\{WINDOWS_RUN_KEY\}" "Codex Themes"/);
  assert.match(installerInclude, /DeleteRegValue HKCU "\$\{WINDOWS_RUN_KEY\}" "Codex Themes"/);
});
