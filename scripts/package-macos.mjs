import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(SCRIPT_PATH), "..");

export const MAC_ARCHES = ["arm64", "x64"];
export const REQUIRED_ENV_KEYS = [
  "APPLE_ID",
  "APPLE_APP_PWD",
  "APPLE_TEAM_ID",
  "MACOS_SIGNING_IDENTITY",
];

export function parseMacArch(args = process.argv.slice(2)) {
  const index = args.indexOf("--arch");
  const arch = index >= 0 ? args[index + 1] : undefined;
  if (!MAC_ARCHES.includes(arch)) {
    throw new Error("macOS packaging requires --arch arm64 or --arch x64.");
  }
  return arch;
}

export function assertMacPackagingEnvironment(
  targetArch,
  platform = process.platform,
  runnerArch = process.arch,
) {
  if (platform !== "darwin" || runnerArch !== targetArch) {
    throw new Error(
      `macOS ${targetArch} packaging requires darwin/${targetArch}, received ${platform}/${runnerArch}.`,
    );
  }
}

export function assertRequiredEnv(env = process.env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export function assertReleaseTag(tag, version) {
  if (!tag) return;
  const expected = `v${version}`;
  if (tag !== expected) {
    throw new Error(`Release tag ${tag} does not match package version ${expected}.`);
  }
}

export function getMacArtifactPaths(rootDir, version, arch) {
  if (!MAC_ARCHES.includes(arch)) {
    throw new Error(`Unsupported macOS architecture: ${arch}.`);
  }
  const releaseDir = path.join(rootDir, "release");
  const baseName = `Codex-Themes-${version}-mac-${arch}`;
  return {
    releaseDir,
    dmg: path.join(releaseDir, `${baseName}.dmg`),
    dmgBlockmap: path.join(releaseDir, `${baseName}.dmg.blockmap`),
    zip: path.join(releaseDir, `${baseName}.zip`),
    zipBlockmap: path.join(releaseDir, `${baseName}.zip.blockmap`),
    generatedMetadata: path.join(releaseDir, "latest-mac.yml"),
    updateMetadata: path.join(releaseDir, `latest-mac-${arch}.yml`),
  };
}

export function assertArtifactsExist(artifacts, includeGeneratedMetadata = false) {
  const required = [
    artifacts.dmg,
    artifacts.dmgBlockmap,
    artifacts.zip,
    artifacts.zipBlockmap,
    includeGeneratedMetadata ? artifacts.generatedMetadata : artifacts.updateMetadata,
  ];
  const missing = required.filter((file) => !fs.existsSync(file) || fs.statSync(file).size === 0);
  if (missing.length > 0) {
    throw new Error(
      `Missing or empty release artifacts: ${missing.map((file) => path.basename(file)).join(", ")}`,
    );
  }
}

function locateUpdateEntry(lines, artifactName) {
  const urlLine = `- url: ${artifactName}`;
  const start = lines.findIndex((line) => line.trim() === urlLine);
  if (start === -1) {
    throw new Error(`Update metadata does not contain ${artifactName}.`);
  }

  let shaIndex = -1;
  let sizeIndex = -1;
  for (let index = start + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("- url:") || (!lines[index].startsWith(" ") && trimmed)) break;
    if (trimmed.startsWith("sha512:")) shaIndex = index;
    if (trimmed.startsWith("size:")) sizeIndex = index;
  }

  if (shaIndex === -1 || sizeIndex === -1) {
    throw new Error(`Update metadata entry is incomplete for ${artifactName}.`);
  }
  return { shaIndex, sizeIndex };
}

export function updateArtifactMetadata(metadataText, artifactName, sha512, size) {
  const hadTrailingNewline = metadataText.endsWith("\n");
  const lines = metadataText.replace(/\r\n/g, "\n").split("\n");
  if (hadTrailingNewline) lines.pop();
  const { shaIndex, sizeIndex } = locateUpdateEntry(lines, artifactName);
  const shaIndent = lines[shaIndex].match(/^\s*/)?.[0] ?? "";
  const sizeIndent = lines[sizeIndex].match(/^\s*/)?.[0] ?? "";
  lines[shaIndex] = `${shaIndent}sha512: ${sha512}`;
  lines[sizeIndex] = `${sizeIndent}size: ${size}`;
  return `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`;
}

