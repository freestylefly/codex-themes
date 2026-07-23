/**
 * Durable, multi-turn AI theme creation service.
 *
 * A job is a conversation. Image candidates are grouped into immutable batches
 * and every accepted recipe becomes an immutable revision. Nothing is written
 * into the user's theme library until a revision is explicitly adopted.
 */

import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AiThemeCandidate,
  AiThemeCandidateBatch,
  AiThemeJob,
  AiThemeJobSummary,
  AiThemeMessage,
  AiThemeMessageInput,
  AiThemeOperation,
  AiThemeRevision,
  AiThemeStructuredResult,
  CodexApprovalDecision,
  CodexApprovalRequest,
  ThemeGenerationRecipe,
  ThemeGenerationRequest,
  ThemeSummary,
} from "../shared/types";
import type { AppPaths } from "../paths";
import type { ThemeStore } from "../themes/store";
import type { CodexCliStatusService } from "../codex-cli/status";
import type { CodexAppServerClient } from "../codex-cli/app-server";
import { registerPickedImage } from "../picked-images";
import { AI_THEME_RESULT_JSON_SCHEMA } from "./recipe-schema";
import { synthesizeTheme } from "./synthesizer";
import { validateThemeRecipe } from "./recipe-validator";
import { IMAGE_EXTENSIONS, MAX_ART_BYTES } from "../engine/constants";

const MAX_IMAGE_ATTEMPTS = 3;
const MAX_MESSAGE_LENGTH = 1_600;

export class AiThemeJobService extends EventEmitter {
  private activeJobId: string | null = null;
  private pendingApprovals = new Map<string, { id: number | string; method: string }>();
  private threadToJobId = new Map<string, string>();
  private notificationQueues = new Map<string, Promise<void>>();
  private previewUrls = new Map<string, string>();

  private notificationHandler = (method: string, params: unknown) => {
    const payload = params as Record<string, unknown> | undefined;
    const threadId = payload?.threadId as string | undefined;
    const jobId = (threadId && this.threadToJobId.get(threadId)) || this.activeJobId;
    if (!jobId) return;
    this.enqueueNotification(jobId, () => this.onAppServerNotification(jobId, method, payload));
  };

  private serverRequestHandler = (id: number | string, method: string, params: unknown) =>
    this.onAppServerServerRequest(id, method, params as Record<string, unknown> | undefined);

  constructor(
    private paths: AppPaths,
    private cliService: CodexCliStatusService,
    private store: ThemeStore,
  ) {
    super();
  }

  async init(): Promise<void> {
    await fs.mkdir(this.paths.aiJobsRoot, { recursive: true, mode: 0o700 });
    this.cliService.on("notification", this.notificationHandler);
    this.cliService.on("serverRequest", this.serverRequestHandler);
  }

  async shutdown(): Promise<void> {
    this.cliService.off("notification", this.notificationHandler);
    this.cliService.off("serverRequest", this.serverRequestHandler);
  }

  // ---------------------------------------------------------------- jobs

  async createJob(request: ThemeGenerationRequest): Promise<AiThemeJob> {
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const firstMessage: AiThemeMessage = {
      messageId: crypto.randomUUID(),
      role: "user",
      text: request.prompt.trim(),
      createdAt: now,
      status: "pending",
      mode: request.mode === "generate-image" ? "regenerate-image" : "theme-only",
    };
    const job: AiThemeJob = {
      jobId,
      stage: "created",
      createdAt: now,
      updatedAt: now,
      request: { ...request, prompt: request.prompt.trim() },
      threadId: null,
      error: null,
      candidates: [],
      selectedCandidateId: null,
      recipe: null,
      savedThemeDir: null,
      messages: [firstMessage],
      candidateBatches: [],
      revisions: [],
      currentRevisionId: null,
      adoptedRevisionId: null,
      adoptedThemeId: null,
      operation: null,
    };
    await this.ensureJobDirs(jobId);
    await this.persist(job);
    return job;
  }

  async startJob(jobId: string): Promise<void> {
    const job = await this.readJob(jobId);
    if (this.isOperationRunning(job)) throw new Error("当前创作任务仍在运行。");
    if (!["created", "failed", "cancelled", "preview-ready", "completed"].includes(job.stage)) {
      throw new Error(`Job cannot be started from stage ${job.stage}`);
    }

    job.stage = "preparing";
    job.error = null;
    this.markMessage(job, job.messages[0]?.messageId, { status: "running" });
    await this.persist(job);

    try {
      const client = await this.cliService.getConnectedClient();
      await this.ensureThread(job, client);
      this.activeJobId = jobId;

      if (job.request.mode === "generate-image") {
        await this.beginImageBatch(
          job,
          client,
          "initial-images",
          job.messages[0]?.messageId ?? null,
          job.request.prompt,
          null,
        );
        return;
      }

      if (job.request.referenceImagePath) {
        const candidate = await this.createReferenceCandidate(job, job.request.referenceImagePath);
        await this.runRecipeOperation(
          job,
          client,
          candidate.candidateId,
          job.request.prompt,
          job.messages[0]?.messageId ?? null,
          null,
        );
        return;
      }

      throw new Error("使用参考图或仅生成配方时，请先添加一张主题图片。");
    } catch (error) {
      await this.failCurrentOperation(jobId, (error as Error).message);
    }
  }

  async sendMessage(jobId: string, input: AiThemeMessageInput): Promise<void> {
    const text = input.text.trim();
    if (!text) throw new Error("请输入想调整的内容。");
    if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`调整内容不能超过 ${MAX_MESSAGE_LENGTH} 个字符。`);

    const job = await this.readJob(jobId);
    if (this.isOperationRunning(job)) throw new Error("当前调整仍在生成，请完成或停止后再发送。");
    const revision = this.currentRevision(job);
    if (!revision) throw new Error("请先完成首个主题版本，再继续对话调整。");

