import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import AdmZip from "adm-zip";

import { buildStandaloneThemePackage } from "./build-standalone-happy-coding.mjs";

const execFileAsync = promisify(execFile);

test("builds an independent Happy Coding macOS package", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "happy-coding-package-test-"));
  const fakeRuntime = path.join(root, "happy-coding-runtime");
  await fs.writeFile(fakeRuntime, "runtime", { mode: 0o755 });

  const result = await buildStandaloneThemePackage({
    projectRoot: process.cwd(),
    outputDir: root,
    runtimePath: fakeRuntime,
    archiveName: "Happy-Coding-test.zip",
  });

  const zip = new AdmZip(result.archivePath);
  const names = zip.getEntries().map((entry) => entry.entryName).sort();
  assert.ok(names.includes("Happy Coding/Install Happy Coding.command"));
  assert.ok(names.includes("Happy Coding/Uninstall Happy Coding.command"));
  assert.ok(names.includes("Happy Coding/runtime/happy-coding-runtime"));
  assert.ok(names.includes("Happy Coding/runtime/inject/dream-skin.css"));
  assert.ok(names.includes("Happy Coding/runtime/inject/renderer-inject.js"));
  assert.ok(names.includes("Happy Coding/runtime/theme/theme.json"));
  assert.ok(names.includes("Happy Coding/runtime/theme/hero-workspace-blended.png"));
  assert.ok(names.includes("Happy Coding/runtime/theme/wallpaper.png"));
  assert.ok(names.includes("Happy Coding/runtime/theme/stamp.png"));

  const install = zip.readAsText("Happy Coding/Install Happy Coding.command");
  assert.match(install, /com\.happycoding\.theme/);
  assert.match(install, /LaunchAgents/);
  assert.match(install, /KeepAlive/);
  assert.match(install, /happy-coding-runtime/);

  const uninstall = zip.readAsText("Happy Coding/Uninstall Happy Coding.command");
  assert.match(uninstall, /--cleanup/);
  assert.match(uninstall, /bootout/);

  const extracted = path.join(root, "extracted");
  await fs.mkdir(extracted);
  await execFileAsync("/usr/bin/unzip", ["-q", result.archivePath, "-d", extracted]);
  for (const relative of [
    "Happy Coding/Install Happy Coding.command",
    "Happy Coding/Uninstall Happy Coding.command",
    "Happy Coding/runtime/happy-coding-runtime",
  ]) {
    const mode = (await fs.stat(path.join(extracted, relative))).mode;
    assert.notEqual(mode & 0o111, 0, `${relative} must remain executable after extraction`);
  }

  const manifest = JSON.parse(zip.readAsText("Happy Coding/package.json"));
  assert.equal(manifest.name, "Happy Coding");
  assert.equal(manifest.themeId, "happy-coding-dog");
  assert.equal(manifest.engineVersion, "1.2.4");
  assert.equal(manifest.platform, "darwin-arm64");
});
