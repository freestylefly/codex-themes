import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Loader2,
  Save,
  SlidersHorizontal,
  Stamp,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  DensityPreset,
  ExtractedPalette,
  FontPreset,
  ImageFit,
  NormalizedCopy,
  NormalizedEffects,
  NormalizedTheme,
  RadiusPreset,
  ShadowPreset,
  TextAlign,
  ThemeDraftInput,
  ThemePalette,
} from "../../electron/shared/types";
import { defaultNormalizedTheme } from "../../electron/engine/normalize";
import { PaletteEditor } from "../components/PaletteEditor";
import { FullPaletteEditor } from "../components/FullPaletteEditor";
import { PreviewCanvas } from "../components/PreviewCanvas";
import { TaskPreviewCanvas } from "../components/TaskPreviewCanvas";
import { LayoutCardSelector } from "../components/LayoutCardSelector";
import { getLayoutCatalogItem } from "../layoutCatalog";
import { api } from "../api";
import { useApp } from "../store";

type BuilderStep = 1 | 2 | 3 | 4;

const BUILDER_STEPS: ReadonlyArray<{ id: BuilderStep; label: string }> = [
  { id: 1, label: "主图" },
  { id: 2, label: "布局" },
  { id: 3, label: "风格" },
  { id: 4, label: "完成" },
];

const NEXT_STEP_LABELS: Record<Exclude<BuilderStep, 4>, string> = {
  1: "选择布局",
  2: "调整风格",
  3: "确认主题",
};

function defaultDraftInput(): ThemeDraftInput {
  const theme = defaultNormalizedTheme();
  return {
    name: theme.name,
    description: theme.description,
    tagline: theme.tagline,
    tags: [],
    layout: theme.layout,
    colors: {
      accent: theme.light.accent,
      accentAlt: theme.light.accentAlt,
      secondary: theme.light.secondary,
      highlight: theme.light.highlight,
    },
    heroFit: theme.hero.fit,
    heroFocusX: theme.hero.focusX,
    heroFocusY: theme.hero.focusY,
    heroZoom: theme.hero.zoom,
    heroHeight: theme.hero.height,
    heroTextAlign: theme.hero.textAlign,
    heroScrim: theme.hero.scrim,
    wallpaperEnabled: theme.wallpaper.enabled,
    wallpaperFocusX: theme.wallpaper.focusX,
    wallpaperFocusY: theme.wallpaper.focusY,
    wallpaperOpacity: theme.wallpaper.opacity,
    wallpaperBlur: theme.wallpaper.blur,
    radius: theme.appearance.radius,
    density: theme.appearance.density,
    fontPreset: theme.appearance.fontPreset,
    glass: theme.appearance.glass,
    shadow: theme.appearance.shadow,
    decoration: theme.appearance.decoration,
    effects: theme.effects,
    copy: theme.copy,
    heroImagePath: "",
    stampImagePath: undefined,
  };
}