    const message: AiThemeMessage = {
      messageId: crypto.randomUUID(),
      role: "user",
      text,
      createdAt: new Date().toISOString(),
      status: "pending",
      mode: input.mode,
    };
    job.messages.push(message);
    job.error = null;
    await this.persist(job);

    try {
      const client = await this.cliService.getConnectedClient();
      await this.ensureThread(job, client);
      this.activeJobId = jobId;
      if (input.mode === "regenerate-image") {
        await this.beginImageBatch(
          job,
          client,
          "image-regeneration",
          message.messageId,
          text,
          revision.revisionId,
        );
      } else {
        await this.runRecipeOperation(
          job,
          client,
          revision.candidateId,
          text,
          message.messageId,
          revision.revisionId,
        );
      }
    } catch (error) {
      await this.failCurrentOperation(jobId, (error as Error).message, message.messageId);
    }
  }

  /** Compatibility adapter for the previous boolean refinement API. */
  async refineJob(jobId: string, instruction: string, regenerateImage: boolean): Promise<void> {
    return this.sendMessage(jobId, {
      text: instruction,
      mode: regenerateImage ? "regenerate-image" : "theme-only",
    });
  }

  async selectCandidate(jobId: string, batchId: string, candidateId?: string): Promise<void> {
    // Legacy callers passed only (jobId, candidateId).
    const job = await this.readJob(jobId);
    const resolvedCandidateId = candidateId ?? batchId;
    const batch = candidateId
      ? job.candidateBatches.find((item) => item.batchId === batchId)
      : job.candidateBatches.find((item) => item.candidates.some((candidate) => candidate.candidateId === resolvedCandidateId));
    if (!batch) throw new Error("Candidate batch not found");
    const candidate = batch.candidates.find((item) => item.candidateId === resolvedCandidateId);
    if (!candidate) throw new Error("Candidate not found");
    if (batch.candidates.length < batch.requestedCount && batch.status !== "partial") {
      throw new Error("候选主图仍在生成，请稍候。");
    }
    if (this.isOperationRunning(job)) throw new Error("当前创作任务仍在运行。");

    batch.selectedCandidateId = candidate.candidateId;
    batch.status = "completed";
    job.selectedCandidateId = candidate.candidateId;
    job.candidates = batch.candidates;
    await this.persist(job);

    try {
      const client = await this.cliService.getConnectedClient();
      await this.ensureThread(job, client);
      this.activeJobId = jobId;
      const sourceMessage = batch.sourceMessageId
        ? job.messages.find((message) => message.messageId === batch.sourceMessageId)
        : null;
      await this.runRecipeOperation(
        job,
        client,
        candidate.candidateId,
        batch.instruction || sourceMessage?.text || job.request.prompt,
        batch.sourceMessageId,
        batch.baseRevisionId,
      );
    } catch (error) {
      await this.failCurrentOperation(jobId, (error as Error).message, batch.sourceMessageId);
    }
  }

  async setCurrentRevision(jobId: string, revisionId: string): Promise<AiThemeJob> {
    const job = await this.readJob(jobId);
    const revision = job.revisions.find((item) => item.revisionId === revisionId);
    if (!revision) throw new Error("主题版本不存在。");
    if (this.isOperationRunning(job)) throw new Error("生成过程中不能切换版本。");
    job.currentRevisionId = revisionId;
    job.recipe = revision.recipe;
    job.selectedCandidateId = revision.candidateId;
    job.stage = "preview-ready";
    job.error = null;
    await this.persist(job);
    return job;
  }

  async adoptRevision(jobId: string, revisionId: string): Promise<ThemeSummary> {
    const job = await this.readJob(jobId);
    const revision = job.revisions.find((item) => item.revisionId === revisionId);
    if (!revision) throw new Error("主题版本不存在。");
    if (this.isOperationRunning(job)) throw new Error("请等待当前生成完成后再采用版本。");
    const candidate = this.findCandidate(job, revision.candidateId);
    if (!candidate) throw new Error("该版本的主图已经丢失。");

    const operation = this.newOperation("adopt", {
      sourceMessageId: revision.sourceMessageId,
      baseRevisionId: revision.parentRevisionId,
      candidateId: revision.candidateId,
    });
    job.operation = operation;
    job.stage = "adopting";
    job.error = null;
    await this.persist(job);

    try {
      const { draft } = await synthesizeTheme({
        request: job.request,
        recipe: revision.recipe,
        imagePath: candidate.imagePath,
      });
      const summary = job.adoptedThemeId
        ? await this.store.updateTheme(job.adoptedThemeId, draft)
        : await this.store.saveThemeDraft(draft);
      job.adoptedThemeId = summary.id;
      job.adoptedRevisionId = revision.revisionId;
      job.savedThemeDir = summary.dir;
      job.currentRevisionId = revision.revisionId;
      job.recipe = revision.recipe;
      job.selectedCandidateId = revision.candidateId;
      job.stage = "preview-ready";
      job.operation = {
        ...operation,
        status: "completed",
        stage: "preview-ready",
        completedAt: new Date().toISOString(),
      };
      await this.persist(job);
      return summary;
    } catch (error) {
      await this.failCurrentOperation(jobId, `采用主题版本失败：${(error as Error).message}`);
      throw error;
    }
  }

  async cancelOperation(jobId: string, operationId: string): Promise<void> {
    const job = await this.readJob(jobId);
    const operation = job.operation;
    if (!operation || operation.operationId !== operationId || operation.status !== "running") return;

    try {
      if (operation.turnId && job.threadId) {
        const client = this.cliService.getStatus().appServerRunning
          ? await this.cliService.getConnectedClient().catch(() => null)
          : null;
        if (client) {
          await client.request("turn/interrupt", {
            threadId: job.threadId,
            turnId: operation.turnId,
          });
        }
      }
    } catch (error) {
      this.log("warn", `Interrupt turn failed: ${(error as Error).message}`);
    }

    operation.status = "cancelled";
    operation.completedAt = new Date().toISOString();
    operation.error = "用户停止了本次生成。";
    const batch = operation.batchId
      ? job.candidateBatches.find((item) => item.batchId === operation.batchId)
      : null;
    if (batch) batch.status = "cancelled";
    this.markMessage(job, operation.sourceMessageId, { status: "cancelled" });
    job.stage = job.currentRevisionId ? "preview-ready" : "cancelled";
    job.error = null;
    job.progressMessage = "已停止本次生成";
    await this.persist(job);
  }

  async retryOperation(jobId: string, operationId: string): Promise<void> {
    const job = await this.readJob(jobId);
    const previous = job.operation;
    if (!previous || previous.operationId !== operationId || !["failed", "cancelled"].includes(previous.status)) {
      throw new Error("该操作当前不能重试。");
    }

    const client = await this.cliService.getConnectedClient();
    await this.ensureThread(job, client);
    this.activeJobId = jobId;
    job.error = null;
    this.markMessage(job, previous.sourceMessageId, { status: "running" });

    if (previous.batchId) {
      const batch = job.candidateBatches.find((item) => item.batchId === previous.batchId);
      if (!batch) throw new Error("候选批次不存在。");
      batch.status = "generating";
      batch.error = null;
      const missingSlot = this.firstMissingSlot(batch);
      if (!missingSlot) {
        batch.status = "awaiting-selection";
        job.stage = "awaiting-selection";
        job.operation = {
          ...previous,
          operationId: crypto.randomUUID(),
          status: "completed",
          stage: "awaiting-selection",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          error: null,
        };
        await this.persist(job);
        return;
      }
      batch.attemptsBySlot[String(missingSlot)] = 0;
      job.operation = this.newOperation(
        previous.type === "initial-images" ? "initial-images" : "image-regeneration",
        {
          sourceMessageId: previous.sourceMessageId,
          batchId: batch.batchId,
          baseRevisionId: batch.baseRevisionId,
          currentSlot: missingSlot,
        },
      );
      await this.runImageTurn(job, client);
      return;
    }

    if (previous.candidateId) {
      const message = previous.sourceMessageId
        ? job.messages.find((item) => item.messageId === previous.sourceMessageId)
        : null;
      await this.runRecipeOperation(
        job,
        client,
        previous.candidateId,
        message?.text ?? job.request.prompt,
        previous.sourceMessageId,
        previous.baseRevisionId,
      );
      return;
    }

    throw new Error("没有可重试的生成上下文。");
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = await this.readJob(jobId);
    if (!job.operation) return;
    return this.cancelOperation(jobId, job.operation.operationId);
  }

  async retryJob(jobId: string): Promise<void> {
    const job = await this.readJob(jobId);
    if (job.operation && ["failed", "cancelled"].includes(job.operation.status)) {
      return this.retryOperation(jobId, job.operation.operationId);
    }
    if (job.revisions.length === 0) return this.startJob(jobId);
    throw new Error("当前会话没有失败的操作需要重试。");
  }

  async getJob(jobId: string): Promise<AiThemeJob> {
    return this.readJob(jobId);
  }

  async listJobs(): Promise<AiThemeJobSummary[]> {
    const output: AiThemeJobSummary[] = [];
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.paths.aiJobsRoot);
    } catch {
      return output;
    }
    for (const entry of entries.sort()) {
      try {
        const job = await this.readJob(entry);
        const current = this.currentRevision(job);
        output.push({
          jobId: job.jobId,
          stage: job.stage,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          prompt: job.request.prompt,
          selectedCandidateId: job.selectedCandidateId,
          savedThemeDir: job.savedThemeDir,
          error: job.error,
          currentRevisionNumber: current?.number ?? null,
          revisionCount: job.revisions.length,
        });
      } catch {
        // Ignore invalid job directories.
      }
    }
    return output;
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
    if (!client) throw new Error("App Server 未连接，无法响应审批。");
    this.pendingApprovals.delete(requestId);
    if (decision === "accept") {
      client.respondToServerRequest(pending.id, { approved: true });
    } else {
      client.rejectServerRequest(pending.id, "user_declined", `User ${decision} the request.`);
    }
  }

  // -------------------------------------------------------------- turns

  private async ensureThread(job: AiThemeJob, client: CodexAppServerClient): Promise<void> {
    const threadOptions = {
      cwd: this.jobDir(job.jobId),
      approvalPolicy: "never",
      sandbox: "workspace-write",
    };
    if (job.threadId) {
      try {
        await client.request("thread/resume", { threadId: job.threadId, ...threadOptions });
        this.threadToJobId.set(job.threadId, job.jobId);
        return;
      } catch (error) {
        this.log("warn", `恢复 thread ${job.threadId} 失败，将新建：${(error as Error).message}`);
        this.threadToJobId.delete(job.threadId);
        job.threadId = null;
      }
    }
    const result = (await client.request("thread/start", threadOptions)) as { thread: { id: string } };
    job.threadId = result.thread.id;
    this.threadToJobId.set(job.threadId, job.jobId);
    await this.persist(job);
  }

  private async beginImageBatch(
    job: AiThemeJob,
    client: CodexAppServerClient,
    type: "initial-images" | "image-regeneration",
    sourceMessageId: string | null,
    instruction: string,
    baseRevisionId: string | null,
  ): Promise<void> {
    const batch: AiThemeCandidateBatch = {
      batchId: crypto.randomUUID(),
      requestedCount: job.request.candidateCount,
      createdAt: new Date().toISOString(),
      sourceMessageId,
      baseRevisionId,
      instruction,
      status: "generating",
      candidates: [],
      selectedCandidateId: null,
      currentSlot: 1,
      attemptsBySlot: {},
      error: null,
    };
    job.candidateBatches.push(batch);
    job.candidates = batch.candidates;
    job.operation = this.newOperation(type, {
      sourceMessageId,
      batchId: batch.batchId,
      baseRevisionId,
      currentSlot: 1,
    });
    this.markMessage(job, sourceMessageId, {
      status: "running",
      operationId: job.operation.operationId,
    });
    await this.runImageTurn(job, client);
  }

  private async runImageTurn(job: AiThemeJob, client: CodexAppServerClient): Promise<void> {
    const operation = job.operation;
    const batch = operation?.batchId
      ? job.candidateBatches.find((item) => item.batchId === operation.batchId)
      : null;
    if (!operation || !batch) throw new Error("Image generation batch is missing.");

    const slot = this.firstMissingSlot(batch);
    if (!slot) {
      await this.finishImageBatch(job, batch, client);
      return;
    }
    const key = String(slot);
    batch.currentSlot = slot;
    batch.attemptsBySlot[key] = (batch.attemptsBySlot[key] ?? 0) + 1;
    operation.currentSlot = slot;
    operation.stage = "generating-images";
    operation.status = "running";
    operation.turnId = null;
    operation.error = null;
    job.stage = "generating-images";
    job.error = null;
    job.progressItemType = "imageGeneration";
    job.progressMessage = `正在生成第 ${batch.candidates.length + 1}/${batch.requestedCount} 张候选主图…`;
    await this.persist(job);

    const prompt = this.buildImagePrompt(
      job.request,
      batch.instruction,
      slot,
      batch.requestedCount,
      batch.attemptsBySlot[key],
    );
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

  private async runRecipeOperation(
    job: AiThemeJob,
    client: CodexAppServerClient,
    candidateId: string,
    instruction: string,
    sourceMessageId: string | null,
    baseRevisionId: string | null,
  ): Promise<void> {
    const candidate = this.findCandidate(job, candidateId);
    if (!candidate) throw new Error("没有可用的候选图来合成主题。");
    const baseRevision = baseRevisionId
      ? job.revisions.find((revision) => revision.revisionId === baseRevisionId) ?? null
      : null;
    const operation = this.newOperation("recipe", {
      sourceMessageId,
      baseRevisionId,
      candidateId,
      batchId: candidate.batchId ?? null,
    });
    job.operation = operation;
    job.stage = "generating-recipe";
    job.selectedCandidateId = candidateId;
    job.error = null;
    job.progressItemType = "agentMessage";
    job.progressMessage = "正在根据你的要求调整主题…";
    this.markMessage(job, sourceMessageId, {
      status: "running",
      operationId: operation.operationId,
    });
    await this.persist(job);

    const prompt = this.buildRecipePrompt(
      job.request,
      instruction,
      baseRevision?.recipe ?? null,
      Boolean(baseRevision),
    );
    await client.request("turn/start", {
      threadId: job.threadId,
      input: [
        { type: "skill", name: "generate-codex-theme", path: this.paths.skillsRoot },
        { type: "text", text: prompt, text_elements: [] },
        { type: "localImage", path: candidate.imagePath },
      ],
      outputSchema: AI_THEME_RESULT_JSON_SCHEMA,
    });
  }

  // ------------------------------------------------------ notifications

  private async onAppServerNotification(
    jobId: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const job = await this.readJob(jobId).catch(() => null);
    if (!job) return;
    const threadId = params?.threadId as string | undefined;
    if (threadId && job.threadId !== threadId) return;
    const notificationTurnId =
      typeof params?.turnId === "string"
        ? params.turnId
        : typeof (params?.turn as { id?: unknown } | undefined)?.id === "string"
          ? (params?.turn as { id: string }).id
          : null;

    if (method === "turn/started") {
      const turn = params?.turn as { id?: string } | undefined;
      if (job.operation?.status === "running") {
        job.operation.turnId = turn?.id ?? null;
        await this.persist(job);
      }
      return;
    }

    if (
      notificationTurnId
      && job.operation?.turnId !== notificationTurnId
    ) {
      // A Codex thread is intentionally reused across the whole creative
      // session. Delayed notifications from an older turn must never mutate
      // the currently running operation.
      return;
    }

    if (method === "item/completed") {
      const item = params?.item as Record<string, unknown> | undefined;
      if (item) await this.handleItemCompleted(job, item);
      return;
    }

    if (method === "item/started") {
      const item = params?.item as Record<string, unknown> | undefined;
      const itemType = (item?.type as string) ?? "unknown";
      job.progressItemType = itemType;
      job.progressMessage = progressTextForItem(itemType, job);
      await this.persist(job);
      return;
    }

    if (method === "message") {
      const text = params?.text as string | undefined;
      if (text) {
        job.progressItemType = "message";
        job.progressMessage = text.slice(0, 240);
        await this.persist(job);
      }
      return;
    }

    if (method === "turn/completed" || method === "error") {
      const operationId = job.operation?.operationId;
      if (!operationId) return;
      setTimeout(() => {
        this.enqueueNotification(jobId, () => this.finalizeTurnIfNeeded(jobId, operationId));
      }, 250);
    }
  }

  private async handleItemCompleted(job: AiThemeJob, item: Record<string, unknown>): Promise<void> {
    const operation = job.operation;
    if (!operation || operation.status !== "running") return;
    const type = item.type as string;

    if (type === "imageGeneration" && ["initial-images", "image-regeneration"].includes(operation.type)) {
      const batch = operation.batchId
        ? job.candidateBatches.find((entry) => entry.batchId === operation.batchId)
        : null;
      const slot = operation.currentSlot;
      const savedPath = item.savedPath as string | undefined;
      if (!batch || !slot || !savedPath || batch.candidates.some((candidate) => candidate.slot === slot)) return;
      if (item.id && batch.candidates.some((candidate) => candidate.itemId === item.id)) return;

      const ext = path.extname(savedPath).toLowerCase();
      if (!path.isAbsolute(savedPath) || !IMAGE_EXTENSIONS.has(ext)) {
        this.log("warn", `忽略无效的生成图片路径：${savedPath}`);
        return;
      }
      const stat = await fs.stat(savedPath).catch(() => null);
      if (!stat?.isFile() || stat.size < 1 || stat.size > MAX_ART_BYTES) {
        this.log("warn", `生成图片不存在或超出大小限制：${savedPath}`);
        return;
      }

      const candidateId = crypto.randomUUID();
      const targetName = `${batch.batchId}-slot-${slot}-${candidateId}${ext}`;
      const targetPath = path.join(this.candidatesDir(job.jobId), targetName);
      await fs.copyFile(savedPath, targetPath);
      const candidate: AiThemeCandidate = {
        candidateId,
        batchId: batch.batchId,
        slot,
        imagePath: targetPath,
        previewUrl: this.previewUrlFor(targetPath),
        itemId: item.id as string | undefined,
        sha256: await sha256File(targetPath),
      };
      batch.candidates.push(candidate);
      batch.candidates.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
      job.candidates = batch.candidates;
      job.progressMessage = `已生成 ${batch.candidates.length}/${batch.requestedCount} 张候选主图`;
      await this.persist(job);
      return;
    }

    if (type === "agentMessage" && operation.type === "recipe") {
      const text = item.text as string;
      const result = this.parseStructuredResult(text);
      if (result) await this.finalizeRevision(job, result);
    }
  }

  private async finalizeTurnIfNeeded(jobId: string, operationId: string): Promise<void> {
    const job = await this.readJob(jobId).catch(() => null);
    if (!job || job.operation?.operationId !== operationId || job.operation.status !== "running") return;
    const operation = job.operation;

    if (["initial-images", "image-regeneration"].includes(operation.type)) {
      const batch = operation.batchId
        ? job.candidateBatches.find((entry) => entry.batchId === operation.batchId)
        : null;
      if (!batch) {
        await this.failCurrentOperation(jobId, "候选主图批次已经丢失。", operation.sourceMessageId);
        return;
      }
      const slot = operation.currentSlot;
      const produced = slot ? batch.candidates.some((candidate) => candidate.slot === slot) : false;
      const client = await this.cliService.getConnectedClient().catch(() => null);
      if (!client) {
        await this.failCurrentOperation(jobId, "Codex App Server 已断开，请重试。", operation.sourceMessageId);
        return;
      }

      if (produced) {
        if (batch.candidates.length >= batch.requestedCount) {
          await this.finishImageBatch(job, batch, client);
        } else {
          await this.runImageTurn(job, client);
        }
        return;
      }

      const attempts = slot ? batch.attemptsBySlot[String(slot)] ?? 0 : MAX_IMAGE_ATTEMPTS;
      if (attempts < MAX_IMAGE_ATTEMPTS) {
        job.progressMessage = `第 ${slot}/${batch.requestedCount} 张未返回有效图片，正在自动重试 ${attempts + 1}/${MAX_IMAGE_ATTEMPTS}…`;
        await this.persist(job);
        await this.runImageTurn(job, client);
        return;
      }

      batch.status = "partial";
      batch.error = `第 ${slot}/${batch.requestedCount} 张候选图连续生成失败。`;
      await this.persist(job);
      await this.failCurrentOperation(
        jobId,
        `${batch.error} 已保留 ${batch.candidates.length} 张有效结果，可点击重试继续补齐。`,
        operation.sourceMessageId,
      );
      return;
    }

    if (operation.type === "recipe") {
      await this.failCurrentOperation(
        jobId,
        "模型没有返回合法的主题配方，请重试本次调整。",
        operation.sourceMessageId,
      );
    }
  }

  private async finishImageBatch(
    job: AiThemeJob,
    batch: AiThemeCandidateBatch,
    client: CodexAppServerClient,
  ): Promise<void> {
    batch.status = "awaiting-selection";
    batch.currentSlot = null;
    if (job.operation) {
      job.operation.status = "completed";
      job.operation.stage = "awaiting-selection";
      job.operation.currentSlot = null;
      job.operation.turnId = null;
      job.operation.completedAt = new Date().toISOString();
    }
    job.stage = "awaiting-selection";
    job.candidates = batch.candidates;
    job.progressMessage = `候选主图已生成 ${batch.candidates.length}/${batch.requestedCount}`;
    await this.persist(job);

    if (batch.requestedCount === 1 && batch.candidates[0]) {
      // Auto-select a single candidate; multi-candidate batches wait for a
      // deliberate visual choice from the user.
      await this.runRecipeOperation(
        job,
        client,
        batch.candidates[0].candidateId,
        batch.instruction,
        batch.sourceMessageId,
        batch.baseRevisionId,
      );
    }
  }

  private async finalizeRevision(job: AiThemeJob, result: AiThemeStructuredResult): Promise<void> {
    const operation = job.operation;
    if (!operation || operation.type !== "recipe" || operation.status !== "running" || !operation.candidateId) return;
    const candidate = this.findCandidate(job, operation.candidateId);
    if (!candidate) {
      await this.failCurrentOperation(job.jobId, "主题主图已经丢失。", operation.sourceMessageId);
      return;
    }

    const validationErrors = validateThemeRecipe(result.recipe);
    if (validationErrors.length > 0) {
      await this.failCurrentOperation(
        job.jobId,
        `主题配方校验失败：${validationErrors[0]}`,
        operation.sourceMessageId,
      );
      return;
    }

    try {
      await synthesizeTheme({
        request: job.request,
        recipe: result.recipe,
        imagePath: candidate.imagePath,
      });
    } catch (error) {
      await this.failCurrentOperation(
        job.jobId,
        `合成主题预览失败：${(error as Error).message}`,
        operation.sourceMessageId,
      );
      return;
    }

    const revision: AiThemeRevision = {
      revisionId: crypto.randomUUID(),
      number: job.revisions.reduce((max, item) => Math.max(max, item.number), 0) + 1,
      createdAt: new Date().toISOString(),
      parentRevisionId: operation.baseRevisionId,
      sourceMessageId: operation.sourceMessageId,
      candidateId: candidate.candidateId,
      recipe: result.recipe,
      assistantMessage: result.message.trim().slice(0, 500),
      changeSummary: result.changeSummary.slice(0, 6).map((item) => item.trim().slice(0, 120)),
    };
    job.revisions.push(revision);
    job.currentRevisionId = revision.revisionId;
    job.selectedCandidateId = revision.candidateId;
    job.recipe = revision.recipe;
    job.stage = "preview-ready";
    job.error = null;
    job.progressMessage = `v${revision.number} 预览已就绪`;
    operation.status = "completed";
    operation.stage = "preview-ready";
    operation.completedAt = new Date().toISOString();
    operation.turnId = null;
    this.markMessage(job, operation.sourceMessageId, {
      status: "completed",
      revisionId: revision.revisionId,
    });
    job.messages.push({
      messageId: crypto.randomUUID(),
      role: "assistant",
      text: revision.assistantMessage,
      createdAt: revision.createdAt,
      status: "completed",
      operationId: operation.operationId,
      revisionId: revision.revisionId,
      changeSummary: revision.changeSummary,
    });
    const batch = candidate.batchId
      ? job.candidateBatches.find((entry) => entry.batchId === candidate.batchId)
      : null;
    if (batch) {
      batch.selectedCandidateId = candidate.candidateId;
      batch.status = "completed";
    }
    await this.persist(job);
  }

  private async createReferenceCandidate(job: AiThemeJob, sourcePath: string): Promise<AiThemeCandidate> {
    const ext = path.extname(sourcePath).toLowerCase();
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (!path.isAbsolute(sourcePath) || !IMAGE_EXTENSIONS.has(ext) || !stat?.isFile() || stat.size > MAX_ART_BYTES) {
      throw new Error("参考图片不存在或格式无效。");
    }
    const batchId = crypto.randomUUID();
    const candidateId = crypto.randomUUID();
    const targetPath = path.join(this.candidatesDir(job.jobId), `${batchId}-reference-${candidateId}${ext}`);
    await fs.copyFile(sourcePath, targetPath);
    const candidate: AiThemeCandidate = {
      candidateId,
      batchId,
      slot: 1,
      imagePath: targetPath,
      previewUrl: this.previewUrlFor(targetPath),
      sha256: await sha256File(targetPath),
    };
    const batch: AiThemeCandidateBatch = {
      batchId,
      requestedCount: 1,
      createdAt: new Date().toISOString(),
      sourceMessageId: job.messages[0]?.messageId ?? null,
      baseRevisionId: null,
      instruction: job.request.prompt,
      status: "completed",
      candidates: [candidate],
      selectedCandidateId: candidateId,
      currentSlot: null,
      attemptsBySlot: { "1": 1 },
      error: null,
    };
    job.candidateBatches.push(batch);
    job.candidates = [candidate];
    job.selectedCandidateId = candidateId;
    await this.persist(job);
    return candidate;
  }

  // -------------------------------------------------------------- helpers

  private buildImagePrompt(
    request: ThemeGenerationRequest,
    instruction: string,
    slot: number,
    count: number,
    attempt: number,
  ): string {
    const variation = [
      "prioritize a clear focal subject and generous interface-safe negative space",
      "vary the camera framing, lighting direction, and depth while preserving the requested world",
      "explore a distinct but compatible color balance and atmosphere without changing the core subject",
    ][(slot - 1) % 3];
    return [
      "Mode: generate-image.",
      `Candidate slot: ${slot} of ${count}. Attempt: ${attempt} of ${MAX_IMAGE_ATTEMPTS}.`,
      "Generate exactly ONE new hero image in this turn using the image generation tool.",
      "Do not return multiple images and do not output a Theme Recipe yet.",
      `Variation requirement: ${variation}.`,
      `Appearance preference: ${request.appearance}.`,
      request.layoutPreference ? `Preferred layout: ${request.layoutPreference}.` : "",
      `Original user request: ${request.prompt}`,
      instruction && instruction !== request.prompt ? `Current user instruction: ${instruction}` : "",
      "The image must work as artwork inside the Codex desktop interface, with readable content-safe regions.",
    ].filter(Boolean).join("\n");
  }

  private buildRecipePrompt(
    request: ThemeGenerationRequest,
    instruction: string,
    baseRecipe: ThemeGenerationRecipe | null,
    isRefinement: boolean,
  ): string {
    return [
      "Mode: use-reference-image.",
      "Use the provided image as the hero and optional wallpaper source.",
      "Do not generate or modify any image in this turn.",
      `Appearance preference: ${request.appearance}.`,
      request.layoutPreference ? `Preferred layout: ${request.layoutPreference}.` : "",
      `Original user request: ${request.prompt}`,
      `Current user instruction: ${instruction}`,
      isRefinement
        ? "Refine the supplied current recipe. Preserve every setting that the new instruction does not ask to change."
        : "Create the first complete theme recipe for the selected image.",
      baseRecipe ? `Current recipe JSON:\n${JSON.stringify(baseRecipe)}` : "",
      "Return only the structured JSON requested by the output schema.",
      "message must be a concise Chinese reply to the user.",
      "changeSummary must contain 1-6 concise Chinese descriptions of the actual changes.",
    ].filter(Boolean).join("\n");
  }

  private parseStructuredResult(text: string): AiThemeStructuredResult | null {
    const value = parseJsonObject(text);
    if (!value) return null;
    const candidate = value as Partial<AiThemeStructuredResult>;
    if (
      typeof candidate.message === "string"
      && Array.isArray(candidate.changeSummary)
      && candidate.changeSummary.every((item) => typeof item === "string")
      && validateThemeRecipe(candidate.recipe).length === 0
    ) {
      return {
        message: candidate.message,
        changeSummary: candidate.changeSummary as string[],
        recipe: candidate.recipe as ThemeGenerationRecipe,
      };
    }

    // Older Codex threads may still answer with a bare recipe. Accept it and
    // synthesize neutral conversation copy so legacy sessions remain usable.
    if (validateThemeRecipe(value).length === 0) {
      return {
        message: "主题已经根据你的要求更新，当前预览可以继续调整。",
        changeSummary: ["更新主题配方并刷新预览"],
        recipe: value as ThemeGenerationRecipe,
      };
    }
    return null;
  }

  private newOperation(
    type: AiThemeOperation["type"],
    input: Partial<Pick<
      AiThemeOperation,
      "sourceMessageId" | "batchId" | "baseRevisionId" | "candidateId" | "currentSlot"
    >>,
  ): AiThemeOperation {
    return {
      operationId: crypto.randomUUID(),
      type,
      status: "running",
      stage: type === "recipe" ? "generating-recipe" : type === "adopt" ? "adopting" : "generating-images",
      startedAt: new Date().toISOString(),
      completedAt: null,
      sourceMessageId: input.sourceMessageId ?? null,
      batchId: input.batchId ?? null,
      baseRevisionId: input.baseRevisionId ?? null,
      candidateId: input.candidateId ?? null,
      currentSlot: input.currentSlot ?? null,
      turnId: null,
      error: null,
    };
  }

  private async failCurrentOperation(
    jobId: string,
    error: string,
    sourceMessageId?: string | null,
  ): Promise<void> {
    const job = await this.readJob(jobId).catch(() => null);
    if (!job) return;
    this.log("error", `Job ${job.jobId} failed: ${error}`);
    if (job.operation) {
      job.operation.status = "failed";
      job.operation.completedAt = new Date().toISOString();
      job.operation.error = error;
      job.operation.turnId = null;
    }
    this.markMessage(job, sourceMessageId ?? job.operation?.sourceMessageId, { status: "failed" });
    job.stage = job.currentRevisionId ? "preview-ready" : "failed";
    job.error = error;
    job.progressMessage = error;
    await this.persist(job);
  }

  private markMessage(
    job: AiThemeJob,
    messageId: string | null | undefined,
    patch: Partial<AiThemeMessage>,
  ): void {
    if (!messageId) return;
    const message = job.messages.find((item) => item.messageId === messageId);
    if (message) Object.assign(message, patch);
  }

  private currentRevision(job: AiThemeJob): AiThemeRevision | null {
    return job.currentRevisionId
      ? job.revisions.find((revision) => revision.revisionId === job.currentRevisionId) ?? null
      : null;
  }

  private findCandidate(job: AiThemeJob, candidateId: string): AiThemeCandidate | null {
    for (const batch of job.candidateBatches) {
      const candidate = batch.candidates.find((item) => item.candidateId === candidateId);
      if (candidate) return candidate;
    }
    return job.candidates.find((item) => item.candidateId === candidateId) ?? null;
  }

  private firstMissingSlot(batch: AiThemeCandidateBatch): number | null {
    for (let slot = 1; slot <= batch.requestedCount; slot += 1) {
      if (!batch.candidates.some((candidate) => candidate.slot === slot)) return slot;
    }
    return null;
  }

  private isOperationRunning(job: AiThemeJob): boolean {
    return job.operation?.status === "running";
  }

  private onAppServerServerRequest(
    id: number | string,
    method: string,
    params?: Record<string, unknown>,
  ): void {
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

  private enqueueNotification(jobId: string, work: () => Promise<void>): void {
    const previous = this.notificationQueues.get(jobId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(work)
      .catch((error) => {
        this.log("error", `AI notification failed: ${(error as Error).message}`);
      });
    this.notificationQueues.set(jobId, next);
    void next.finally(() => {
      if (this.notificationQueues.get(jobId) === next) this.notificationQueues.delete(jobId);
    });
  }

  private async persist(job: AiThemeJob): Promise<void> {
    job.updatedAt = new Date().toISOString();
    await this.writeJob(job);
    this.emit("jobChanged", this.hydratePreviewUrls(structuredClone(job)));
  }

  private async writeJob(job: AiThemeJob): Promise<void> {
    const file = path.join(this.jobDir(job.jobId), "job.json");
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    try {
      await fs.writeFile(temporary, `${JSON.stringify(job, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temporary, file);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private async readJob(jobId: string): Promise<AiThemeJob> {
    const file = path.join(this.jobDir(jobId), "job.json");
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Partial<AiThemeJob>;
    const job = this.migrateJob(raw);
    if (job.threadId) this.threadToJobId.set(job.threadId, job.jobId);
    return this.hydratePreviewUrls(job);
  }

  private migrateJob(raw: Partial<AiThemeJob>): AiThemeJob {
    if (!raw.jobId || !raw.request || !raw.createdAt || !raw.updatedAt) {
      throw new Error("Invalid AI job file.");
    }
    const now = raw.updatedAt;
    const legacyCandidates = raw.candidates ?? [];
    const messages = raw.messages?.length
      ? raw.messages
      : [{
          messageId: `legacy-user-${raw.jobId}`,
          role: "user" as const,
          text: raw.request.prompt,
          createdAt: raw.createdAt,
          status: raw.recipe ? "completed" as const : "pending" as const,
          mode: raw.request.mode === "generate-image" ? "regenerate-image" as const : "theme-only" as const,
        }];
    const candidateBatches = raw.candidateBatches?.length
      ? raw.candidateBatches
      : legacyCandidates.length
        ? [{
            batchId: `legacy-batch-${raw.jobId}`,
            requestedCount: Math.min(3, Math.max(1, raw.request.candidateCount)) as 1 | 2 | 3,
            createdAt: raw.createdAt,
            sourceMessageId: messages[0]?.messageId ?? null,
            baseRevisionId: null,
            instruction: raw.request.prompt,
            status: "completed" as const,
            candidates: legacyCandidates.map((candidate, index) => ({
              ...candidate,
              batchId: `legacy-batch-${raw.jobId}`,
              slot: candidate.slot ?? index + 1,
            })),
            selectedCandidateId: raw.selectedCandidateId ?? legacyCandidates[0]?.candidateId ?? null,
            currentSlot: null,
            attemptsBySlot: Object.fromEntries(legacyCandidates.map((_, index) => [String(index + 1), 1])),
            error: null,
          }]
        : [];
    const legacyCandidateId = raw.selectedCandidateId
      ?? candidateBatches[0]?.selectedCandidateId
      ?? candidateBatches[0]?.candidates[0]?.candidateId
      ?? null;
    const revisions = raw.revisions?.length
      ? raw.revisions
      : raw.recipe && legacyCandidateId
        ? [{
            revisionId: `legacy-v1-${raw.jobId}`,
            number: 1,
            createdAt: now,
            parentRevisionId: null,
            sourceMessageId: messages[0]?.messageId ?? null,
            candidateId: legacyCandidateId,
            recipe: raw.recipe,
            assistantMessage: "这个主题已经生成，可以继续在同一对话中调整。",
            changeSummary: ["生成初始主题版本"],
          }]
        : [];
    if (revisions.length > 0 && !messages.some((message) => message.role === "assistant")) {
      const revision = revisions[0];
      messages.push({
        messageId: `legacy-assistant-${raw.jobId}`,
        role: "assistant",
        text: revision.assistantMessage,
        createdAt: revision.createdAt,
        status: "completed",
        revisionId: revision.revisionId,
        changeSummary: revision.changeSummary,
      });
    }
    const currentRevisionId = raw.currentRevisionId ?? revisions.at(-1)?.revisionId ?? null;
    const adoptedThemeId = raw.adoptedThemeId
      ?? (raw.savedThemeDir ? path.basename(raw.savedThemeDir) : null);
    const adoptedRevisionId = raw.adoptedRevisionId
      ?? (adoptedThemeId ? currentRevisionId : null);
    const stage = raw.stage === "completed" && revisions.length > 0
      ? "preview-ready"
      : raw.stage ?? "created";
    return {
      jobId: raw.jobId,
      stage,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      request: raw.request,
      threadId: raw.threadId ?? null,
      error: raw.stage === "completed" && revisions.length > 0 ? null : raw.error ?? null,
      candidates: candidateBatches.at(-1)?.candidates ?? legacyCandidates,
      selectedCandidateId: raw.selectedCandidateId ?? legacyCandidateId,
      recipe: currentRevisionId
        ? revisions.find((revision) => revision.revisionId === currentRevisionId)?.recipe ?? raw.recipe ?? null
        : raw.recipe ?? null,
      savedThemeDir: raw.savedThemeDir ?? null,
      messages,
      candidateBatches,
      revisions,
      currentRevisionId,
      adoptedRevisionId,
      adoptedThemeId,
      operation: raw.operation ?? null,
      progressMessage: raw.progressMessage,
      progressItemType: raw.progressItemType,
    };
  }

  private hydratePreviewUrls(job: AiThemeJob): AiThemeJob {
    for (const batch of job.candidateBatches) {
      for (const candidate of batch.candidates) {
        candidate.previewUrl = this.previewUrlFor(candidate.imagePath);
      }
    }
    for (const candidate of job.candidates) {
      candidate.previewUrl = this.previewUrlFor(candidate.imagePath);
    }
    return job;
  }

  private previewUrlFor(imagePath: string): string {
    const existing = this.previewUrls.get(imagePath);
    if (existing) return existing;
    const previewUrl = registerPickedImage(imagePath);
    this.previewUrls.set(imagePath, previewUrl);
    return previewUrl;
  }

  private async ensureJobDirs(jobId: string): Promise<void> {
    for (const directory of [this.candidatesDir(jobId), this.recipeDir(jobId), this.logsDir(jobId)]) {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
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

function parseJsonObject(text: string): unknown | null {
  const codeBlock = /```json\s*([\s\S]*?)\s*```/i.exec(text);
  const jsonText = codeBlock ? codeBlock[1] : text;
  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(jsonText.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

async function sha256File(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function progressTextForItem(itemType: string, job: AiThemeJob): string {
  switch (itemType) {
    case "imageGeneration": {
      const batch = job.operation?.batchId
        ? job.candidateBatches.find((item) => item.batchId === job.operation?.batchId)
        : null;
      return batch
        ? `正在生成第 ${batch.candidates.length + 1}/${batch.requestedCount} 张候选主图…`
        : "正在生成候选主图…";
    }
    case "agentMessage":
      return "正在整理主题配方与修改摘要…";
    case "functionCall":
      return "正在调用本地工具…";
    case "reasoning":
      return "正在理解你的调整要求…";
    default:
      return `正在处理 ${itemType}…`;
  }
}

function inferApprovalKind(
  method: string,
  params?: Record<string, unknown>,
): CodexApprovalRequest["kind"] {
  if (method.includes("command")) return "command";
  if (method.includes("file")) return "file";
  if (method.includes("permission")) return "permissions";
  if (method.includes("patch")) return "patch";
  void params;
  return "unknown";
}
