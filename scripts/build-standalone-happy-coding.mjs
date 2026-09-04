import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import AdmZip from "adm-zip";

const execFileAsync = promisify(execFile);
const defaultProjectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function executableEntry(zip, name, data) {
  zip.addFile(name, data, "", 0o755);
}

function installScript() {
  return `#!/bin/zsh
set -euo pipefail
SOURCE_DIR="\${0:A:h}/runtime"
INSTALL_DIR="\${HOME}/Library/Application Support/Happy Coding Theme"
AGENT_FILE="\${HOME}/Library/LaunchAgents/com.happycoding.theme.plist"
LABEL="com.happycoding.theme"

mkdir -p "\${INSTALL_DIR}" "\${HOME}/Library/LaunchAgents"
/usr/bin/ditto "\${SOURCE_DIR}" "\${INSTALL_DIR}"
/bin/chmod 755 "\${INSTALL_DIR}/happy-coding-runtime"

/bin/launchctl bootout "gui/\${UID}/\${LABEL}" >/dev/null 2>&1 || true
/bin/cat > "\${AGENT_FILE}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>\${LABEL}</string>
<key>ProgramArguments</key><array><string>\${INSTALL_DIR}/happy-coding-runtime</string><string>--watch</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>\${INSTALL_DIR}/runtime.log</string>
<key>StandardErrorPath</key><string>\${INSTALL_DIR}/runtime-error.log</string>
</dict></plist>
PLIST
/bin/launchctl bootstrap "gui/\${UID}" "\${AGENT_FILE}"
/bin/launchctl kickstart -k "gui/\${UID}/\${LABEL}"
/usr/bin/osascript -e 'display dialog "Happy Coding 已安装并开始应用。Codex 可能会自动重启一次。" buttons {"好"} default button "好" with title "Happy Coding"'
`;
}

function uninstallScript() {
  return `#!/bin/zsh
set -euo pipefail
INSTALL_DIR="\${HOME}/Library/Application Support/Happy Coding Theme"
AGENT_FILE="\${HOME}/Library/LaunchAgents/com.happycoding.theme.plist"
LABEL="com.happycoding.theme"

/bin/launchctl bootout "gui/\${UID}/\${LABEL}" >/dev/null 2>&1 || true
if [[ -x "\${INSTALL_DIR}/happy-coding-runtime" ]]; then
  "\${INSTALL_DIR}/happy-coding-runtime" --cleanup || true
fi
/bin/rm -f "\${AGENT_FILE}"
/bin/rm -rf "\${INSTALL_DIR}"
/usr/bin/osascript -e 'display dialog "Happy Coding 已卸载，Codex 已恢复官方外观。" buttons {"好"} default button "好" with title "Happy Coding"'
`;
}

export async function buildStandaloneThemePackage({
  projectRoot = defaultProjectRoot,
  outputDir = path.join(projectRoot, "output", "standalone"),
  runtimePath,
  archiveName = "Happy-Coding-macOS-arm64.zip",
} = {}) {
  const themeDir = path.join(projectRoot, "assets", "presets", "happy-coding-dog");
  const injectDir = path.join(projectRoot, "assets", "inject");
  const manifest = JSON.parse(await fs.readFile(path.join(themeDir, "theme.json"), "utf8"));
  const runtime = runtimePath ?? path.join(outputDir, "happy-coding-runtime");

  await fs.mkdir(outputDir, { recursive: true });
  if (!runtimePath) {
    const bun = path.join(process.env.HOME ?? "", ".bun", "bin", "bun");
    await execFileAsync(bun, [
      "build",
      path.join(projectRoot, "standalone", "happy-coding-runtime.ts"),
      "--compile",
      "--target=bun-darwin-arm64",
      `--outfile=${runtime}`,
    ]);
  }

  const zip = new AdmZip();
  const prefix = "Happy Coding/";
  executableEntry(zip, `${prefix}Install Happy Coding.command`, Buffer.from(installScript()));
  executableEntry(zip, `${prefix}Uninstall Happy Coding.command`, Buffer.from(uninstallScript()));
  executableEntry(zip, `${prefix}runtime/happy-coding-runtime`, await fs.readFile(runtime));
  zip.addLocalFile(path.join(injectDir, "dream-skin.css"), `${prefix}runtime/inject`);
  zip.addLocalFile(path.join(injectDir, "renderer-inject.js"), `${prefix}runtime/inject`);
  zip.addLocalFile(path.join(themeDir, "theme.json"), `${prefix}runtime/theme`);

  const themeAssets = new Set([manifest.hero, manifest.preview, manifest.wallpaper, manifest.stamp].filter(Boolean));
  for (const asset of themeAssets) {
    zip.addLocalFile(path.join(themeDir, asset), `${prefix}runtime/theme`);
  }
  zip.addFile(`${prefix}package.json`, Buffer.from(`${JSON.stringify({
    name: "Happy Coding",
    themeId: manifest.id,
    themeVersion: manifest.version,
    engineVersion: "1.2.4",
    platform: "darwin-arm64",
  }, null, 2)}\n`));

  const archivePath = path.join(outputDir, archiveName);
  zip.writeZip(archivePath);
  return { archivePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildStandaloneThemePackage();
  console.log(result.archivePath);
}
