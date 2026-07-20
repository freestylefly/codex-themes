/**
 * AI Theme Job Service — manages the lifecycle of one AI theme generation task.
 *
 * Each job lives in its own directory under `userData/ai-jobs/<id>/` and keeps:
 *   - job.json (state machine, request, candidates, recipe, thread id)
 *   - candidates/ (generated hero images)
 *   - recipe/ (raw recipe attempts)
 *   - logs/ (per-job app-server log excerpts)
 *
 * The service talks to the shared Codex App Server client (owned by the CLI
 * status service). It turns model outputs into a real saved theme through the
 * Theme Synthesizer and ThemeStore.
 */

import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AiThemeCandidate,
  AiThemeJob,
  AiThemeJobSummary,
  CodexApprovalDecision,
  CodexApprovalRequest,
  ThemeGenerationRecipe,
  ThemeGenerationRequest,
} from "../shared/types";
import type { AppPaths } from "../paths";
import type { ThemeStore } from "../themes/store";
import type { CodexCliStatusService } from "../codex-cli/status";
import type { CodexAppServerClient } from "../codex-cli/app-server";
import { registerPickedImage } from "../picked-images";
import { RECIPE_JSON_SCHEMA } from "./recipe-schema";
import { synthesizeTheme } from "./synthesizer";
import { IMAGE_EXTENSIONS, MAX_ART_BYTES } from "../engine/constants";

export class AiThemeJobService extends EventEmitter {
  private activeJobId: string | null = null;
  private currentTurnId: string | null = null;
  private pendingApprovals = new Map<string, { id: number | string; method: string }>();
  private notificationHandler = (method: string, params: unknown) =>
    this.onAppServerNotification(method, params as Record<string, unknown> | undefined);
  private serverRequestHandler = (id: number | string, method: string, params: unknown) =>
    this.onAppServerServerRequest(id, method, params as Record<string, unknown> | undefined);

  constructor(
    private paths: AppPaths,
    private cliService: CodexCliStatusService,
    private store: ThemeStore,
  ) {
    super();
  }

  // -------------------------------------------------------------- lifecycle

  async init(): Promise<void> {
    await fs.mkdir(this.paths.aiJobsRoot, { recursive: true, mode: 0o700 });
    this.cliService.on("notification", this.notificationHandler);
    this.cliService.on("serverRequest", this.serverRequestHandler);
  }

  async shutdown(): Promise<void> {
    this.cliService.off("notification", this.notificationHandler);
    this.cliService.off("serverRequest", this.serverRequestHandler);
  }

  // ----------------------------------------------------------------- jobs

  async createJob(request: ThemeGenerationRequest): Promise<AiThemeJob> {
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const job: AiThemeJob = {
      jobId,
      stage: "created",
      createdAt: now,
      updatedAt: now,
      request,
      threadId: null,
      error: null,
      candidates: [],
      selectedCandidateId: null,
      recipe: null,
      savedThemeDir: null,
    };
    await this.writeJob(job);
    await this.ensureJobDirs(jobId);
    this.emit("jobChanged", job);
    return job;
  }

  async startJob(jobId: string): Promise<void> {
    const job = await this.readJob(jobId);
    if (!["created", "failed", "cancelled"].includes(job.stage)) {
      throw new Error(`Job cannot be started from stage ${job.stage}`);
    }
    await this.updateJob(job, { stage: "preparing", error: null });

    try {
      const client = await this.cliService.getConnectedClient();
      await this.ensureThread(job, client);

      this.activeJobId = jobId;

      if (job.request.mode === "recipe-only" || job.request.mode === "use-reference-image") {
        await this.runRecipeTurn(job, client);
      } else {
        await this.runImageTurn(job, client);
      }
    } catch (err) {
      await this.failJob(job, (err as Error).message);
    }
  }