export function Editor() {
  const toast = useApp((s) => s.toast);
  const refreshThemes = useApp((s) => s.refreshThemes);
  const setPage = useApp((s) => s.setPage);
  const apply = useApp((s) => s.apply);
  const editingDraft = useApp((s) => s.editingDraft);
  const themes = useApp((s) => s.themes);

  // editingDraft is fixed for the lifetime of this mount: edit flows set it
  // before the page switches, and plain navigation clears it.
  const [editingId] = useState<string | null>(editingDraft?.editingId ?? null);
  const [input, setInput] = useState<ThemeDraftInput>(() => editingDraft?.draft ?? defaultDraftInput());
  const [imagePath, setImagePath] = useState<string | null>(editingDraft?.draft.heroImagePath ?? null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(editingDraft?.heroPreviewUrl ?? null);
  const [wallpaperPreviewUrl, setWallpaperPreviewUrl] = useState<string | null>(editingDraft?.wallpaperPreviewUrl ?? null);
  const [stampPreviewUrl, setStampPreviewUrl] = useState<string | null>(editingDraft?.stampPreviewUrl ?? null);
  const [step, setStep] = useState<BuilderStep>(editingDraft ? 3 : 1);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<"save" | "apply" | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [previewTab, setPreviewTab] = useState<"home" | "task">("home");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    hero: true,
    appearance: true,
    effects: true,
    copy: true,
    wallpaper: true,
    stamp: true,
    palette: true,
  });
  const [manualPalette, setManualPalette] = useState(Boolean(editingDraft?.draft.palettes));

  const selectedLayout = getLayoutCatalogItem(input.layout);

  const previewTheme: NormalizedTheme = useMemo(() => {
    const base = defaultNormalizedTheme();
    return {
      ...base,
      name: input.name || "我的 Codex 主题",
      description: input.description,
      tagline: input.tagline || "把喜欢的画面变成可交互的 Codex 工作台。",
      layout: input.layout,
      light: input.palettes?.light ?? base.light,
      dark: input.palettes?.dark ?? base.dark,
      hero: {
        fit: input.heroFit,
        focusX: input.heroFocusX,
        focusY: input.heroFocusY,
        zoom: input.heroZoom,
        height: input.heroHeight,
        textAlign: input.heroTextAlign,
        scrim: input.heroScrim,
      },
      wallpaper: {
        enabled: input.wallpaperEnabled,
        focusX: input.wallpaperFocusX,
        focusY: input.wallpaperFocusY,
        opacity: input.wallpaperOpacity,
        blur: input.wallpaperBlur,
      },
      appearance: {
        radius: input.radius,
        density: input.density,
        fontPreset: input.fontPreset,
        glass: input.glass,
        shadow: input.shadow,
        decoration: input.decoration,
      },
      effects: input.effects,
      copy: input.copy,
    };
  }, [input]);

  const adoptImage = (path: string, previewUrl: string, next: ExtractedPalette) => {
    setImagePath(path);
    setImagePreviewUrl(previewUrl);
    setInput((prev) => ({
      ...prev,
      colors: { ...prev.colors, ...next },
      heroImagePath: path,
    }));
  };

  const onPick = async () => {
    try {
      const picked = await api.pickImage();
      if (picked) adoptImage(picked.path, picked.previewUrl, picked.palette);
    } catch (error) {
      toast("err", `读取图片失败:${(error as Error).message}`);
    }
  };

  const onPickWallpaper = async () => {
    try {
      const picked = await api.pickImage();
      if (picked) {
        setWallpaperPreviewUrl(picked.previewUrl);
        setInput((prev) => ({ ...prev, wallpaperImagePath: picked.path, wallpaperEnabled: true }));
      }
    } catch (error) {
      toast("err", `读取壁纸失败:${(error as Error).message}`);
    }
  };

  const onPickStamp = async () => {
    try {
      const picked = await api.pickImage();
      if (picked) {
        setStampPreviewUrl(picked.previewUrl);
        setInput((prev) => ({ ...prev, stampImagePath: picked.path }));
      }
    } catch (error) {
      toast("err", `读取 Stamp 失败:${(error as Error).message}`);
    }
  };

  const onAutoCropStamp = async () => {
    if (!imagePath) {
      toast("info", "请先选择主图再自动生成 Stamp。");
      return;
    }
    try {
      const picked = await api.autoCropStamp(imagePath);
      setStampPreviewUrl(picked.previewUrl);
      setInput((prev) => ({ ...prev, stampImagePath: picked.path }));
    } catch (error) {
      toast("err", `自动生成 Stamp 失败:${(error as Error).message}`);
    }
  };

  const clearStamp = () => {
    setStampPreviewUrl(null);
    setInput((prev) => ({ ...prev, stampImagePath: undefined }));
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      const filePath = api.getPathForFile(file);
      const inspected = await api.inspectImage(filePath);
      adoptImage(inspected.path, inspected.previewUrl, inspected.palette);
    } catch (error) {
      toast("err", `读取图片失败:${(error as Error).message}`);
    }
  };

  const update = <K extends keyof ThemeDraftInput>(key: K, value: ThemeDraftInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  const updateCopy = (key: keyof NormalizedCopy, value: string) => {
    setInput((prev) => ({ ...prev, copy: { ...prev.copy, [key]: value } }));
  };

  const updateEffect = (key: keyof NormalizedEffects, value: number) => {
    setInput((prev) => ({ ...prev, effects: { ...prev.effects, [key]: value } }));
  };

  const toggleSection = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setPalette = (light: ThemePalette, dark: ThemePalette) => {
    setInput((prev) => ({ ...prev, palettes: { light, dark } }));
  };

  const toggleManualPalette = () => {
    setManualPalette((prev) => {
      const next = !prev;
      if (!next) {
        // Switch back to derived palettes: clear explicit palettes.
        setInput((s) => ({ ...s, palettes: undefined }));
      } else {
        // Seed explicit palettes from the current preview theme.
        setInput((s) => ({
          ...s,
          palettes: { light: previewTheme.light, dark: previewTheme.dark },
        }));
      }
      return next;
    });
  };

  const save = async (andApply: boolean) => {
    if (!imagePath || busy) return;
    setBusy(andApply ? "apply" : "save");
    try {
      const saved = editingId
        ? await api.updateTheme(editingId, input)
        : await api.saveThemeDraft(input);
      await refreshThemes();
      toast("ok", editingId ? `主题「${saved.name}」已更新。` : `主题「${saved.name}」已保存。`);
      if (andApply) {
        setPage("gallery");
        void apply(saved.id);
      }
    } catch (error) {
      toast("err", `保存失败:${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const goNext = () => {
    if (step === 1 && !imagePath) {
      toast("info", "请先选择一张主题主图。");
      return;
    }
    setStep((current) => Math.min(4, current + 1) as BuilderStep);
  };

  const goBack = () => {
    setStep((current) => Math.max(1, current - 1) as BuilderStep);
  };

  const previewPanel = (
    <section className="theme-builder-preview" aria-label="主题实时预览">
      <div className="theme-builder-preview__toolbar">
        <div className="theme-builder-preview__tabs" role="tablist" aria-label="预览页面">
          <button
            className={previewTab === "home" ? "is-active" : ""}
            onClick={() => setPreviewTab("home")}
          >
            首页
          </button>
          <button
            className={previewTab === "task" ? "is-active" : ""}
            onClick={() => setPreviewTab("task")}
          >
            任务页
          </button>
        </div>
        <span>实时预览</span>
      </div>
      <div className="theme-builder-preview__canvas">
        {previewTab === "home" ? (
          <PreviewCanvas
            theme={previewTheme}
            heroUrl={imagePreviewUrl}
            wallpaperUrl={wallpaperPreviewUrl}
            stampUrl={stampPreviewUrl}
          />
        ) : (
          <TaskPreviewCanvas
            theme={previewTheme}
            heroUrl={imagePreviewUrl}
            wallpaperUrl={wallpaperPreviewUrl}
            stampUrl={stampPreviewUrl}
          />
        )}
      </div>
      {imagePreviewUrl && (
        <div className="theme-builder-current-art">
          <div>
            <span className="theme-builder-kicker">当前主图</span>
            <strong>{input.name || "未命名主题"}</strong>
          </div>
          <img src={imagePreviewUrl} alt="当前主题主图" />
          <button className="btn btn-sm" onClick={() => setStep(1)}>
            <ImagePlus size={13} />
            返回更换图片
          </button>
        </div>
      )}
    </section>
  );

  const uploadPanel = (
    <div
      className={`theme-builder-upload${dragging ? " dragging" : ""}${imagePreviewUrl ? " has-image" : ""}`}
      onClick={() => void onPick()}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => void onDrop(event)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") void onPick();
      }}
    >
      {imagePreviewUrl ? (
        <>
          <img src={imagePreviewUrl} alt="已选择的主题主图" draggable={false} />
          <div className="theme-builder-upload__overlay">
            <ImagePlus size={18} />
            <strong>更换主题主图</strong>
            <span>点击选择，或把另一张图片拖进来</span>
          </div>
        </>
      ) : (
        <>
          <span className="theme-builder-upload__icon"><ImagePlus size={26} /></span>
          <strong>拖入主题主图</strong>
          <span>PNG / JPEG / WebP，最大 16MB</span>
          <span className="btn btn-sm">浏览文件</span>
        </>
      )}
    </div>
  );

  const advancedSettings = advanced ? (
    <div className="theme-builder-advanced">
      <button className="section-toggle" onClick={() => toggleSection("palette")}>
        <span>完整调色板</span>
        {expanded.palette ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded.palette && (
        <>
          <label className="row-checkbox">
            <input type="checkbox" checked={manualPalette} onChange={() => void toggleManualPalette()} />
            手动编辑亮色与暗色调色板
          </label>
          {manualPalette && input.palettes ? (
            <FullPaletteEditor light={input.palettes.light} dark={input.palettes.dark} onChange={setPalette} />
          ) : (
            <PaletteEditor value={input.colors} onChange={(colors) => update("colors", colors)} />
          )}
        </>
      )}

      <button className="section-toggle" onClick={() => toggleSection("hero")}>
        <span>主图参数</span>
        {expanded.hero ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded.hero && (
        <div className="theme-builder-control-grid">
          <label className="field">
            <span className="field-label">填充模式</span>
            <select className="input" value={input.heroFit} onChange={(event) => update("heroFit", event.target.value as ImageFit)}>
              <option value="cover">覆盖 cover</option>
              <option value="contain">包含 contain</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">文字对齐</span>
            <select className="input" value={input.heroTextAlign} onChange={(event) => update("heroTextAlign", event.target.value as TextAlign)}>
              <option value="left">左对齐</option>
              <option value="center">居中</option>
              <option value="right">右对齐</option>
            </select>
          </label>
          {[
            { key: "heroHeight", label: `高度 ${input.heroHeight}px`, min: 200, max: 360, value: input.heroHeight, convert: (value: number) => value },
            { key: "heroZoom", label: `缩放 ${Math.round(input.heroZoom * 100)}%`, min: 50, max: 200, value: Math.round(input.heroZoom * 100), convert: (value: number) => value / 100 },
            { key: "heroScrim", label: `遮罩 ${Math.round(input.heroScrim * 100)}%`, min: 0, max: 85, value: Math.round(input.heroScrim * 100), convert: (value: number) => value / 100 },
            { key: "heroFocusX", label: `焦点 X ${Math.round(input.heroFocusX * 100)}%`, min: 0, max: 100, value: Math.round(input.heroFocusX * 100), convert: (value: number) => value / 100 },
            { key: "heroFocusY", label: `焦点 Y ${Math.round(input.heroFocusY * 100)}%`, min: 0, max: 100, value: Math.round(input.heroFocusY * 100), convert: (value: number) => value / 100 },
          ].map((control) => (
            <label className="field" key={control.key}>
              <span className="field-label">{control.label}</span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                value={control.value}
                onChange={(event) => update(control.key as keyof ThemeDraftInput, control.convert(Number(event.target.value)) as never)}
              />
            </label>
          ))}
        </div>
      )}

      <button className="section-toggle" onClick={() => toggleSection("appearance")}>
        <span>外观与密度</span>
        {expanded.appearance ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded.appearance && (
        <div className="theme-builder-control-grid">
          <label className="field">
            <span className="field-label">圆角</span>
            <select className="input" value={input.radius} onChange={(event) => update("radius", event.target.value as RadiusPreset)}>
              {(["none", "sm", "md", "lg", "xl"] as RadiusPreset[]).map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">紧凑度</span>
            <select className="input" value={input.density} onChange={(event) => update("density", event.target.value as DensityPreset)}>
              <option value="compact">紧凑</option><option value="normal">标准</option><option value="spacious">宽松</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">阴影</span>
            <select className="input" value={input.shadow} onChange={(event) => update("shadow", event.target.value as ShadowPreset)}>
              {(["none", "sm", "md", "lg"] as ShadowPreset[]).map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">字体</span>
            <select className="input" value={input.fontPreset} onChange={(event) => update("fontPreset", event.target.value as FontPreset)}>
              <option value="system">系统</option><option value="rounded">圆润</option><option value="mono">等宽</option>
            </select>
          </label>
          <label className="row-checkbox">
            <input type="checkbox" checked={input.glass} onChange={(event) => update("glass", event.target.checked)} />
            玻璃效果
          </label>
          <label className="field">
            <span className="field-label">装饰强度 {Math.round(input.decoration * 100)}%</span>
            <input type="range" min={0} max={100} value={Math.round(input.decoration * 100)} onChange={(event) => update("decoration", Number(event.target.value) / 100)} />
          </label>
        </div>
      )}

      <button className="section-toggle" onClick={() => toggleSection("effects")}>
        <span>动效强度</span>
        {expanded.effects ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded.effects && (
        <div className="theme-builder-control-grid">
          {[
            { key: "particles", label: "粒子" }, { key: "aurora", label: "极光" },
            { key: "glow", label: "光晕" }, { key: "noise", label: "噪点" },
            { key: "grid", label: "网格" }, { key: "float", label: "漂浮" },
          ].map(({ key, label }) => (
            <label className="field" key={key}>
              <span className="field-label">{label} {Math.round(input.effects[key as keyof NormalizedEffects] * 100)}%</span>
              <input type="range" min={0} max={100} value={Math.round(input.effects[key as keyof NormalizedEffects] * 100)} onChange={(event) => updateEffect(key as keyof NormalizedEffects, Number(event.target.value) / 100)} />
            </label>
          ))}
        </div>
      )}

      <button className="section-toggle" onClick={() => toggleSection("copy")}>
        <span>应用内文案</span>
        {expanded.copy ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded.copy && (
        <div className="theme-builder-control-grid">
          {[
            { key: "brandSubtitle", label: "副标题" }, { key: "projectPrefix", label: "项目前缀" },
            { key: "projectLabel", label: "项目标签" }, { key: "statusText", label: "状态文案" },
            { key: "quote", label: "引言" },
          ].map(({ key, label }) => (
            <label className="field" key={key}>
              <span className="field-label">{label}</span>
              <input className="input" value={input.copy[key as keyof NormalizedCopy]} maxLength={80} onChange={(event) => updateCopy(key as keyof NormalizedCopy, event.target.value)} />
            </label>
          ))}
        </div>
      )}

      <button className="section-toggle" onClick={() => toggleSection("wallpaper")}>
        <span>壁纸与 Stamp</span>
        {expanded.wallpaper ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded.wallpaper && (
        <div className="theme-builder-media-settings">
          <div>
            <span className="field-label">全局壁纸</span>
            <button className="btn btn-sm" onClick={() => void onPickWallpaper()}><ImagePlus size={13} />{wallpaperPreviewUrl ? "更换壁纸" : "添加壁纸"}</button>
            {wallpaperPreviewUrl && <img src={wallpaperPreviewUrl} alt="壁纸预览" />}
            <label className="row-checkbox"><input type="checkbox" checked={input.wallpaperEnabled} onChange={(event) => update("wallpaperEnabled", event.target.checked)} />启用壁纸</label>
            <label className="field">
              <span className="field-label">焦点 X {Math.round(input.wallpaperFocusX * 100)}%</span>
              <input type="range" min={0} max={100} value={Math.round(input.wallpaperFocusX * 100)} onChange={(event) => update("wallpaperFocusX", Number(event.target.value) / 100)} />
            </label>
            <label className="field">
              <span className="field-label">焦点 Y {Math.round(input.wallpaperFocusY * 100)}%</span>
              <input type="range" min={0} max={100} value={Math.round(input.wallpaperFocusY * 100)} onChange={(event) => update("wallpaperFocusY", Number(event.target.value) / 100)} />
            </label>
            <label className="field">
              <span className="field-label">透明度 {Math.round(input.wallpaperOpacity * 100)}%</span>
              <input type="range" min={0} max={100} value={Math.round(input.wallpaperOpacity * 100)} onChange={(event) => update("wallpaperOpacity", Number(event.target.value) / 100)} />
            </label>
            <label className="field">
              <span className="field-label">模糊 {input.wallpaperBlur}px</span>
              <input type="range" min={0} max={24} value={input.wallpaperBlur} onChange={(event) => update("wallpaperBlur", Number(event.target.value))} />
            </label>
          </div>
          <div>
            <span className="field-label">方形 Stamp</span>
            <div className="editor-actions">
              <button className="btn btn-sm" onClick={() => void onPickStamp()}><Stamp size={13} />{stampPreviewUrl ? "更换" : "上传"}</button>
              <button className="btn btn-sm" onClick={() => void onAutoCropStamp()}><ImagePlus size={13} />从主图裁切</button>
            </div>
            {stampPreviewUrl && <div className="theme-builder-stamp"><img src={stampPreviewUrl} alt="Stamp 预览" /><button className="btn btn-ghost btn-danger btn-sm" onClick={clearStamp}>清除</button></div>}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="page theme-builder-page">
      <header className="theme-builder-header">
        <div className="theme-builder-title-row">
          <h1 className="page-title">自定义主题</h1>
          {editingId && <span title={input.name || editingId}>正在编辑 · {input.name || editingId}</span>}
        </div>
        <ol className="theme-builder-steps" aria-label="主题创建进度">
          {BUILDER_STEPS.map((item, index) => (
            <li key={item.id} className={`${step === item.id ? "is-active" : ""}${step > item.id ? " is-complete" : ""}`}>
              <button onClick={() => (item.id < step || imagePath ? setStep(item.id) : undefined)}>
                <span>{step > item.id ? <Check size={13} strokeWidth={3} /> : item.id}</span>
                {item.label}
              </button>
              {index < BUILDER_STEPS.length - 1 && <i aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </header>

      <div className="editor-layout theme-builder-workspace" data-step={step}>
        <div className="editor-panel theme-builder-controls">
          <section className="theme-builder-step theme-builder-step--upload">
            <div className="theme-builder-section-heading">
              <div><span>第 1 步</span><h2>选择主题主图</h2></div>
              <p>主体清晰、留白充足的图片会得到更好的界面效果。</p>
            </div>
            {uploadPanel}
            <div className="theme-builder-upload-tips">
              <span>建议比例 16:10</span><span>图片不会上传到云端</span><span>支持自动取色</span>
            </div>
          </section>

          <section className="field theme-builder-step theme-builder-step--layout">
            <div className="theme-builder-section-heading">
              <div><span>第 2 步</span><h2>选择布局骨架</h2></div>
              <p>布局决定内容与主图的空间关系，配色和材质会在下一步调整。</p>
            </div>
            <LayoutCardSelector
              name="theme-layout"
              value={input.layout}
              onChange={(layout) => {
                if (layout) update("layout", layout);
              }}
              themes={themes}
            />
          </section>

          <section className="theme-builder-step theme-builder-step--style">
            <div className="theme-builder-section-heading theme-builder-section-heading--actions">
              <div><span>第 3 步</span><h2>调整主题风格</h2></div>
              <button className="btn btn-sm" onClick={() => setAdvanced(!advanced)}>
                <SlidersHorizontal size={13} />{advanced ? "收起高级设置" : "高级设置"}
              </button>
            </div>
            <div className="field">
            <span className="field-label">配色(从图片自动提取,可微调)</span>
            <PaletteEditor value={input.colors} onChange={(colors) => update("colors", colors)} />
            </div>

          <div className="field">
            <span className="field-label">主题名称</span>
            <input
              className="input"
              placeholder="我的 Codex 主题"
              value={input.name}
              maxLength={80}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>

          <div className="field">
            <span className="field-label">标语</span>
            <input
              className="input"
              placeholder="把喜欢的画面变成可交互的 Codex 工作台。"
              value={input.tagline}
              maxLength={160}
              onChange={(e) => update("tagline", e.target.value)}
            />
          </div>

          <div className="field">
            <span className="field-label">描述</span>
            <textarea
              className="input"
              rows={2}
              placeholder="简短描述这个主题适合什么场景或氛围。"
              value={input.description}
              maxLength={160}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>

          <div className="field">
            <span className="field-label">标签(逗号分隔)</span>
            <input
              className="input"
              placeholder="dark, neon, minimal"
              value={input.tags.join(", ")}
              onChange={(e) =>
                update(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 16),
                )
              }
            />
          </div>

          {advancedSettings}
          {false && advanced && (
            <>
              <button className="section-toggle" onClick={() => toggleSection("palette")}>
                <span>配色</span>
                {expanded.palette ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expanded.palette && (
                <>
                  <div className="field">
                    <label className="row-checkbox">
                      <input
                        type="checkbox"
                        checked={manualPalette}
                        onChange={() => void toggleManualPalette()}
                      />
                      手动编辑完整调色板
                    </label>
                  </div>
                  {manualPalette && input.palettes ? (
                    <FullPaletteEditor
                      light={input.palettes!.light}
                      dark={input.palettes!.dark}
                      onChange={setPalette}
                    />
                  ) : (
                    <div className="field">
                      <PaletteEditor value={input.colors} onChange={(colors) => update("colors", colors)} />
                    </div>
                  )}
                </>
              )}

              <button className="section-toggle" onClick={() => toggleSection("hero")}>
                <span>主图参数</span>
                {expanded.hero ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expanded.hero && (
                <>
                  <div className="field">
                    <span className="field-label">填充模式</span>
                    <select
                      className="input"
                      value={input.heroFit}
                      onChange={(e) => update("heroFit", e.target.value as ImageFit)}
                    >
                      <option value="cover">覆盖(cover)</option>
                      <option value="contain">包含(contain)</option>
                    </select>
                  </div>
                  <div className="field">
                    <span className="field-label">高度 {input.heroHeight}px</span>
                    <input
                      type="range"
                      min={200}
                      max={360}
                      value={input.heroHeight}
                      onChange={(e) => update("heroHeight", Number(e.target.value))}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">缩放 {Math.round(input.heroZoom * 100)}%</span>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      value={Math.round(input.heroZoom * 100)}
                      onChange={(e) => update("heroZoom", Number(e.target.value) / 100)}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">遮罩 {Math.round(input.heroScrim * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={85}
                      value={Math.round(input.heroScrim * 100)}
                      onChange={(e) => update("heroScrim", Number(e.target.value) / 100)}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">文字对齐</span>
                    <select
                      className="input"
                      value={input.heroTextAlign}
                      onChange={(e) => update("heroTextAlign", e.target.value as TextAlign)}
                    >
                      <option value="left">左对齐</option>
                      <option value="center">居中</option>
                      <option value="right">右对齐</option>
                    </select>
                  </div>
                  <div className="field">
                    <span className="field-label">焦点 X {Math.round(input.heroFocusX * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(input.heroFocusX * 100)}
                      onChange={(e) => update("heroFocusX", Number(e.target.value) / 100)}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">焦点 Y {Math.round(input.heroFocusY * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(input.heroFocusY * 100)}
                      onChange={(e) => update("heroFocusY", Number(e.target.value) / 100)}
                    />
                  </div>
                </>
              )}

              <button className="section-toggle" onClick={() => toggleSection("appearance")}>
                <span>外观</span>
                {expanded.appearance ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expanded.appearance && (
                <>
                  <div className="field">
                    <span className="field-label">圆角</span>
                    <select
                      className="input"
                      value={input.radius}
                      onChange={(e) => update("radius", e.target.value as RadiusPreset)}
                    >
                      {(["none", "sm", "md", "lg", "xl"] as RadiusPreset[]).map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <span className="field-label">紧凑度</span>
                    <select
                      className="input"
                      value={input.density}
                      onChange={(e) => update("density", e.target.value as DensityPreset)}
                    >
                      <option value="compact">紧凑</option>
                      <option value="normal">标准</option>
                      <option value="spacious">宽松</option>
                    </select>
                  </div>
                  <div className="field">
                    <span className="field-label">阴影</span>
                    <select
                      className="input"
                      value={input.shadow}
                      onChange={(e) => update("shadow", e.target.value as ShadowPreset)}
                    >
                      {(["none", "sm", "md", "lg"] as ShadowPreset[]).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <span className="field-label">字体</span>
                    <select
                      className="input"
                      value={input.fontPreset}
                      onChange={(e) => update("fontPreset", e.target.value as FontPreset)}
                    >
                      <option value="system">系统</option>
                      <option value="rounded">圆润</option>
                      <option value="mono">等宽</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="row-checkbox">
                      <input
                        type="checkbox"
                        checked={input.glass}
                        onChange={(e) => update("glass", e.target.checked)}
                      />
                      玻璃效果
                    </label>
                  </div>
                  <div className="field">
                    <span className="field-label">装饰强度 {Math.round(input.decoration * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(input.decoration * 100)}
                      onChange={(e) => update("decoration", Number(e.target.value) / 100)}
                    />
                  </div>
                </>
              )}

              <button className="section-toggle" onClick={() => toggleSection("effects")}>
                <span>动效强度</span>
                {expanded.effects ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expanded.effects && [
                { key: "particles", label: "粒子" },
                { key: "aurora", label: "极光" },
                { key: "glow", label: "光晕" },
                { key: "noise", label: "噪点" },
                { key: "grid", label: "网格" },
                { key: "float", label: "漂浮" },
              ].map(({ key, label }) => (
                <div className="field" key={key}>
                  <span className="field-label">{label} {Math.round(input.effects[key as keyof NormalizedEffects] * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(input.effects[key as keyof NormalizedEffects] * 100)}
                    onChange={(e) => updateEffect(key as keyof NormalizedEffects, Number(e.target.value) / 100)}
                  />
                </div>
              ))}

              <button className="section-toggle" onClick={() => toggleSection("copy")}>
                <span>文案</span>
                {expanded.copy ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expanded.copy && (
                <>
                  <div className="field">
                    <span className="field-label">副标题</span>
                    <input
                      className="input"
                      value={input.copy.brandSubtitle}
                      maxLength={80}
                      onChange={(e) => updateCopy("brandSubtitle", e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">项目前缀</span>
                    <input
                      className="input"
                      value={input.copy.projectPrefix}
                      maxLength={80}
                      onChange={(e) => updateCopy("projectPrefix", e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">项目标签</span>
                    <input
                      className="input"
                      value={input.copy.projectLabel}
                      maxLength={80}
                      onChange={(e) => updateCopy("projectLabel", e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">状态文案</span>
                    <input
                      className="input"
                      value={input.copy.statusText}
                      maxLength={80}
                      onChange={(e) => updateCopy("statusText", e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">引言</span>
                    <input
                      className="input"
                      value={input.copy.quote}
                      maxLength={80}
                      onChange={(e) => updateCopy("quote", e.target.value)}
                    />
                  </div>
                </>
              )}

              <button className="section-toggle" onClick={() => toggleSection("wallpaper")}>
                <span>壁纸(可选)</span>
                {expanded.wallpaper ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expanded.wallpaper && (
                <div className="field">
                  <button className="btn" onClick={() => void onPickWallpaper()}>
                    <ImagePlus size={14} />
                    {wallpaperPreviewUrl ? "更换壁纸" : "添加壁纸"}
                  </button>
                  {wallpaperPreviewUrl && (
                    <img
                      src={wallpaperPreviewUrl!}
                      alt=""
                      style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8, marginTop: 8 }}
                    />
                  )}
                  <label className="row-checkbox">
                    <input
                      type="checkbox"
                      checked={input.wallpaperEnabled}
                      onChange={(e) => update("wallpaperEnabled", e.target.checked)}
                    />
                    启用壁纸
                  </label>
                  <div className="field" style={{ marginTop: 8, padding: 0 }}>
                    <span className="field-label">壁纸焦点 X {Math.round(input.wallpaperFocusX * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(input.wallpaperFocusX * 100)}
                      onChange={(e) => update("wallpaperFocusX", Number(e.target.value) / 100)}
                    />
                  </div>
                  <div className="field" style={{ padding: 0 }}>
                    <span className="field-label">壁纸焦点 Y {Math.round(input.wallpaperFocusY * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(input.wallpaperFocusY * 100)}
                      onChange={(e) => update("wallpaperFocusY", Number(e.target.value) / 100)}
                    />
                  </div>
                </div>
              )}

              <button className="section-toggle" onClick={() => toggleSection("stamp")}>
                <span>Stamp(可选)</span>
                {expanded.stamp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expanded.stamp && (
                <div className="field">
                  <span className="field-label">方形 Stamp</span>
                  <div className="editor-actions" style={{ justifyContent: "flex-start" }}>
                    <button className="btn" onClick={() => void onPickStamp()}>
                      <Stamp size={14} />
                      {stampPreviewUrl ? "更换 Stamp" : "上传 Stamp"}
                    </button>
                    <button className="btn" onClick={() => void onAutoCropStamp()}>
                      <ImagePlus size={14} />
                      从主图裁切
                    </button>
                  </div>
                  {stampPreviewUrl && (
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
                      <img
                        src={stampPreviewUrl!}
                        alt=""
                        style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }}
                      />
                      <button className="btn btn-ghost btn-icon btn-danger" onClick={clearStamp}>
                        清除
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          </section>

          <section className="theme-builder-step theme-builder-step--complete">
            <div className="theme-builder-section-heading">
              <div><span>第 4 步</span><h2>确认主题</h2></div>
              <p>检查主题信息和预览效果，确认后即可保存并应用到 Codex。</p>
            </div>
            <div className="theme-builder-summary">
              {imagePreviewUrl && <img src={imagePreviewUrl} alt="主题主图缩略图" />}
              <div className="theme-builder-summary__copy">
                <span>主题名称</span><strong>{input.name || "未命名主题"}</strong>
                <p>{input.tagline || "还没有填写主题标语。"}</p>
              </div>
              <dl>
                <div><dt>布局</dt><dd>{selectedLayout.name}</dd></div>
                <div><dt>模式</dt><dd>{advanced ? "高级" : "简单"}</dd></div>
                <div><dt>标签</dt><dd>{input.tags.length ? input.tags.join(" · ") : "暂无"}</dd></div>
              </dl>
              <div className="theme-builder-summary__palette">
                {Object.entries(input.colors).map(([name, value]) => <span key={name} title={`${name} ${value}`} style={{ background: value }} />)}
              </div>
            </div>
          </section>
        </div>

        {previewPanel}
      </div>

      <footer className="theme-builder-actions">
        <button className="btn" disabled={step === 1 || busy !== null} onClick={goBack}>
          <ArrowLeft size={14} />上一步
        </button>
        <div className="theme-builder-actions__meta">
          <strong>{selectedLayout.name}</strong><span>{step} / 4</span>
        </div>
        <div className="theme-builder-actions__primary">
          {step < 4 ? (
            <button className="btn btn-primary" disabled={step === 1 && !imagePath} onClick={goNext}>
              下一步：{NEXT_STEP_LABELS[step as Exclude<BuilderStep, 4>]}<ArrowRight size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!imagePath || busy !== null} onClick={() => void save(true)}>
              {busy === "apply" ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />}保存并应用
            </button>
          )}
          <button className="btn" disabled={!imagePath || busy !== null} onClick={() => void save(false)}>
            {busy === "save" ? <Loader2 size={14} className="spin" /> : <Save size={14} />}保存草稿
          </button>
        </div>
      </footer>
    </div>
  );
}
