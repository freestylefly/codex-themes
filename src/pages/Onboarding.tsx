import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mouse,
  Palette,
  Pause,
  Play,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ThemeSummary } from "../../electron/shared/types";
import { useApp } from "../store";

const ONBOARDING_THEME_IDS = [
  "neon-star-hunter",
  "blue-window-messenger",
  "focus-capybara",
] as const;

const CAROUSEL_DELAY_MS = 5_000;

function onboardingThemes(themes: ThemeSummary[]): ThemeSummary[] {
  const preferred = ONBOARDING_THEME_IDS
    .map((id) => themes.find((theme) => theme.id === id && theme.valid && Boolean(theme.previewUrl)))
    .filter((theme): theme is ThemeSummary => Boolean(theme));
  if (preferred.length === ONBOARDING_THEME_IDS.length) return preferred;

  const fallback = themes.filter((theme) => theme.valid && Boolean(theme.previewUrl));
  return [...preferred, ...fallback.filter((theme) => !preferred.some((item) => item.id === theme.id))].slice(0, 3);
}

/** First-run flow: preview a real theme, consent, then enter through the selected look. */
export function Onboarding() {
  const state = useApp((s) => s.state);
  const themes = useApp((s) => s.themes);
  const finish = useApp((s) => s.finishOnboarding);
  const apply = useApp((s) => s.apply);
  const installed = state?.codexDesktop.installed ?? false;

  const featuredThemes = useMemo(() => onboardingThemes(themes), [themes]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [entering, setEntering] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const dragStartRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const lastWheelRef = useRef(0);

  const selectedTheme = featuredThemes[selectedIndex] ?? featuredThemes[0];
  const orderedThemes = featuredThemes.map((_, offset) =>
    featuredThemes[(selectedIndex + offset) % featuredThemes.length],
  );
  const carouselPaused = !autoPlayEnabled || pointerPaused || focusPaused || entering;

  const selectRelative = (direction: -1 | 1) => {
    if (featuredThemes.length < 2) return;
    setSelectedIndex((current) => (current + direction + featuredThemes.length) % featuredThemes.length);
  };

  useEffect(() => {
    if (
      carouselPaused
      || featuredThemes.length < 2
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;

    const timeout = window.setTimeout(() => {
      setSelectedIndex((current) => (current + 1) % featuredThemes.length);
    }, CAROUSEL_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [carouselPaused, featuredThemes.length, selectedIndex]);

  const enterWithTheme = async () => {
    if (!installed || !selectedTheme || entering) return;
    setEntering(true);
    try {
      await finish();
      await apply(selectedTheme.id);
    } finally {
      setEntering(false);
    }
  };

  const completeDrag = () => {
    if (dragOffsetRef.current > 70) selectRelative(-1);
    if (dragOffsetRef.current < -70) selectRelative(1);
    dragStartRef.current = null;
    dragOffsetRef.current = 0;
    setDragOffset(0);
  };

  return (
    <div className="onboarding">
      <header className="ob-deck-brand">
        <span className="brand-mark"><Palette size={15} /></span>
        <strong>Codex Themes</strong>
      </header>

      <main className="ob-deck-main">
        <section className="ob-deck-copy" aria-label="选择首次使用的主题">
          <div>
            <p className="ob-deck-eyebrow">YOUR CODEX · YOUR STYLE</p>
            <h1>先挑一个喜欢的样子，<br /><span>再开始工作</span></h1>
            <p className="ob-deck-subtitle">每一种主题，都是不同的 Codex 氛围。</p>
          </div>

          <div className="ob-theme-list" role="radiogroup" aria-label="开屏主题">
            {featuredThemes.map((theme, index) => (
              <button
                type="button"
                role="radio"
                aria-checked={selectedIndex === index}
                className={selectedIndex === index ? "is-selected" : ""}
                key={theme.id}
                onClick={() => setSelectedIndex(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{theme.name.replace(/\s+[A-Z][\s\S]*$/, "")}</strong>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary ob-enter-button"
            disabled={!installed || !selectedTheme || entering}
            onClick={() => void enterWithTheme()}
          >
            {entering ? <Loader2 size={17} className="spin" /> : null}
            {installed ? "用这款主题进入" : "请先安装 Codex"}
            {!entering && <ArrowRight size={17} />}
          </button>
        </section>

        <section className="ob-theme-showcase" aria-label="主题卡组">
          <div
            className="ob-theme-stage"
            tabIndex={0}
            onPointerEnter={() => setPointerPaused(true)}
            onPointerLeave={() => setPointerPaused(false)}
            onFocusCapture={() => setFocusPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setFocusPaused(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") selectRelative(-1);
              if (event.key === "ArrowRight") selectRelative(1);
            }}
            onWheel={(event) => {
              const now = Date.now();
              if (Math.abs(event.deltaY) < 18 || now - lastWheelRef.current < 420) return;
              lastWheelRef.current = now;
              selectRelative(event.deltaY > 0 ? 1 : -1);
            }}
            onPointerDown={(event) => {
              dragStartRef.current = event.clientX;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (dragStartRef.current === null) return;
              const nextOffset = Math.max(-120, Math.min(120, event.clientX - dragStartRef.current));
              dragOffsetRef.current = nextOffset;
              setDragOffset(nextOffset);
            }}
            onPointerUp={completeDrag}
            onPointerCancel={completeDrag}
          >
            {orderedThemes.map((theme, depth) => {
              const originalIndex = featuredThemes.findIndex((item) => item.id === theme.id);
              return (
                <button
                  type="button"
                  className={`ob-theme-sheet ob-theme-sheet--${depth}`}
                  key={theme.id}
                  style={depth === 0 ? { "--ob-drag-x": `${dragOffset}px` } as React.CSSProperties : undefined}
                  onClick={() => {
                    if (depth > 0) setSelectedIndex(originalIndex);
                  }}
                  aria-label={`${theme.name}${depth === 0 ? "，当前选择" : "，点击切换"}`}
                  tabIndex={depth === 0 ? -1 : 0}
                >
                  <img src={theme.previewUrl} alt={`${theme.name}主题预览`} draggable={false} />
                </button>
              );
            })}
          </div>

          <div className="ob-deck-controls">
            <button type="button" onClick={() => selectRelative(-1)} aria-label="上一个主题"><ArrowLeft size={18} /></button>
            <span><Mouse size={16} />滚动或拖动切换</span>
            <button type="button" onClick={() => selectRelative(1)} aria-label="下一个主题"><ArrowRight size={18} /></button>
            <button
              type="button"
              className="ob-carousel-toggle"
              aria-label={autoPlayEnabled ? "暂停自动轮播" : "继续自动轮播"}
              aria-pressed={!autoPlayEnabled}
              onClick={() => setAutoPlayEnabled((current) => !current)}
            >
              {autoPlayEnabled ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <div className="ob-deck-progress">
              <small aria-live="polite">{String(selectedIndex + 1).padStart(2, "0")} / {String(featuredThemes.length).padStart(2, "0")}</small>
              <span aria-hidden="true">
                <i key={`${selectedIndex}-${autoPlayEnabled}-${carouselPaused}`} className={carouselPaused ? "is-paused" : ""} />
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="ob-deck-footer">
        <span className={installed ? "is-ready" : "is-blocked"}>
          {installed ? <CheckCircle2 size={14} /> : <Loader2 size={14} />}
          {installed ? "已检测到 Codex · 本地运行" : "未检测到 Codex 桌面端"}
        </span>
        <span><ShieldCheck size={14} />本地运行，主题资源只保存在你的设备上</span>
      </footer>
    </div>
  );
}
