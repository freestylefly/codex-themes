import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(SCRIPT_PATH), "..");

function stringOption(args, flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
}

function sha512File(file) {
  return crypto.createHash("sha512").update(fs.readFileSync(file)).digest("base64");
}

function parseMetadata(text, label) {
  const parsed = parse(text);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.files)) {
    throw new Error(`${label} is not valid update metadata.`);
  }
  return parsed;
}

function requiredEntry(document, artifactName, label) {
  const entry = document.files.find((candidate) => candidate?.url === artifactName);
  if (
    !entry ||
    typeof entry.sha512 !== "string" ||
    !Number.isInteger(entry.size) ||
    entry.size <= 0
  ) {
    throw new Error(`${label} does not contain a complete ${artifactName} entry.`);
  }
  return {
    url: artifactName,
    sha512: entry.sha512,
    size: entry.size,
  };
}

function assertVersion(document, version, label) {
  if (String(document.version) !== version) {
    throw new Error(
      `${label} version ${String(document.version)} does not match package version ${version}.`,
    );
  }
}

function verifyEntry(entry, releaseDir) {
  const artifact = path.join(releaseDir, entry.url);
  if (!fs.existsSync(artifact) || fs.statSync(artifact).size === 0) {
    throw new Error(`Missing or empty release artifact: ${entry.url}.`);
  }
  const size = fs.statSync(artifact).size;
  const sha512 = sha512File(artifact);
  if (entry.size !== size || entry.sha512 !== sha512) {
    throw new Error(`Update metadata does not match ${entry.url}.`);
  }
}

export function mergeMacMetadata({
  arm64Text,
  x64Text,
  version,
  releaseDir,
}) {
  const arm64 = parseMetadata(arm64Text, "ARM64 metadata");
  const x64 = parseMetadata(x64Text, "x64 metadata");
  assertVersion(arm64, version, "ARM64 metadata");
  assertVersion(x64, version, "x64 metadata");

  const names = {
    arm64Zip: `Codex-Themes-${version}-mac-arm64.zip`,
    arm64Dmg: `Codex-Themes-${version}-mac-arm64.dmg`,
    x64Zip: `Codex-Themes-${version}-mac-x64.zip`,
    x64Dmg: `Codex-Themes-${version}-mac-x64.dmg`,
  };
  const files = [
    requiredEntry(arm64, names.arm64Zip, "ARM64 metadata"),
    requiredEntry(arm64, names.arm64Dmg, "ARM64 metadata"),
    requiredEntry(x64, names.x64Zip, "x64 metadata"),
    requiredEntry(x64, names.x64Dmg, "x64 metadata"),
  ];
  for (const entry of files) verifyEntry(entry, releaseDir);

  const releaseDate = typeof arm64.releaseDate === "string"
    ? arm64.releaseDate
    : typeof x64.releaseDate === "string"
      ? x64.releaseDate
      : undefined;
  return stringify({
    version,
    files,
    path: names.arm64Zip,
    sha512: files[0].sha512,
    ...(releaseDate ? { releaseDate } : {}),
  }, { lineWidth: 0 });
}

export function assertMergedMacMetadata(metadataText, version, releaseDir) {
  const document = parseMetadata(metadataText, "Merged macOS metadata");
  assertVersion(document, version, "Merged macOS metadata");
  const expectedNames = [
    `Codex-Themes-${version}-mac-arm64.zip`,
    `Codex-Themes-${version}-mac-arm64.dmg`,
    `Codex-Themes-${version}-mac-x64.zip`,
    `Codex-Themes-${version}-mac-x64.dmg`,
  ];
  if (
    document.path !== expectedNames[0] ||
    document.sha512 !== document.files[0]?.sha512 ||
    document.files.map((entry) => entry?.url).join("\n") !== expectedNames.join("\n")
  ) {
    throw new Error("Merged macOS metadata does not satisfy the architecture contract.");
  }
  for (const entry of document.files) verifyEntry(entry, releaseDir);
}

export function main(args = process.argv.slice(2)) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"),
  );
  const releaseDir = path.resolve(
    stringOption(args, "--release-dir", path.join(ROOT_DIR, "release")),
  );
  const arm64Path = path.resolve(
    stringOption(args, "--arm64", path.join(releaseDir, "latest-mac-arm64.yml")),
  );
  const x64Path = path.resolve(
    stringOption(args, "--x64", path.join(releaseDir, "latest-mac-x64.yml")),
  );
  const outputPath = path.resolve(
    stringOption(args, "--output", path.join(releaseDir, "latest-mac.yml")),
  );
  const version = stringOption(args, "--version", packageJson.version);

  for (const file of [arm64Path, x64Path]) {
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      throw new Error(`Missing or empty macOS metadata input: ${path.basename(file)}.`);
    }
  }
  const merged = mergeMacMetadata({
    arm64Text: fs.readFileSync(arm64Path, "utf8"),
    x64Text: fs.readFileSync(x64Path, "utf8"),
    version,
    releaseDir,
  });
  fs.writeFileSync(outputPath, merged);
  assertMergedMacMetadata(merged, version, releaseDir);
  console.log(`Merged macOS update metadata is ready for v${version}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
