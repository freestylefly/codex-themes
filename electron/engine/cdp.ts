/**
 * Minimal Chrome DevTools Protocol client over the loopback DevTools HTTP +
 * WebSocket endpoints. Ported from Codex-Dream-Skin's injector.mjs (MIT).
 *
 * Hard safety rules kept verbatim from the original:
 *  - only ws:// URLs on 127.0.0.1 / localhost / [::1] with the expected port;
 *  - only CDP targets of type "page" whose URL starts with app://;
 *  - a DOM probe must confirm the Codex shell before we touch a target.
 */

import { LOOPBACK_HOSTS, PROBE_EXPRESSION } from "./constants";

export interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export interface ProbeResult {
  title: string;
  href: string;
  markers: { shell: boolean; sidebar: boolean; composer: boolean; main: boolean };
  codex: boolean;
}

export interface ConnectedTarget {
  target: CdpTarget;
  session: CdpSession;
  probe: ProbeResult;
}

export function validatedDebuggerUrl(target: CdpTarget, port: number): string {
  if (!target.webSocketDebuggerUrl) throw new Error("CDP target has no WebSocket URL");
  const url = new URL(target.webSocketDebuggerUrl);
  if (url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname) || Number(url.port) !== port) {
    throw new Error(`Rejected non-loopback CDP WebSocket URL: ${url.href}`);
  }
  return url.href;
}

type Listener = (params: Record<string, unknown>) => void;

export class CdpSession {
  readonly target: CdpTarget;
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }
  >();
  private listeners = new Map<string, Listener[]>();
  closed = false;

  constructor(target: CdpTarget, port: number) {
    this.target = target;
    this.ws = new WebSocket(validatedDebuggerUrl(target, port));
  }

  async open(): Promise<this> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP WebSocket open timed out")), 5000);
      this.ws.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("CDP WebSocket open failed"));
      }, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  private onMessage(event: MessageEvent) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  on(method: string, listener: Listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value as T;
  }

  close() {
    if (!this.closed) this.ws.close();
    this.closed = true;
  }
}

/** List verified app:// page targets on the loopback DevTools endpoint. */
export async function listAppTargets(port: number): Promise<CdpTarget[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const targets = (await response.json()) as CdpTarget[];
    return targets.filter((item) => {
      if (item.type !== "page" || !item.url?.startsWith("app://") || !item.webSocketDebuggerUrl) {
        return false;
      }
      try {
        validatedDebuggerUrl(item, port);
        return true;
      } catch {
        return false;
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeSession(session: CdpSession): Promise<ProbeResult> {
  return session.evaluate<ProbeResult>(PROBE_EXPRESSION);
}

export async function connectTarget(target: CdpTarget, port: number): Promise<CdpSession> {
  return new CdpSession(target, port).open();
}

/**
 * Poll the DevTools endpoint until at least one target probes as a verified
 * Codex shell (or the deadline passes).
 */
export async function connectCodexTargets(port: number, timeoutMs: number): Promise<ConnectedTarget[]> {
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | undefined;
  while (Date.now() < deadline) {
    try {
      const targets = await listAppTargets(port);
      const connected: ConnectedTarget[] = [];
      for (const target of targets) {
        let session: CdpSession | undefined;
        try {
          session = await connectTarget(target, port);
          const probe = await probeSession(session);
          if (probe?.codex) connected.push({ target, session, probe });
          else session.close();
        } catch (error) {
          session?.close();
          lastError = error as Error;
        }
      }
      if (connected.length) return connected;
      lastError = new Error("No page matched the expected Codex shell markers");
    } catch (error) {
      lastError = error as Error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(
    `No verified Codex renderer on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`,
  );
}