  async selectCandidate(jobId: string, candidateId: string): Promise<void> {
    const job = await this.readJob(jobId);
    const candidate = job.candidates.find((c) => c.candidateId === candidateId);
    if (!candidate) throw new Error("Candidate not found");
    await this.updateJob(job, { selectedCandidateId: candidateId, stage: "generating-recipe" });

    try {
      const client = await this.cliService.getConnectedClient();
      await this.ensureThread(job, client);
      this.activeJobId = jobId;
      await this.runRecipeTurn(job, client, candidate.imagePath);
    } catch (err) {
      await this.failJob(job, (err as Error).message);
    }
  }

  async refineJob(jobId: string, instruction: string, regenerateImage: boolean): Promise<void> {
    const job = await this.readJob(jobId);
    if (!job.threadId) throw new Error("Job has no thread to refine");
    await this.updateJob(job, {
      stage: regenerateImage ? "generating-images" : "generating-recipe",
      error: null,
    });

    try {
      const client = await this.cliService.getConnectedClient();
      await this.ensureThread(job, client);
      this.activeJobId = jobId;
      if (regenerateImage) {
        await this.runImageTurn(job, client, instruction);
      } else {
        const imagePath = job.selectedCandidateId
          ? job.candidates.find((c) => c.candidateId === job.selectedCandidateId)?.imagePath
          : undefined;
        await this.runRecipeTurn(job, client, imagePath, instruction);
      }
    } catch (err) {
      await this.failJob(job, (err as Error).message);
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = await this.readJob(jobId);
    try {
      if (this.currentTurnId && job.threadId) {
        const client = this.cliService.getStatus().appServerRunning
          ? await this.cliService.getConnectedClient().catch(() => null)
          : null;
        if (client) {
          await client.request("turn/interrupt", { threadId: job.threadId, turnId: this.currentTurnId });
        }
      }
    } catch (err) {
      this.log("warn", `Interrupt turn failed: ${(err as Error).message}`);
    }
    await this.updateJob(job, { stage: "cancelled" });
    this.activeJobId = null;
  }

  async retryJob(jobId: string): Promise<void> {
    const job = await this.readJob(jobId);
    if (!["failed", "cancelled"].includes(job.stage)) throw new Error("Only failed or cancelled jobs can be retried");
    await this.startJob(jobId);
  }

  async getJob(jobId: string): Promise<AiThemeJob> {
    return this.readJob(jobId);
  }

  async listJobs(): Promise<AiThemeJobSummary[]> {
    const out: AiThemeJobSummary[] = [];
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.paths.aiJobsRoot);
    } catch {
      return out;
    }
    for (const entry of entries.sort()) {
      const file = path.join(this.paths.aiJobsRoot, entry, "job.json");
      try {
        const raw = JSON.parse(await fs.readFile(file, "utf8")) as AiThemeJob;
        out.push({
          jobId: raw.jobId,
          stage: raw.stage,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
          prompt: raw.request.prompt,
          selectedCandidateId: raw.selectedCandidateId,
          savedThemeDir: raw.savedThemeDir,
          error: raw.error,
        });
      } catch {
        // ignore invalid job dirs
      }
    }
    return out;
  }

  async deleteJob(jobId: string): Promise<void> {
    const dir = path.join(this.paths.aiJobsRoot, jobId);
    const realRoot = await fs.realpath(this.paths.aiJobsRoot).catch(() => null);
    const realDir = await fs.realpath(dir).catch(() => null);
    if (!realRoot || !realDir || !realDir.startsWith(realRoot + path.sep)) {
      throw new Error("Invalid job directory.");
    }
    await fs.rm(realDir, { recursive: true, force: true });
  }

  async respondToApproval(requestId: string, decision: CodexApprovalDecision): Promise<void> {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) throw new Error("审批请求已失效或不存在。");
    const client = await this.cliService.getConnectedClient().catch(() => null);
    if (!client) throw new Error("App Server 未连接,无法响应审批。");
    this.pendingApprovals.delete(requestId);
    if (decision === "accept") {
      client.respondToServerRequest(pending.id, { approved: true });
    } else {
      client.rejectServerRequest(pending.id, "user_declined", `User ${decision} the request.`);
    }
  }

  // ---------------------------------------------------------- turns

  /**
   * Make sure the job's Codex thread exists and is loaded in the running
   * App Server. Threads persist across app restarts, so a stored threadId
   * must be resumed before turn/start will accept it. The sandbox is
   * workspace-write scoped to the job directory (so generated images can be
   * saved there) and the "never" approval policy auto-denies anything else.
   */
  private async ensureThread(job: AiThemeJob, client: CodexAppServerClient): Promise<void> {
    const threadOptions = {
      cwd: this.jobDir(job.jobId),
      approvalPolicy: "never",
      sandbox: "workspace-write",
    };
    if (job.threadId) {
      try {
        await client.request("thread/resume", { threadId: job.threadId, ...threadOptions });
        return;
      } catch (err) {
        this.log("warn", `恢复 thread ${job.threadId} 失败,将新建:${(err as Error).message}`);
        job.threadId = null;
      }
    }
    const threadResult = (await client.request("thread/start", threadOptions)) as { thread: { id: string } };
    job.threadId = threadResult.thread.id;
    await this.writeJob(job);
  }

  private async runImageTurn(job: AiThemeJob, client: CodexAppServerClient, extraInstruction?: string): Promise<void> {
    await this.updateJob(job, { stage: "generating-images" });
    const prompt = this.buildImagePrompt(job.request, extraInstruction);
    const inputs: unknown[] = [
      { type: "skill", name: "generate-codex-theme", path: this.paths.skillsRoot },
      { type: "text", text: prompt, text_elements: [] },
    ];
    if (job.request.referenceImagePath) {
      inputs.push({ type: "localImage", path: job.request.referenceImagePath });
    }
    await client.request("turn/start", {
      threadId: job.threadId,
      input: inputs,
    });
  }

  private async runRecipeTurn(job: AiThemeJob, client: CodexAppServerClient, imagePath?: string, extraInstruction?: string): Promise<void> {
    await this.updateJob(job, { stage: "generating-recipe" });
    const prompt = this.buildRecipePrompt(job.request, imagePath, extraInstruction);
    const inputs: unknown[] = [
      { type: "skill", name: "generate-codex-theme", path: this.paths.skillsRoot },
      { type: "text", text: prompt, text_elements: [] },
    ];
    if (imagePath) {
      inputs.push({ type: "localImage", path: imagePath });
    }
    await client.request("turn/start", {
      threadId: job.threadId,
      input: inputs,
      outputSchema: RECIPE_JSON_SCHEMA,
    });
  }

  // ------------------------------------------------------- notifications

  private async onAppServerNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const jobId = this.activeJobId;
    if (!jobId) return;

    // Every turn/item notification carries the threadId; drop events that
    // belong to a different thread than the active job's.
    const threadId = params?.threadId as string | undefined;
    if (threadId) {
      const job = await this.readJob(jobId).catch(() => null);
      if (!job || job.threadId !== threadId) return;
    }

    if (method === "turn/started") {
      const turn = params?.turn as { id?: string } | undefined;
      this.currentTurnId = turn?.id ?? null;
      return;
    }

    if (method === "turn/completed" || method === "error") {
      this.currentTurnId = null;
      // turn/completed may arrive before last item; wait a tick for item/completed.
      setTimeout(() => void this.finalizeTurnIfNeeded(jobId), 250);
      return;
    }

    if (method === "item/completed") {
      const item = params?.item as Record<string, unknown> | undefined;
      if (!item) return;
      await this.handleItemCompleted(jobId, item);
    }

    if (method === "item/started") {
      const item = params?.item as Record<string, unknown> | undefined;
      const itemType = (item?.type as string) ?? "unknown";
      await this.updateProgress(jobId, itemType, progressTextForItem(itemType));
    }

    if (method === "message") {
      const text = params?.text as string | undefined;
      if (text) await this.updateProgress(jobId, "message", text.slice(0, 240));
    }
  }

  private async updateProgress(jobId: string, itemType: string, message: string): Promise<void> {
    const job = await this.readJob(jobId).catch(() => null);
    if (!job) return;
    job.progressItemType = itemType;
    job.progressMessage = message;
    await this.writeJob(job);
    this.emit("jobChanged", job);
  }

  private onAppServerServerRequest(id: number | string, method: string, params?: Record<string, unknown>): void {
    const jobId = this.activeJobId;
    if (!jobId) return;
    const requestId = crypto.randomUUID();
    this.pendingApprovals.set(requestId, { id, method });
    const kind = inferApprovalKind(method, params);
    this.emit("approvalRequested", {
      requestId,
      jobId,
      kind,
      title: `Codex 请求 ${kind}`,
      detail: JSON.stringify({ method, params }, null, 2).slice(0, 500),
    });
  }

  private async handleItemCompleted(jobId: string, item: Record<string, unknown>): Promise<void> {
    const job = await this.readJob(jobId);
    const type = item.type as string;

    if (type === "imageGeneration") {
      const savedPath = item.savedPath as string | undefined;
      if (savedPath) {
        const ext = path.extname(savedPath).toLowerCase();
        if (!path.isAbsolute(savedPath) || !IMAGE_EXTENSIONS.has(ext)) {
          this.log("warn", `忽略无效的生成图片路径:${savedPath}`);
          return;
        }
        const stat = await fs.stat(savedPath).catch(() => null);
        if (!stat?.isFile() || stat.size < 1 || stat.size > MAX_ART_BYTES) {
          this.log("warn", `生成图片不存在或超出大小限制:${savedPath}`);
          return;
        }
        const candidateId = crypto.randomUUID();
        const targetName = `candidate-${candidateId}${ext}`;
        const targetPath = path.join(this.candidatesDir(jobId), targetName);
        await fs.copyFile(savedPath, targetPath);
        const candidate: AiThemeCandidate = {
          candidateId,
          imagePath: targetPath,
          previewUrl: registerPickedImage(targetPath),
          itemId: item.id as string | undefined,
        };
        job.candidates.push(candidate);
        if (job.request.mode === "recipe-only" || job.request.mode === "use-reference-image") {
          // recipe-only should not produce images; treat as unexpected.
        } else if (job.request.candidateCount === 1 || job.candidates.length >= job.request.candidateCount) {
          await this.updateJob(job, { stage: "awaiting-selection" });
        } else {
          await this.writeJob(job);
          this.emit("jobChanged", job);
        }
      }
      return;
    }

    if (type === "agentMessage") {
      const text = item.text as string;
      const recipe = this.parseRecipeFromText(text);
      if (recipe) {
        job.recipe = recipe;
        await this.writeJob(job);
        await this.finalizeRecipe(job, recipe);
      }
    }
  }

  private async finalizeTurnIfNeeded(jobId: string): Promise<void> {
    const job = await this.readJob(jobId).catch(() => null);
    if (!job) return;
    if (job.stage === "generating-images") {
      if (job.candidates.length > 0) {
        await this.updateJob(job, { stage: "awaiting-selection" });
      } else {
        await this.failJob(job, "本次生成没有产生候选图,请重试或调整描述。");
      }
      return;
    }
    // A recipe turn that ended without a parseable recipe would otherwise
    // leave the job spinning forever.
    if (job.stage === "generating-recipe" && !job.recipe) {
      await this.failJob(job, "模型没有返回合法的主题配方,请重试。");
    }
  }

  private async finalizeRecipe(job: AiThemeJob, recipe: ThemeGenerationRecipe): Promise<void> {
    await this.updateJob(job, { stage: "synthesizing" });
    const imagePath =
      job.selectedCandidateId
        ? job.candidates.find((c) => c.candidateId === job.selectedCandidateId)?.imagePath
        : job.candidates[0]?.imagePath;
    if (!imagePath) {
      await this.failJob(job, "没有可用的候选图来合成主题。");
      return;
    }

    try {
      const { draft } = await synthesizeTheme({ request: job.request, recipe, imagePath });
      const summary = await this.store.saveThemeDraft(draft);
      job.savedThemeDir = summary.dir;
      await this.updateJob(job, { stage: "completed" });
    } catch (err) {
      await this.failJob(job, `合成主题失败:${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------- helpers

  private buildImagePrompt(request: ThemeGenerationRequest, extra?: string): string {
    const lines = [
      `Mode: generate-image.`,
      `Candidate number: ${request.candidateCount}.`,
      `Appearance preference: ${request.appearance}.`,
      request.layoutPreference ? `Preferred layout: ${request.layoutPreference}.` : "",
      `User request: ${request.prompt}`,
      extra ? `Additional instruction: ${extra}` : "",
      "Generate a hero image first. Do not output the Recipe yet; wait for the next turn.",
    ];
    return lines.filter(Boolean).join("\n");
  }

  private buildRecipePrompt(request: ThemeGenerationRequest, imagePath?: string, extra?: string): string {
    const lines = [
      `Mode: ${imagePath ? "use-reference-image" : "recipe-only"}.`,
      `Appearance preference: ${request.appearance}.`,
      request.layoutPreference ? `Preferred layout: ${request.layoutPreference}.` : "",
      imagePath ? `Use the provided image as the hero and wallpaper source.` : "",
      `User request: ${request.prompt}`,
      extra ? `Refinement: ${extra}` : "",
      "Output only the Theme Recipe JSON matching the schema. Do not generate any image.",
    ];
    return lines.filter(Boolean).join("\n");
  }

  private parseRecipeFromText(text: string): ThemeGenerationRecipe | null {
    const codeBlock = /```json\s*([\s\S]*?)\s*```/i.exec(text);
    const jsonText = codeBlock ? codeBlock[1] : text;
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    try {
      return JSON.parse(jsonText.slice(firstBrace, lastBrace + 1)) as ThemeGenerationRecipe;
    } catch {
      return null;
    }
  }

  private async failJob(job: AiThemeJob, error: string): Promise<void> {
    this.log("error", `Job ${job.jobId} failed: ${error}`);
    await this.updateJob(job, { stage: "failed", error });
    this.activeJobId = null;
  }

  private async updateJob(job: AiThemeJob, patch: Partial<AiThemeJob>): Promise<AiThemeJob> {
    const next: AiThemeJob = { ...job, ...patch, updatedAt: new Date().toISOString() };
    await this.writeJob(next);
    this.emit("jobChanged", next);
    return next;
  }

  private async writeJob(job: AiThemeJob): Promise<void> {
    const file = path.join(this.jobDir(job.jobId), "job.json");
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(tmp, `${JSON.stringify(job, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(tmp, file);
  }

  private async readJob(jobId: string): Promise<AiThemeJob> {
    const file = path.join(this.jobDir(jobId), "job.json");
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as AiThemeJob;
    return raw;
  }

  private async ensureJobDirs(jobId: string): Promise<void> {
    for (const dir of [this.candidatesDir(jobId), this.recipeDir(jobId), this.logsDir(jobId)]) {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    }
  }

  private jobDir(jobId: string): string {
    return path.join(this.paths.aiJobsRoot, jobId);
  }

  private candidatesDir(jobId: string): string {
    return path.join(this.jobDir(jobId), "candidates");
  }

  private recipeDir(jobId: string): string {
    return path.join(this.jobDir(jobId), "recipe");
  }

  private logsDir(jobId: string): string {
    return path.join(this.jobDir(jobId), "logs");
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    this.emit("log", level, message);
  }
}

function progressTextForItem(itemType: string): string {
  switch (itemType) {
    case "imageGeneration":
      return "正在生成图片…";
    case "agentMessage":
      return "正在编写主题配方…";
    case "functionCall":
      return "正在调用工具…";
    case " reasoning":
      return "正在推理…";
    default:
      return `正在处理 ${itemType}…`;
  }
}

function inferApprovalKind(method: string, params?: Record<string, unknown>): CodexApprovalRequest["kind"] {
  if (method.includes("command")) return "command";
  if (method.includes("file")) return "file";
  if (method.includes("permission")) return "permissions";
  if (method.includes("patch")) return "patch";
  return "unknown";
}