export function readUpdateEntry(metadataText, artifactName) {
  const lines = metadataText.replace(/\r\n/g, "\n").split("\n");
  const { shaIndex, sizeIndex } = locateUpdateEntry(lines, artifactName);
  return {
    sha512: lines[shaIndex].trim().slice("sha512:".length).trim(),
    size: Number(lines[sizeIndex].trim().slice("size:".length).trim()),
  };
}

export function sha512File(file) {
  return crypto.createHash("sha512").update(fs.readFileSync(file)).digest("base64");
}

export function verifyUpdateMetadata(metadataText, artifacts) {
  for (const file of [artifacts.zip, artifacts.dmg]) {
    const entry = readUpdateEntry(metadataText, path.basename(file));
    const stat = fs.statSync(file);
    if (entry.size !== stat.size || entry.sha512 !== sha512File(file)) {
      throw new Error(`Update metadata does not match ${path.basename(file)}.`);
    }
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with status ${result.status}.`);
  }
}

function assertSigningIdentity(identity) {
  const result = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || !result.stdout.includes(identity)) {
    throw new Error("The configured macOS signing identity is unavailable.");
  }
  process.stdout.write(result.stdout);
}

async function regenerateDmgBlockmap(artifacts) {
  const require = createRequire(import.meta.url);
  const { buildBlockMap } = require(
    "app-builder-lib/out/targets/blockmap/blockmap.js",
  );
  await buildBlockMap(artifacts.dmg, "gzip", artifacts.dmgBlockmap);
}

export async function main(args = process.argv.slice(2)) {
  const arch = parseMacArch(args);
  assertMacPackagingEnvironment(arch);
  assertRequiredEnv();

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"),
  );
  assertReleaseTag(process.env.RELEASE_TAG, packageJson.version);
  assertSigningIdentity(process.env.MACOS_SIGNING_IDENTITY);

  run(process.execPath, [
    "scripts/build-dist.mjs",
    "--platform",
    "mac",
    "--arch",
    arch,
  ]);

  const artifacts = getMacArtifactPaths(ROOT_DIR, packageJson.version, arch);
  assertArtifactsExist(artifacts, true);

  run("codesign", [
    "--force",
    "--sign",
    process.env.MACOS_SIGNING_IDENTITY,
    "--timestamp",
    "--options",
    "runtime",
    artifacts.dmg,
  ]);
  run("codesign", ["--verify", "--verbose=2", artifacts.dmg]);
  run("xcrun", [
    "notarytool",
    "submit",
    artifacts.dmg,
    "--apple-id",
    process.env.APPLE_ID,
    "--team-id",
    process.env.APPLE_TEAM_ID,
    "--password",
    process.env.APPLE_APP_PWD,
    "--wait",
    "--timeout",
    "30m",
  ]);
  run("xcrun", ["stapler", "staple", artifacts.dmg]);
  run("xcrun", ["stapler", "validate", artifacts.dmg]);
  run("spctl", [
    "-a",
    "-vv",
    "--type",
    "open",
    "--context",
    "context:primary-signature",
    artifacts.dmg,
  ]);

  await regenerateDmgBlockmap(artifacts);

  const dmgStat = fs.statSync(artifacts.dmg);
  const metadata = fs.readFileSync(artifacts.generatedMetadata, "utf8");
  const updatedMetadata = updateArtifactMetadata(
    metadata,
    path.basename(artifacts.dmg),
    sha512File(artifacts.dmg),
    dmgStat.size,
  );
  fs.writeFileSync(artifacts.updateMetadata, updatedMetadata);
  fs.rmSync(artifacts.generatedMetadata);

  assertArtifactsExist(artifacts);
  verifyUpdateMetadata(updatedMetadata, artifacts);
  run("gzip", ["-t", artifacts.dmgBlockmap]);
  run("gzip", ["-t", artifacts.zipBlockmap]);

  console.log(`macOS ${arch} release artifacts are ready for v${packageJson.version}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
