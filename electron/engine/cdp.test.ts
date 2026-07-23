import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyDesktopAppMode,
  finalizeProbeResult,
  type RawProbeResult,
} from "./cdp";

const shellMarkers = {
  shell: true,
  sidebar: true,
  composer: true,
  main: true,
};

function rawProbe(overrides: Partial<RawProbeResult> = {}): RawProbeResult {
  return {
    title: "Codex",
    href: "app://-/index.html",
    markers: shellMarkers,
    modeButtonText: "Codex",
    modeButtonLabel: "切换模式，当前模式：Codex",
    ...overrides,
  };
}

describe("desktop app mode detection", () => {
  it("recognizes Codex from localized mode controls", () => {
    assert.equal(classifyDesktopAppMode(rawProbe()), "codex");
    assert.equal(
      classifyDesktopAppMode(rawProbe({
        modeButtonText: "",
        modeButtonLabel: "Switch mode, current mode: Codex",
      })),
      "codex",
    );
  });

  it("recognizes the ChatGPT / Work surface", () => {
    const probe = rawProbe({
      title: "ChatGPT",
      modeButtonText: "ChatGPT",
      modeButtonLabel: "切换模式，当前模式：ChatGPT",
    });
    assert.equal(classifyDesktopAppMode(probe), "chatgpt");
    assert.equal(finalizeProbeResult(probe).codex, false);
    assert.equal(
      classifyDesktopAppMode(rawProbe({
        title: "ChatGPT",
        modeButtonText: "",
        modeButtonLabel: "",
      })),
      "chatgpt",
    );
  });

  it("keeps older Codex-only shells compatible when no switcher exists", () => {
    const probe = rawProbe({
      modeButtonText: "",
      modeButtonLabel: "",
      title: "Codex",
    });
    assert.equal(classifyDesktopAppMode(probe), "codex");
    assert.equal(finalizeProbeResult(probe).codex, true);
  });

  it("does not accept a shell when the required DOM markers are incomplete", () => {
    const probe = rawProbe({
      markers: { ...shellMarkers, sidebar: false },
    });
    assert.equal(finalizeProbeResult(probe).codex, false);
  });
});
