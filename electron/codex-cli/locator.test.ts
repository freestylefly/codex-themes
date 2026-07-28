import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bundledCodexCliPath, locateCodexCli } from "./locator";

const temporaryRoots: string[] = [];

async function fakeCli(filePath: string, version: string): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `#!/bin/sh\nprintf 'codex-cli ${version}\\n'\n`, { mode: 0o755 });
  return filePath;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-cli-locator-"));
  temporaryRoots.push(root);
  return root;
}

describe("locateCodexCli", () => {
  it("uses the CLI bundled with the official desktop app on a new device", async () => {
    const root = await temporaryRoot();
    const bundle = path.join(root, "ChatGPT.app");
    const bundled = await fakeCli(
      path.join(bundle, "Contents", "Resources", "codex"),
      "0.146.0",
    );

    const located = await locateCodexCli(null, {
      desktopBundlePath: bundle,
      commonPaths: [],
      envPath: "",
    });

    assert.deepEqual(located, {
      executablePath: bundled,
      version: "0.146.0",
    });
  });

  it("resolves the CLI bundled with the Windows desktop installation", async () => {
    const root = await temporaryRoot();
    const installRoot = path.join(root, "ChatGPT");
    assert.equal(
      bundledCodexCliPath("C:\\Program Files\\ChatGPT", "win32"),
      "C:\\Program Files\\ChatGPT\\resources\\codex.exe",
    );
    const bundled = await fakeCli(
      path.join(installRoot, "resources", "codex.exe"),
      "0.146.1",
    );

    const located = await locateCodexCli(null, {
      desktopBundlePath: null,
      commonPaths: [bundled],
      envPath: "",
    });

    assert.equal(located?.executablePath, bundled);
    assert.equal(located?.version, "0.146.1");
  });

  it("keeps an explicit user-selected CLI as the highest priority", async () => {
    const root = await temporaryRoot();
    const selected = await fakeCli(path.join(root, "selected", "codex"), "0.150.0");
    const bundle = path.join(root, "ChatGPT.app");
    await fakeCli(path.join(bundle, "Contents", "Resources", "codex"), "0.146.0");

    const located = await locateCodexCli(selected, {
      desktopBundlePath: bundle,
      commonPaths: [],
      envPath: "",
    });

    assert.equal(located?.executablePath, selected);
    assert.equal(located?.version, "0.150.0");
  });

  it("falls back to a standalone CLI when no desktop bundle is available", async () => {
    const root = await temporaryRoot();
    const standalone = await fakeCli(path.join(root, "bin", "codex"), "0.144.5");

    const located = await locateCodexCli(null, {
      desktopBundlePath: null,
      commonPaths: [standalone],
      envPath: "",
    });

    assert.equal(located?.executablePath, standalone);
    assert.equal(located?.version, "0.144.5");
  });
});
