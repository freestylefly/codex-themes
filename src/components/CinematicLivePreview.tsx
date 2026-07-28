import { ArrowUp, Paperclip, Play, RotateCcw } from "lucide-react";
import type { NormalizedTheme } from "../../electron/shared/types";
import { CodexPreviewSidebar } from "./CodexPreviewChrome";

interface CinematicLivePreviewProps {
  theme: NormalizedTheme;
  heroUrl?: string | null;
  page: "home" | "task";
}

export function CinematicLivePreview({
  theme,
  heroUrl,
  page,
}: CinematicLivePreviewProps) {
  const colors = theme.dark;
  const isTask = page === "task";

  return (
    <div className="preview-frame preview-frame--compact">
      <div className="preview-frame-bar">
        <span className="tl-dot" style={{ background: "#ff5f57" }} />
        <span className="tl-dot" style={{ background: "#febc2e" }} />
        <span className="tl-dot" style={{ background: "#28c840" }} />
        <span className="preview-caption">
          Codex {isTask ? "对话页" : "首页"} · 动态主题预览 · cinematic-live
        </span>
        <span className="cinematic-live-preview__playing">
          <Play size={10} fill="currentColor" />
          动态背景
        </span>
      </div>

      <div className="cinematic-live-preview">
        <div
          className="cinematic-live-preview__art"
          style={{ backgroundImage: heroUrl ? `url("${heroUrl}")` : undefined }}
        />
        <div className="cinematic-live-preview__shade" />
        <div className="cinematic-live-preview__shell">
          <CodexPreviewSidebar colors={colors} page={page} />

          <main className="cinematic-live-preview__main">
            <header className="cinematic-live-preview__topline">
              <span><i /> OBJECT LIVE</span>
              <nav>
                <b>沉浸</b>
                <span>对话</span>
                <span>专注</span>
              </nav>
              <small>NIGHTBOUND COMPANION</small>
            </header>

            {isTask ? (
              <CinematicTaskContent />
            ) : (
              <CinematicHomeContent />
            )}

            <div className="cinematic-live-preview__composer">
              <Paperclip size={13} />
              <span>向 Codex 描述你想完成的任务…</span>
              <button type="button" aria-label="发送">
                <ArrowUp size={13} />
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function CinematicHomeContent() {
  return (
    <>
      <section className="cinematic-live-preview__transcript">
        <small>LIVE TRANSCRIPT</small>
        <p>夜语伴生已就绪。告诉我你想完成的任务。</p>
      </section>
      <div className="cinematic-live-preview__actions">
        <button type="button" className="cinematic-live-preview__start">
          <span>开始对话</span>
          <i>ENTER</i>
        </button>
        <button type="button" className="cinematic-live-preview__replay">
          <RotateCcw size={10} />
          重播氛围
        </button>
      </div>
    </>
  );
}

function CinematicTaskContent() {
  return (
    <section className="cinematic-live-preview__thread">
      <small>LIVE TRANSCRIPT · 00:18</small>
      <article>
        <b>你</b>
        <p>帮我把这个动态主题接入当前项目，并保留原生交互。</p>
      </article>
      <article>
        <b>Codex</b>
        <p>主题布局和视频回退已经接入。我正在验证消息区、输入框与窗口切换。</p>
      </article>
      <article className="is-status">
        <span />
        正在检查动态资源与响应式布局
      </article>
    </section>
  );
}
