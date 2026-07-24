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
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateThemeRecipe } from "./recipe-validator";
import { synthesizeTheme } from "./synthesizer";
import { analyzeImage } from "./image-analysis";
import { RECIPE_JSON_SCHEMA } from "./recipe-schema";
import { CodexAppServerClient } from "../codex-cli/app-server";
import { AiThemeJobService } from "./job-service";
import type { AppPaths } from "../paths";
import type { CodexCliStatusService } from "../codex-cli/status";
import type { ThemeStore } from "../themes/store";
import type { ThemeDraftInput, ThemeGenerationRecipe, ThemeGenerationRequest, ThemeSummary } from "../shared/types";

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

// ---------------------------------------------------------------------------
// Durable multi-turn AI creation service.

class FakeAppServerClient {
  requests: Array<{ method: string; params: Record<string, unknown> }> = [];

  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === "thread/start") return { thread: { id: "thread-ai-test" } };
    if (method === "thread/resume") return { thread: { id: params.threadId } };
    return { ok: true };
  }

  respondToServerRequest(): void {}
  rejectServerRequest(): void {}
}

class FakeCliService extends EventEmitter {
  readonly client = new FakeAppServerClient();

  async getConnectedClient(): Promise<FakeAppServerClient> {
    return this.client;
  }

  getStatus(): { appServerRunning: boolean } {
    return { appServerRunning: true };
  }
}

class FakeThemeStore {
  savedDrafts: ThemeDraftInput[] = [];
  updatedIds: string[] = [];

  async saveThemeDraft(draft: ThemeDraftInput): Promise<ThemeSummary> {
    this.savedDrafts.push(draft);
    return {
      id: "custom-ai-test",
      uuid: "uuid-ai-test",
      name: draft.name,
      dir: "/tmp/custom-ai-test",
      source: "custom",
      valid: true,
    } as ThemeSummary;
  }

  async updateTheme(id: string, draft: ThemeDraftInput): Promise<ThemeSummary> {
    this.updatedIds.push(id);
    this.savedDrafts.push(draft);
    return {
      id,
      uuid: "uuid-ai-test",
      name: draft.name,
      dir: `/tmp/${id}`,
      source: "custom",
      valid: true,
    } as ThemeSummary;
  }
}

