import {
  LAYOUT_KINDS,
  type LayoutKind,
  type ThemeSummary,
} from "../electron/shared/types";

export interface LayoutCatalogItem {
  id: LayoutKind;
  name: string;
  description: string;
  guidance: string;
  representativeThemeId: string;
}

const LAYOUT_CATALOG_BY_ID: Record<LayoutKind, LayoutCatalogItem> = {
  "dream-banner": {
    id: "dream-banner",
    name: "梦境横幅",
    description: "顶部横幅承载主视觉，任务内容排列在下方。",
    guidance: "主体建议放在右侧，左侧两段留出文字安全区。",
    representativeThemeId: "neon-star-hunter",
  },
  "split-studio": {
    id: "split-studio",
    name: "分栏工作室",
    description: "主图与工作区左右分栏，适合明确的单侧主体。",
    guidance: "主体放在左半区，右半区保持安静以承载内容。",
    representativeThemeId: "mecha-cat-studio",
  },
  "full-canvas": {
    id: "full-canvas",
    name: "全景沉浸",
    description: "主图铺满窗口，内容以透明层悬浮在画面上。",
    guidance: "使用大面积渐变或氛围背景，避免细节压住正文。",
    representativeThemeId: "moonlit-immortal",
  },
  "terminal-grid": {
    id: "terminal-grid",
    name: "终端网格",
    description: "紧凑网格与终端质感，突出代码和高对比信息。",
    guidance: "高对比、低圆角、低装饰；主图宜简洁且结构明确。",
    representativeThemeId: "hacker-zero",
  },
  "paper-board": {
    id: "paper-board",
    name: "纸感看板",
    description: "纸张与便签式卡片，适合温暖、轻盈的主题。",
    guidance: "暖色低对比图片最合适，避免强玻璃和复杂光效。",
    representativeThemeId: "potion-workshop",
  },
  "minimal-focus": {
    id: "minimal-focus",
    name: "极简聚焦",
    description: "减少装饰与界面密度，让标题和核心内容聚焦。",
    guidance: "选择低饱和、留白充足的图片，并减少粒子和光晕。",
    representativeThemeId: "focus-capybara",
  },
  "retro-messenger": {
    id: "retro-messenger",
    name: "复古信使",
    description: "复古桌面信使结构，包含工具栏和信息侧栏。",
    guidance: "使用居中吉祥物或透明角色，避免在图片里生成界面。",
    representativeThemeId: "blue-window-messenger",
  },
  "silk-scroll": {
    id: "silk-scroll",
    name: "丝绢卷轴",
    description: "东方横向卷轴工作区，内容按章节展开。",
    guidance: "主体避开中央卷轴阅读区，左右保留连续横向场景。",
    representativeThemeId: "mirror-lake-ribbon",
  },
};

export const LAYOUT_CATALOG: readonly LayoutCatalogItem[] = LAYOUT_KINDS.map(
  (layout) => LAYOUT_CATALOG_BY_ID[layout],
);

export function getLayoutCatalogItem(layout: LayoutKind): LayoutCatalogItem {
  return LAYOUT_CATALOG_BY_ID[layout];
}

export function findLayoutPreviewTheme(
  item: LayoutCatalogItem,
  themes: ThemeSummary[],
): ThemeSummary | undefined {
  return (
    themes.find(
      (theme) =>
        theme.valid && theme.id === item.representativeThemeId && Boolean(theme.previewUrl),
    ) ?? themes.find((theme) => theme.valid && theme.layout === item.id && Boolean(theme.previewUrl))
  );
}
