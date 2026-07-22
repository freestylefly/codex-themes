/**
 * Injection application + soft verification + screenshots.
 * Ported from injector.mjs (MIT). Verification is intentionally "soft":
 * project-selector markup varies across Codex builds, so partial matches
 * report notes instead of hard failures.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { CdpSession } from "./cdp";
import { SKIN_VERSION } from "./constants";

export interface BoxInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface VerifyResult {
  installed: boolean;
  version: string | null;
  stylePresent: boolean;
  chromePresent: boolean;
  chromePointerEvents: string;
  homeRoute: boolean;
  homePresent: boolean;
  hero: BoxInfo | null;
  cards: (BoxInfo | null)[];
  visibleCardCount: number;
  projectButton: BoxInfo | null;
  composer: BoxInfo | null;
  sidebar: BoxInfo | null;
  viewport: { width: number; height: number };
  documentOverflow: { x: boolean; y: boolean };
  pass: boolean;
  softNotes: { projectButtonOptional: boolean };
}

export async function applyToSession(session: CdpSession, payload: string): Promise<unknown> {
  return session.evaluate(payload);
}

/** Remove the skin from one renderer session (idempotent). */
export async function removeFromSession(session: CdpSession): Promise<boolean> {
  return session.evaluate<boolean>(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    document.documentElement?.classList.remove('codex-dream-skin');
    document.documentElement?.style.removeProperty('--dream-skin-art');
    document.getElementById('codex-dream-skin-style')?.remove();
    document.getElementById('codex-dream-skin-chrome')?.remove();
    delete window.__CODEX_DREAM_SKIN_STATE__;
    return true;
  })()`);
}

export async function verifyRemovedSession(session: CdpSession): Promise<boolean> {
  return session.evaluate<boolean>(`(() =>
    !document.documentElement.classList.contains('codex-dream-skin') &&
    !document.getElementById('codex-dream-skin-style') &&
    !document.getElementById('codex-dream-skin-chrome') &&
    !window.__CODEX_DREAM_SKIN_STATE__
  )()`);
}

export async function verifySession(session: CdpSession): Promise<VerifyResult> {
  return session.evaluate<VerifyResult>(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      };
    };
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const homeSignal = homeIndicator ?? document.querySelector('[data-feature="game-source"]') ??
      document.querySelector('.group\\\\/home-suggestions');
    const homeRoute = homeSignal?.closest('[role="main"]') ?? null;
    const home = document.querySelector('[role="main"].dream-skin-home');
    const blueWindowHome = home?.querySelector('#codex-dream-skin-blue-window-home') ?? null;
    const suggestions = blueWindowHome?.querySelector('.blue-window-home__quick-actions') ??
      home?.querySelector('.group\\\\/home-suggestions') ?? null;
    const cardBoxes = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const visibleCards = cardBoxes.filter((item) => item?.visible);
    const hero = box(blueWindowHome?.querySelector('.blue-window-home__hero')) ??
      box(home?.firstElementChild?.firstElementChild?.firstElementChild);
    const projectButton = box(blueWindowHome?.querySelector('[data-project-target]')) ??
      box(home?.querySelector('.group\\\\/project-selector > button'));
    const composer = box(blueWindowHome?.querySelector('.blue-window-home__composer')) ??
      box(document.querySelector('.composer-surface-chrome'));
    const sidebar = box(document.querySelector('aside.app-shell-left-panel'));
    const chrome = document.getElementById('codex-dream-skin-chrome');
    const result = {
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      version: window.__CODEX_DREAM_SKIN_STATE__?.version ?? null,
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      chromePresent: Boolean(chrome),
      chromePointerEvents: getComputedStyle(chrome || document.body).pointerEvents,
      homeRoute: Boolean(homeRoute),
      homePresent: Boolean(home),
      hero,
      cards: cardBoxes,
      visibleCardCount: visibleCards.length,
      projectButton,
      composer,
      sidebar,
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    const basePass = result.installed && result.version === ${JSON.stringify(SKIN_VERSION)} &&
      result.stylePresent && result.chromePresent && result.chromePointerEvents === 'none' &&
      Boolean(result.composer?.visible) && Boolean(result.sidebar?.visible) && !result.documentOverflow.x;
    // Project selector markup varies across Codex builds — soft requirement.
    const homePass = !result.homeRoute || (
      result.homePresent && result.hero?.visible && result.hero.width >= 280 && result.hero.height >= 120 &&
      result.visibleCardCount >= 1 && result.visibleCardCount <= 6
    );
    result.pass = Boolean(basePass && homePass);
    result.softNotes = {
      projectButtonOptional: !result.projectButton?.visible,
    };
    return result;
  })()`);
}

export async function waitForVerifiedSession(
  session: CdpSession,
  timeoutMs: number,
): Promise<VerifyResult> {
  const deadline = Date.now() + timeoutMs;
  let lastResult: VerifyResult | undefined;
  while (Date.now() < deadline) {
    lastResult = await verifySession(session);
    if (lastResult.pass) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!lastResult) throw new Error("Verification timed out before any result");
  return lastResult;
}

/** Capture a PNG screenshot of the themed Codex window for QA. */
export async function captureScreenshot(session: CdpSession, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await session.send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
  });
  await session.send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
  });
  const viewport = await session.evaluate<{ width: number; height: number }>(
    "({ width: innerWidth, height: innerHeight })",
  );
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(viewport.width * 0.64),
    y: Math.round(viewport.height * 0.62),
    button: "none",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}
