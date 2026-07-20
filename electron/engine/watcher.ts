/**
 * In-process watch loop. The Electron main process itself is the daemon:
 * it polls the DevTools endpoint, injects verified Codex targets, and
 * re-injects on Page.loadEventFired. Ported from injector.mjs runWatch (MIT).
 */

import { EventEmitter } from "node:events";
import {
  CdpSession,
  connectTarget,
  listAppTargets,
  probeSession,
  type CdpTarget,
} from "./cdp";
import { applyToSession, removeFromSession } from "./verify";

export interface WatcherEvents {
  log: (level: "info" | "warn" | "error", message: string) => void;
  injected: (targetId: string) => void;
}

export class ThemeWatcher extends EventEmitter {
  private sessions = new Map<string, CdpSession>();
  private rejected = new Set<string>();
  private stopping = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private port: number,
    private payload: string,
  ) {
    super();
  }

  get active(): boolean {
    return this.loopPromise !== null && !this.stopping;
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  /** Oldest live session, handy for post-apply verification/screenshots. */
  get firstSession(): CdpSession | null {
    for (const session of this.sessions.values()) {
      if (!session.closed) return session;
    }
    return null;
  }

  /** Resolve once at least one live session exists (or the deadline passes). */
  async waitForSession(timeoutMs = 30_000): Promise<CdpSession> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const session = this.firstSession;
      if (session) return session;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("No Codex renderer session appeared before the deadline.");
  }

  /** Swap payload (theme switch) and re-apply to all live sessions. */
  async setPayload(payload: string): Promise<void> {
    this.payload = payload;
    for (const session of this.sessions.values()) {
      if (session.closed) continue;
      try {
        await applyToSession(session, payload);
      } catch (error) {
        this.emitLog("warn", `re-apply failed: ${(error as Error).message}`);
      }
    }
  }

  start(): void {
    if (this.loopPromise) return;
    this.stopping = false;
    this.loopPromise = this.loop();
  }

  /** Stop the loop; optionally push the cleanup snippet into live sessions. */
  async stop(opts: { cleanupSessions?: boolean } = {}): Promise<void> {
    this.stopping = true;
    if (this.loopPromise) {
      await this.loopPromise.catch(() => {});
      this.loopPromise = null;
    }
    for (const session of this.sessions.values()) {
      try {
        if (opts.cleanupSessions && !session.closed) await removeFromSession(session);
      } catch {
        // best effort — renderer may already be gone
      }
      session.close();
    }
    this.sessions.clear();
    this.rejected.clear();
  }

  /** Push cleanup into every live session without stopping (used by restore). */
  async cleanupAllSessions(): Promise<number> {
    let cleaned = 0;
    for (const session of this.sessions.values()) {
      if (session.closed) continue;
      try {
        if (await removeFromSession(session)) cleaned += 1;
      } catch {
        // ignore
      }
    }
    return cleaned;
  }

  private emitLog(level: "info" | "warn" | "error", message: string) {
    this.emit("log", level, message);
  }

  private async adoptTarget(target: CdpTarget): Promise<void> {
    let session: CdpSession | undefined;
    try {
      session = await connectTarget(target, this.port);
      const probe = await probeSession(session);
      if (!probe?.codex) {
        session.close();
        if (!this.rejected.has(target.id)) {
          this.emitLog("warn", `rejected non-Codex app target ${target.id}`);
          this.rejected.add(target.id);
        }
        return;
      }
      this.rejected.delete(target.id);
      const live = session;
      live.on("Page.loadEventFired", () => {
        setTimeout(() => {
          applyToSession(live, this.payload).catch((error: Error) => {
            this.emitLog("error", `reinject failed: ${error.message}`);
          });
        }, 250);
      });
      await applyToSession(session, this.payload);
      this.sessions.set(target.id, session);
      this.emit("injected", target.id);
      this.emitLog("info", `injected verified Codex target ${target.id} (${target.title || target.url})`);
    } catch (error) {
      session?.close();
      this.emitLog("error", `inject failed for ${target.id}: ${(error as Error).message}`);
    }
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      let targets: CdpTarget[] = [];
      try {
        targets = await listAppTargets(this.port);
      } catch (error) {
        this.emitLog("error", (error as Error).message);
        await sleep(1000);
        continue;
      }

      const activeIds = new Set(targets.map((target) => target.id));
      for (const [id, session] of this.sessions) {
        if (!activeIds.has(id) || session.closed) {
          session.close();
          this.sessions.delete(id);
        }
      }

      for (const target of targets) {
        if (this.sessions.has(target.id) || this.stopping) continue;
        await this.adoptTarget(target);
      }
      await sleep(900);
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
