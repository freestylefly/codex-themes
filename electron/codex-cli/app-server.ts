/**
 * JSON-RPC / JSONL client for `codex app-server --listen stdio://`.
 *
 * Responsibilities:
 *   - spawn and own the single App Server child process per application instance
 *   - perform the initialize / initialized handshake
 *   - route responses to pending requests by id
 *   - surface server notifications as typed events
 *   - recover stderr into logs, never treat it as protocol data
 */

import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";

const MIN_CODEX_CLI_VERSION = "0.144.0";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number | string; message: string; data?: unknown };
}

export interface AppServerCapabilities {
  namespaceTools: boolean;
  imageGeneration: boolean;
  webSearch: boolean;
}

export interface AppServerAccount {
  type: string;
  email?: string;
  planType?: string;
}

export class CodexAppServerClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number | string, { resolve: (value: unknown) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }>();
  private buffer = "";
  private ready = false;
  private executablePath: string | null = null;

  get isReady(): boolean {
    return this.ready;
  }

  get isRunning(): boolean {
    return this.process !== null && !this.process.killed && this.process.exitCode === null;
  }

  async connect(executablePath: string): Promise<void> {
    if (this.process && !this.process.killed) {
      if (this.executablePath === executablePath) return;
      await this.disconnect();
    }

    this.executablePath = executablePath;
    this.ready = false;
    this.buffer = "";

    const child = spawn(executablePath, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.process = child;

    child.stdout?.on("data", (chunk: Buffer) => this.onData(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString("utf8").trim();
      if (line) this.emit("log", "warn", `codex app-server: ${line}`);
    });

    child.on("error", (err) => this.onFatal(err));
    child.on("exit", (code, signal) => this.onExit(code, signal));

    await this.handshake();
  }

  async disconnect(): Promise<void> {
    this.ready = false;
    const child = this.process;
    this.process = null;

    for (const { reject, timeout } of this.pending.values()) {
      clearTimeout(timeout);
      reject(new Error("App Server disconnected"));
    }
    this.pending.clear();

    if (child && !child.killed) {
      child.stdin?.end();
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
          resolve();
        }, 2_000);
        child.on("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  async request(method: string, params: unknown = {}, timeoutMs = 30_000): Promise<unknown> {
    if (!this.process || this.process.killed) {
      throw new Error("App Server is not running");
    }
    const id = this.nextId++;
    const message: JsonRpcMessage = { jsonrpc: "2.0", id, method, params };
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`App Server request '${method}' timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.write(message);
    });
  }

  notify(method: string, params: unknown = {}): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private async handshake(): Promise<void> {
    const result = await this.request("initialize", {
      clientInfo: { name: "codex-themes", version: process.env.npm_package_version ?? "0.2.0" },
    }, 10_000);
    this.emit("log", "info", `App Server initialized: ${JSON.stringify(result)}`);
    this.notify("initialized", {});
    this.ready = true;
  }

  private write(message: JsonRpcMessage): void {
    const line = `${JSON.stringify(message)}\n`;
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(line);
    } else {
      this.emit("log", "warn", "App Server stdin not writable; dropping message");
    }
  }

  private onData(text: string): void {
    this.buffer += text;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcMessage;
        this.handleMessage(msg);
      } catch (err) {
        this.emit("log", "warn", `App Server non-JSON line: ${line.slice(0, 200)}`);
      }
    }
  }

  respondToServerRequest(id: number | string, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result });
  }

  rejectServerRequest(id: number | string, code: number | string, message: string): void {
    this.write({ jsonrpc: "2.0", id, error: { code, message } });
  }

  private handleMessage(msg: JsonRpcMessage): void {
    if ("id" in msg && msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        clearTimeout(pending.timeout);
        if ("error" in msg && msg.error) {
          pending.reject(new Error(msg.error.message ?? `JSON-RPC error ${msg.error.code}`));
        } else {
          pending.resolve(msg.result);
        }
        return;
      }
      // Server-to-client request (e.g. approvals).
      if ("method" in msg && msg.method) {
        this.emit("serverRequest", msg.id, msg.method, msg.params);
        if (this.listenerCount("serverRequest") === 0) {
          this.rejectServerRequest(msg.id, -32601, `Method ${msg.method} not supported by Codex Themes`);
        }
        return;
      }
      return;
    }

    if ("method" in msg && msg.method) {
      this.emit("notification", msg.method, msg.params);
      return;
    }
  }

  private onFatal(err: Error): void {
    this.emit("log", "error", `App Server spawn error: ${err.message}`);
    this.ready = false;
    this.emit("close", err.message);
  }

  private onExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.ready = false;
    for (const { reject, timeout } of this.pending.values()) {
      clearTimeout(timeout);
      reject(new Error("App Server process exited"));
    }
    this.pending.clear();
    const reason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
    this.emit("close", reason);
  }
}

export { MIN_CODEX_CLI_VERSION };