async function waitUntil(check: () => boolean | Promise<boolean>, timeoutMs = 2_500): Promise<void> {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for AI job state");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("AiThemeJobService multi-turn flow", () => {
  let root: string;
  let service: AiThemeJobService;
  let cli: FakeCliService;
  let store: FakeThemeStore;
  let images: string[];

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-job-service-test-"));
    const jobsRoot = path.join(root, "jobs");
    const skillsRoot = path.join(root, "skills");
    await fs.mkdir(skillsRoot, { recursive: true });
    images = [];
    for (let index = 0; index < 6; index += 1) {
      const imagePath = path.join(root, `candidate-${index + 1}.png`);
      await fs.writeFile(imagePath, Buffer.alloc(512, index + 1));
      images.push(imagePath);
    }
    cli = new FakeCliService();
    store = new FakeThemeStore();
    service = new AiThemeJobService(
      { aiJobsRoot: jobsRoot, skillsRoot } as AppPaths,
      cli as unknown as CodexCliStatusService,
      store as unknown as ThemeStore,
    );
    await service.init();
  });

  after(async () => {
    await service.shutdown();
    await fs.rm(root, { recursive: true, force: true });
  });

  async function completeImageTurn(jobId: string, imagePath: string, itemId: string): Promise<void> {
    const job = await service.getJob(jobId);
    cli.emit("notification", "turn/started", {
      threadId: job.threadId,
      turn: { id: `turn-${itemId}` },
    });
    cli.emit("notification", "item/completed", {
      threadId: job.threadId,
      item: { id: itemId, type: "imageGeneration", savedPath: imagePath },
    });
    cli.emit("notification", "turn/completed", { threadId: job.threadId });
  }

  async function completeRecipeTurn(jobId: string, recipe: ThemeGenerationRecipe, suffix: string): Promise<void> {
    const job = await service.getJob(jobId);
    cli.emit("notification", "item/completed", {
      threadId: job.threadId,
      item: {
        id: `recipe-${suffix}`,
        type: "agentMessage",
        text: JSON.stringify({
          message: `已完成第 ${suffix} 次主题调整。`,
          changeSummary: [`调整 ${suffix}`],
          recipe,
        }),
      },
    });
    cli.emit("notification", "turn/completed", { threadId: job.threadId });
  }

  it("forbids generated hero artwork from containing a fake application interface", () => {
    const prompt = (
      service as unknown as {
        buildImagePrompt(
          request: ThemeGenerationRequest,
          instruction: string,
          slot: number,
          count: number,
          attempt: number,
        ): string;
      }
    ).buildImagePrompt(makeRequest(), makeRequest().prompt, 1, 1, 1);
    assert.match(prompt, /pure background artwork only/i);
    assert.match(prompt, /Never draw or imitate any software interface/i);
    assert.match(prompt, /no app window.*sidebar.*input box.*composer/i);
    assert.match(prompt, /Do not include text.*watermarks.*UI-shaped rectangles/i);
  });

  it("generates exactly three slots before selection and keeps revisions out of the theme library", async () => {
    const job = await service.createJob({
      prompt: "雨夜未来城市",
      mode: "generate-image",
      appearance: "dark",
      candidateCount: 3,
    });
    await service.startJob(job.jobId);
    assert.equal(cli.client.requests.filter((request) => request.method === "turn/start").length, 1);

    const beforeStaleImage = await service.getJob(job.jobId);
    cli.emit("notification", "item/completed", {
      threadId: beforeStaleImage.threadId,
      turnId: "turn-from-an-older-operation",
      item: { id: "stale-img", type: "imageGeneration", savedPath: images[5] },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal((await service.getJob(job.jobId)).candidateBatches[0].candidates.length, 0);

    await completeImageTurn(job.jobId, images[0], "img-1");
    await waitUntil(async () => cli.client.requests.filter((request) => request.method === "turn/start").length === 2);
    let current = await service.getJob(job.jobId);
    assert.equal(current.stage, "generating-images");
    assert.equal(current.candidateBatches[0].candidates.length, 1);

    await completeImageTurn(job.jobId, images[1], "img-2");
    await waitUntil(async () => cli.client.requests.filter((request) => request.method === "turn/start").length === 3);
    current = await service.getJob(job.jobId);
    assert.equal(current.stage, "generating-images");
    assert.equal(current.candidateBatches[0].candidates.length, 2);

    await completeImageTurn(job.jobId, images[2], "img-3");
    await waitUntil(async () => (await service.getJob(job.jobId)).stage === "awaiting-selection");
    current = await service.getJob(job.jobId);
    assert.equal(current.candidateBatches[0].candidates.length, 3);
    assert.equal(current.candidateBatches[0].status, "awaiting-selection");
    assert.deepEqual(current.candidateBatches[0].candidates.map((candidate) => candidate.slot), [1, 2, 3]);

    const selected = current.candidateBatches[0].candidates[1];
    await service.selectCandidate(job.jobId, current.candidateBatches[0].batchId, selected.candidateId);
    const recipeTurnJob = await service.getJob(job.jobId);
    cli.emit("notification", "turn/started", {
      threadId: recipeTurnJob.threadId,
      turn: { id: "turn-recipe-current" },
    });
    cli.emit("notification", "item/completed", {
      threadId: recipeTurnJob.threadId,
      turnId: "turn-recipe-stale",
      item: {
        id: "recipe-stale",
        type: "agentMessage",
        text: JSON.stringify({
          message: "这是迟到的旧结果。",
          changeSummary: ["不应采用"],
          recipe: { ...makeRecipe(), name: "STALE" },
        }),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal((await service.getJob(job.jobId)).revisions.length, 0);
    cli.emit("notification", "item/completed", {
      threadId: recipeTurnJob.threadId,
      turnId: "turn-recipe-current",
      item: {
        id: "recipe-1",
        type: "agentMessage",
        text: JSON.stringify({
          message: "已完成第 1 次主题调整。",
          changeSummary: ["调整 1"],
          recipe: makeRecipe(),
        }),
      },
    });
    cli.emit("notification", "turn/completed", {
      threadId: recipeTurnJob.threadId,
      turnId: "turn-recipe-current",
    });
    await waitUntil(async () => (await service.getJob(job.jobId)).revisions.length === 1);
    current = await service.getJob(job.jobId);
    assert.equal(current.stage, "preview-ready");
    assert.equal(current.currentRevisionId, current.revisions[0].revisionId);
    assert.equal(current.revisions[0].candidateId, selected.candidateId);
    assert.equal(store.savedDrafts.length, 0, "preview revisions must not write to the theme library");
  });

  it("keeps the selected image during theme-only chat and updates the same theme on later adoption", async () => {
    const [summary] = await service.listJobs();
    const before = await service.getJob(summary.jobId);
    const originalRevision = before.revisions[0];
    const originalCandidate = before.candidateBatches[0].candidates.find(
      (candidate) => candidate.candidateId === originalRevision.candidateId,
    );
    assert.ok(originalCandidate?.sha256);

    await service.sendMessage(before.jobId, {
      text: "把对话页背景再深一点，减少玻璃透明度",
      mode: "theme-only",
    });
    const refinedRecipe = makeRecipe();
    refinedRecipe.wallpaper.opacity = 0.12;
    refinedRecipe.appearance.glass = false;
    await completeRecipeTurn(before.jobId, refinedRecipe, "2");
    await waitUntil(async () => (await service.getJob(before.jobId)).revisions.length === 2);

    const after = await service.getJob(before.jobId);
    assert.equal(after.revisions[1].parentRevisionId, originalRevision.revisionId);
    assert.equal(after.revisions[1].candidateId, originalRevision.candidateId);
    const afterCandidate = after.candidateBatches[0].candidates.find(
      (candidate) => candidate.candidateId === after.revisions[1].candidateId,
    );
    assert.equal(afterCandidate?.sha256, originalCandidate.sha256);

    const firstAdopt = await service.adoptRevision(before.jobId, after.revisions[1].revisionId);
    assert.equal(firstAdopt.id, "custom-ai-test");
    assert.equal(store.savedDrafts.length, 1);
    await service.setCurrentRevision(before.jobId, originalRevision.revisionId);
    await service.adoptRevision(before.jobId, originalRevision.revisionId);
    assert.deepEqual(store.updatedIds, ["custom-ai-test"]);
    const adopted = await service.getJob(before.jobId);
    assert.equal(adopted.adoptedThemeId, "custom-ai-test");
    assert.equal(adopted.adoptedRevisionId, originalRevision.revisionId);
    assert.equal(adopted.stage, "preview-ready");
  });

  it("creates a new candidate batch without deleting the previous batch", async () => {
    const [summary] = await service.listJobs();
    const before = await service.getJob(summary.jobId);
    await service.sendMessage(before.jobId, {
      text: "重新生成一组更安静的夜景",
      mode: "regenerate-image",
    });
    let current = await service.getJob(before.jobId);
    assert.equal(current.candidateBatches.length, 2);
    assert.equal(current.candidateBatches[0].candidates.length, 3);

    await completeImageTurn(before.jobId, images[3], "regen-1");
    await waitUntil(async () => {
      const job = await service.getJob(before.jobId);
      return job.candidateBatches[1].candidates.length === 1 && job.operation?.currentSlot === 2;
    });
    await completeImageTurn(before.jobId, images[4], "regen-2");
    await waitUntil(async () => {
      const job = await service.getJob(before.jobId);
      return job.candidateBatches[1].candidates.length === 2 && job.operation?.currentSlot === 3;
    });
    await completeImageTurn(before.jobId, images[5], "regen-3");
    await waitUntil(async () => (await service.getJob(before.jobId)).stage === "awaiting-selection");

    current = await service.getJob(before.jobId);
    assert.equal(current.candidateBatches[0].candidates.length, 3);
    assert.equal(current.candidateBatches[1].candidates.length, 3);
    assert.notEqual(current.candidateBatches[0].batchId, current.candidateBatches[1].batchId);
  });
});
