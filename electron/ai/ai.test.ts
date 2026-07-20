/**
 * Tests for the AI theme pipeline (plan §13.2 / §13.4):
 *   - Theme Recipe runtime validation: positive/negative cases, unknown
 *     keys/enums, range checks — mirrors the strict JSON Schema.
 *   - Theme Synthesizer: valid recipe + image → ThemeDraftInput; invalid
 *     inputs rejected.
 *   - CodexAppServerClient against a fake JSONL app-server: handshake,
 *     half/stuck packets, non-JSON lines, out-of-order responses, unknown
 *     notifications, timeouts, error mapping and process exit.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateThemeRecipe } from "./recipe-validator";
import { synthesizeTheme } from "./synthesizer";
import { analyzeImage } from "./image-analysis";
import { RECIPE_JSON_SCHEMA } from "./recipe-schema";
import { CodexAppServerClient } from "../codex-cli/app-server";
import type { ThemeGenerationRecipe, ThemeGenerationRequest } from "../shared/types";

function makeRecipe(): ThemeGenerationRecipe {
  return {
    schemaVersion: 1,
    name: "雨夜霓虹",
    description: "深蓝雨夜城市,霓虹反光。",
    tagline: "Rainy neon night.",
    tags: ["dark", "city"],
    layout: "dream-banner",
    hero: { fit: "cover", focusX: 0.7, focusY: 0.4, zoom: 1, height: 280, textAlign: "left", scrim: 0.4 },
    wallpaper: { enabled: true, focusX: 0.5, focusY: 0.5, opacity: 0.25, blur: 12 },
    appearance: { radius: "lg", density: "normal", fontPreset: "system", glass: true, shadow: "lg", decoration: 0.4 },
    effects: { particles: 0.2, aurora: 0.3, glow: 0.4, noise: 0.1, grid: 0, float: 0.2 },
    copy: {
      brandSubtitle: "CODEX THEMES",
      projectPrefix: "选择项目 · ",
      projectLabel: "◉  选择项目",
      statusText: "THEME ONLINE",
      quote: "MAKE SOMETHING WONDERFUL",
    },
    paletteIntent: { appearance: "dark", contrast: "normal", temperature: "cool" },
  };
}

const makeRequest = (): ThemeGenerationRequest => ({
  prompt: "雨夜赛博朋克",
  mode: "generate-image",
  appearance: "dark",
  candidateCount: 1,
});

describe("validateThemeRecipe", () => {
  it("accepts a fully valid recipe", () => {
    assert.deepEqual(validateThemeRecipe(makeRecipe()), []);
  });

  it("rejects non-objects", () => {
    assert.ok(validateThemeRecipe(null).length > 0);
    assert.ok(validateThemeRecipe("css").length > 0);
    assert.ok(validateThemeRecipe(42).length > 0);
  });

  it("rejects wrong schemaVersion", () => {
    const r = { ...makeRecipe(), schemaVersion: 2 };
    assert.ok(validateThemeRecipe(r).some((e) => e.includes("schemaVersion")));
  });

  it("rejects unknown top-level keys (no CSS/JS/path smuggling)", () => {
    const r = { ...makeRecipe(), css: "body { display: none }" } as unknown;
    assert.ok(validateThemeRecipe(r).some((e) => e.includes("unknown key css")));
    const r2 = { ...makeRecipe(), script: "alert(1)", heroPath: "/etc/passwd" } as unknown;
    const errors = validateThemeRecipe(r2);
    assert.ok(errors.some((e) => e.includes("unknown key script")));
    assert.ok(errors.some((e) => e.includes("unknown key heroPath")));
  });

  it("rejects unknown nested keys", () => {
    const r = makeRecipe() as unknown as Record<string, Record<string, unknown>>;
    r.hero.selector = ".sidebar";
    r.appearance.customCss = "* { color: red }";
    const errors = validateThemeRecipe(r);
    assert.ok(errors.some((e) => e.includes("unknown key hero.selector")));
    assert.ok(errors.some((e) => e.includes("unknown key appearance.customCss")));
  });

  it("rejects unregistered layouts and enums", () => {
    const r = makeRecipe();
    (r as { layout: string }).layout = "sidebar-injection";
    (r.appearance as { radius: string }).radius = "9999px";
    const errors = validateThemeRecipe(r);
    assert.ok(errors.some((e) => e.includes("layout")));
    assert.ok(errors.some((e) => e.includes("radius")));
  });

  it("rejects out-of-range and non-finite numbers", () => {
    const r = makeRecipe();
    r.hero.zoom = 99;
    r.hero.scrim = -1;
    r.wallpaper.blur = Number.POSITIVE_INFINITY;
    r.effects.glow = 2;
    const errors = validateThemeRecipe(r);
    assert.ok(errors.some((e) => e.includes("hero.zoom")));
    assert.ok(errors.some((e) => e.includes("hero.scrim")));
    assert.ok(errors.some((e) => e.includes("wallpaper.blur")));
    assert.ok(errors.some((e) => e.includes("effects.glow")));
  });

  it("rejects unknown effects", () => {
    const r = makeRecipe() as unknown as { effects: Record<string, unknown> };
    r.effects.marquee = 1;
    assert.ok(validateThemeRecipe(r).some((e) => e.includes("unknown effect marquee")));
  });

  it("rejects oversized strings and tag lists", () => {
    const r = makeRecipe();
    r.name = "x".repeat(81);
    r.tags = Array.from({ length: 17 }, (_, i) => `t${i}`);
    const errors = validateThemeRecipe(r);
    assert.ok(errors.some((e) => e.includes("name")));
    assert.ok(errors.some((e) => e.includes("tags")));
  });

  it("stays aligned with the JSON Schema field lists", () => {
    // The runtime validator and outputSchema must not drift apart.
    const schemaKeys = Object.keys(RECIPE_JSON_SCHEMA.properties).sort();
    const recipeKeys = Object.keys(makeRecipe()).sort();
    assert.deepEqual(recipeKeys, schemaKeys);
  });
});

describe("synthesizeTheme", () => {
  let dir: string;
  let imagePath: string;

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-synth-test-"));
    imagePath = path.join(dir, "hero.png");
    await fs.writeFile(imagePath, Buffer.alloc(256, 7));
  });

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("builds a ThemeDraftInput from a valid recipe and image", async () => {
    const recipe = makeRecipe();
    const { draft } = await synthesizeTheme({ request: makeRequest(), recipe, imagePath });
    assert.equal(draft.name, recipe.name);
    assert.equal(draft.layout, "dream-banner");
    assert.equal(draft.heroImagePath, imagePath);
    assert.equal(draft.wallpaperImagePath, imagePath);
    assert.equal(draft.heroFocusX, 0.7);
    assert.ok(draft.colors.accent.startsWith("#"));
  });

  it("does not attach a wallpaper when the recipe disables it", async () => {
    const recipe = makeRecipe();
    recipe.wallpaper.enabled = false;
    const { draft } = await synthesizeTheme({ request: makeRequest(), recipe, imagePath });
    assert.equal(draft.wallpaperEnabled, false);
    assert.equal(draft.wallpaperImagePath, undefined);
  });

  it("rejects an invalid recipe before touching the image", async () => {
    const recipe = makeRecipe();
    (recipe as { layout: string }).layout = "evil-layout";
    await assert.rejects(
      () => synthesizeTheme({ request: makeRequest(), recipe, imagePath }),
      /Recipe validation failed/,
    );
  });

  it("rejects a missing or non-image hero path", async () => {
    await assert.rejects(
      () => synthesizeTheme({ request: makeRequest(), recipe: makeRecipe(), imagePath: path.join(dir, "nope.png") }),
    );
    const evil = path.join(dir, "script.sh");
    await fs.writeFile(evil, "#!/bin/sh\n");
    await assert.rejects(
      () => synthesizeTheme({ request: makeRequest(), recipe: makeRecipe(), imagePath: evil }),
      /missing or invalid/,
    );
  });
});

describe("analyzeImage", () => {
  let dir: string;
  let imagePath: string;

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-analysis-test-"));
    imagePath = path.join(dir, "hero.png");
    await fs.writeFile(imagePath, Buffer.alloc(256, 7));
  });

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns focal and composition suggestions within valid ranges", () => {
    const result = analyzeImage(imagePath);
    assert.ok(result.averageBrightness >= 0 && result.averageBrightness <= 1);
    assert.ok(result.contrast >= 0 && result.contrast <= 1);
    assert.ok(result.suggestedFocusX >= 0 && result.suggestedFocusX <= 1);
    assert.ok(result.suggestedFocusY >= 0 && result.suggestedFocusY <= 1);
    assert.ok(result.suggestedScrim >= 0 && result.suggestedScrim <= 0.85);
    assert.ok(result.wallpaperBlur >= 0 && result.wallpaperBlur <= 32);
    assert.ok(result.wallpaperOpacity >= 0 && result.wallpaperOpacity <= 1);
    assert.ok(["left", "center", "right"].includes(result.suggestedTextAlign));
    assert.ok(["cool", "neutral", "warm"].includes(result.colorTemperature));
    assert.ok(["light", "dark"].includes(result.suggestedAppearance));
    assert.ok(["cover", "contain"].includes(result.suggestedHeroFit));
  });
});

// ---------------------------------------------------------------------------
// CodexAppServerClient against a scripted fake app-server (JSONL over stdio).

const FAKE_SERVER = `#!/usr/bin/env node
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\\n");
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    // Exercise the parser: garbage line, then a response split mid-JSON.
    process.stdout.write("this is not json\\n");
    const resp = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ok: true } }) + "\\n";
    process.stdout.write(resp.slice(0, 12));
    setTimeout(() => process.stdout.write(resp.slice(12)), 15);
    return;
  }
  if (msg.method === "initialized") {
    send({ jsonrpc: "2.0", method: "totally/unknownNotification", params: { future: true } });
    return;
  }
  if (msg.method === "echo") return send({ jsonrpc: "2.0", id: msg.id, result: { echoed: msg.params } });
  if (msg.method === "echoSlow") {
    setTimeout(() => send({ jsonrpc: "2.0", id: msg.id, result: { echoed: msg.params } }), 60);
    return;
  }
  if (msg.method === "never") return; // let the client time out
  if (msg.method === "die") process.exit(3);
  if (msg.method === "askApproval") {
    send({ jsonrpc: "2.0", id: msg.id, result: { ok: true } });
    setTimeout(() => send({ jsonrpc: "2.0", id: "req-1", method: "approval/ask", params: { detail: "test" } }), 20);
    return;
  }
  send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "unknown method " + msg.method } });
});
`;

describe("CodexAppServerClient", () => {
  let dir: string;
  let serverPath: string;

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "fake-codex-"));
    serverPath = path.join(dir, "fake-codex.cjs");
    await fs.writeFile(serverPath, FAKE_SERVER, { mode: 0o755 });
  });

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function connect(): Promise<CodexAppServerClient> {
    const client = new CodexAppServerClient();
    await client.connect(serverPath);
    return client;
  }

  it("completes the handshake despite garbage and split JSONL lines", async () => {
    const client = await connect();
    assert.equal(client.isReady, true);
    await client.disconnect();
  });

  it("surfaces unknown notifications without crashing", async () => {
    const client = new CodexAppServerClient();
    const seen: string[] = [];
    client.on("notification", (method: string) => seen.push(method));
    await client.connect(serverPath);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(seen.includes("totally/unknownNotification"));
    await client.disconnect();
  });

  it("routes out-of-order responses to the right pending requests", async () => {
    const client = await connect();
    const [slow, fast] = await Promise.all([
      client.request("echoSlow", { n: 1 }),
      client.request("echo", { n: 2 }),
    ]);
    assert.deepEqual(slow, { echoed: { n: 1 } });
    assert.deepEqual(fast, { echoed: { n: 2 } });
    await client.disconnect();
  });

  it("maps JSON-RPC errors to rejections", async () => {
    const client = await connect();
    await assert.rejects(() => client.request("no/such/method"), /unknown method/);
    await client.disconnect();
  });

  it("times out requests the server never answers", async () => {
    const client = await connect();
    await assert.rejects(() => client.request("never", {}, 80), /timed out/);
    await client.disconnect();
  });

  it("rejects pending requests and emits close when the server dies", async () => {
    const client = await connect();
    const closed = new Promise<string>((resolve) => client.once("close", resolve));
    const pending = client.request("die");
    await assert.rejects(() => pending, /exited|disconnected/i);
    const reason = await closed;
    assert.match(reason, /exit code 3/);
    assert.equal(client.isRunning, false);
    await client.disconnect();
  });

  it("refuses requests when not connected", async () => {
    const client = new CodexAppServerClient();
    await assert.rejects(() => client.request("echo"), /not running/);
  });

  it("emits serverRequest for server-to-client calls", async () => {
    const client = await connect();
    const req = new Promise<{ id: string | number; method: string; params: unknown }>((resolve) =>
      client.once("serverRequest", (id, method, params) => resolve({ id, method, params })),
    );
    await client.request("askApproval");
    const seen = await req;
    assert.equal(seen.method, "approval/ask");
    await client.disconnect();
  });
});
