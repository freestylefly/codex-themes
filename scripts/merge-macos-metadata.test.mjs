import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import {
  assertMergedMacMetadata,
  mergeMacMetadata,
} from "./merge-macos-metadata.mjs";

const VERSION = "0.2.14";

function sha512(file) {
  return crypto.createHash("sha512").update(fs.readFileSync(file)).digest("base64");
}

function metadata(version, entries) {
  return `version: ${version}
files:
${entries.map((entry) => `  - url: ${entry.name}
    sha512: ${entry.sha512}
    size: ${entry.size}`).join("\n")}
path: ${entries[0].name}
sha512: ${entries[0].sha512}
releaseDate: '2026-07-28T00:00:00.000Z'
`;
}

test("macOS metadata merge validates both architectures and keeps ARM64 compatibility fields", (t) => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-themes-metadata-"));
  t.after(() => fs.rmSync(releaseDir, { recursive: true, force: true }));
  const names = [
    `Codex-Themes-${VERSION}-mac-arm64.zip`,
    `Codex-Themes-${VERSION}-mac-arm64.dmg`,
    `Codex-Themes-${VERSION}-mac-x64.zip`,
    `Codex-Themes-${VERSION}-mac-x64.dmg`,
  ];
  const entries = names.map((name, index) => {
    const file = path.join(releaseDir, name);
    fs.writeFileSync(file, `artifact-${index}`);
    return { name, size: fs.statSync(file).size, sha512: sha512(file) };
  });

  const merged = mergeMacMetadata({
    arm64Text: metadata(VERSION, entries.slice(0, 2)),
    x64Text: metadata(VERSION, entries.slice(2)),
    version: VERSION,
    releaseDir,
  });
  const document = parse(merged);
  assert.deepEqual(document.files.map((entry) => entry.url), names);
  assert.equal(document.path, names[0]);
  assert.equal(document.sha512, entries[0].sha512);
  assert.doesNotThrow(() => assertMergedMacMetadata(merged, VERSION, releaseDir));
});

test("macOS metadata merge rejects version drift and stale hashes", (t) => {
  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-themes-metadata-"));
  t.after(() => fs.rmSync(releaseDir, { recursive: true, force: true }));
  const armNames = [
    `Codex-Themes-${VERSION}-mac-arm64.zip`,
    `Codex-Themes-${VERSION}-mac-arm64.dmg`,
  ];
  const x64Names = [
    `Codex-Themes-${VERSION}-mac-x64.zip`,
    `Codex-Themes-${VERSION}-mac-x64.dmg`,
  ];
  const makeEntries = (names) => names.map((name) => {
    const file = path.join(releaseDir, name);
    fs.writeFileSync(file, name);
    return { name, size: fs.statSync(file).size, sha512: sha512(file) };
  });
  const armEntries = makeEntries(armNames);
  const x64Entries = makeEntries(x64Names);

  assert.throws(() => mergeMacMetadata({
    arm64Text: metadata("0.2.13", armEntries),
    x64Text: metadata(VERSION, x64Entries),
    version: VERSION,
    releaseDir,
  }), /does not match package version/);
  assert.throws(() => mergeMacMetadata({
    arm64Text: metadata(VERSION, armEntries).replace(armEntries[0].sha512, "stale"),
    x64Text: metadata(VERSION, x64Entries),
    version: VERSION,
    releaseDir,
  }), /does not match/);
});
