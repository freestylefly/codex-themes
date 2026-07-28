import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertReleaseTag,
  readUpdateEntry,
  sha512File,
} from "./package-macos.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(SCRIPT_PATH), "..");

export function parseWindowsArch(args = process.argv.slice(2)) {
  const index = args.indexOf("--arch");
  const arch = index >= 0 ? args[index + 1] : undefined;
  if (arch !== "x64") {
    throw new Error("Windows packaging requires --arch x64.");
  }
  return arch;
}

export function assertWindowsPackagingEnvironment(
  targetArch,
  platform = process.platform,
  runnerArch = process.arch,
) {
  if (platform !== "win32" || targetArch !== "x64" || runnerArch !== "x64") {
    throw new Error(
      `Windows x64 packaging requires win32/x64, received ${platform}/${runnerArch} for ${targetArch}.`,
    );
  }
}

export function getWindowsArtifactPaths(rootDir, version) {
  const releaseDir = path.join(rootDir, "release");
  const baseName = `Codex-Themes-${version}-win-x64`;
  return {
    releaseDir,
    installer: path.join(releaseDir, `${baseName}.exe`),
    installerBlockmap: path.join(releaseDir, `${baseName}.exe.blockmap`),
    updateMetadata: path.join(releaseDir, "latest.yml"),
  };
}

export function assertWindowsArtifactsExist(artifacts) {
  const required = [
    artifacts.installer,
    artifacts.installerBlockmap,
    artifacts.updateMetadata,
  ];
  const missing = required.filter((file) => !fs.existsSync(file) || fs.statSync(file).size === 0);
  if (missing.length > 0) {
    throw new Error(
      `Missing or empty release artifacts: ${missing.map((file) => path.basename(file)).join(", ")}`,
    );
  }
}

export function verifyWindowsUpdateMetadata(metadataText, artifacts) {
  const entry = readUpdateEntry(metadataText, path.basename(artifacts.installer));
  const stat = fs.statSync(artifacts.installer);
  if (entry.size !== stat.size || entry.sha512 !== sha512File(artifacts.installer)) {
    throw new Error(`Update metadata does not match ${path.basename(artifacts.installer)}.`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with status ${result.status}.`);
  }
}

export async function main(args = process.argv.slice(2)) {
  const arch = parseWindowsArch(args);
  assertWindowsPackagingEnvironment(arch);

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"),
  );
  assertReleaseTag(process.env.RELEASE_TAG, packageJson.version);

  run(process.execPath, [
    "scripts/build-dist.mjs",
    "--platform",
    "win",
    "--arch",
    arch,
  ]);

  const artifacts = getWindowsArtifactPaths(ROOT_DIR, packageJson.version);
  assertWindowsArtifactsExist(artifacts);
  verifyWindowsUpdateMetadata(
    fs.readFileSync(artifacts.updateMetadata, "utf8"),
    artifacts,
  );

  console.log(`Windows x64 release artifacts are ready for v${packageJson.version}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
