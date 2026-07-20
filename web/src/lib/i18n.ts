import type { WebTheme } from "./themes";

export type Locale = "zh" | "en";

const englishThemes: Record<string, { description: string; tagline: string }> = {
  "blue-window-messenger": {
    description:
      "A high-density retro workspace with a three-column messenger layout, XP-blue window chrome, and compact task panels.",
    tagline: "A familiar blue window for focused conversations.",
  },
  "cherry-frost": {
    description: "A crisp red-and-white sci-fi theme with a cool, candied edge.",
    tagline: "Cold light, bright signal.",
  },
  "clear-cyan": {
    description: "A translucent cyan workspace inspired by mist on an early window.",
    tagline: "A calm layer of morning light.",
  },
  "cream-sage": {
    description: "Warm cream surfaces balanced by a small, grounded note of sage.",
    tagline: "Quiet, natural, and easy on the eyes.",
  },
  "honey-milk": {
    description: "Soft milk-white panels with a restrained amber glow.",
    tagline: "Warm clarity for long working sessions.",
  },
  "ink-gold": {
    description: "A dramatic black-and-gold workspace designed like a lit stage.",
    tagline: "Make the important work feel cinematic.",
  },
  "linen-rose": {
    description: "Paper texture, muted rose accents, and the softness of an old book.",
    tagline: "A thoughtful workspace with editorial warmth.",
  },
  "peach-blush": {
    description: "A light peach theme inspired by the pink reflection at early evening.",
    tagline: "Soft color without losing focus.",
  },
  "soft-moss": {
    description: "A grounded green palette inspired by moss after rain.",
    tagline: "A small patch of calm for your desktop.",
  },
  "vanilla-sky": {
    description: "Warm sunlight, pale blue air, and generous breathing room.",
    tagline: "A bright workspace that stays gentle.",
  },
  "velvet-plum": {
    description: "A deep plum night theme softened by the glow of a desk lamp.",
    tagline: "A rich, quiet palette for late work.",
  },
};

export function href(locale: Locale, path: string): string {
  if (locale === "zh") return path;
  return path === "/" ? "/en/" : `/en${path}`;
}

export function alternateHref(locale: Locale, pathname: string): string {
  if (locale === "zh") return pathname === "/" ? "/en/" : `/en${pathname}`;
  const next = pathname.replace(/^\/en(?=\/|$)/, "");
  return next || "/";
}

export function localizeTheme(theme: WebTheme, locale: Locale): WebTheme {
  if (locale === "zh") return theme;
  const translation = englishThemes[theme.id];
  return translation ? { ...theme, ...translation } : theme;
}

export const copy = {
  zh: {
    navThemes: "主题",
    navHow: "使用方法",
    navFaq: "常见问题",
    download: "下载 Mac 版",
    useTheme: "使用该主题",
    viewTheme: "查看主题",
    allThemes: "查看全部主题",
    builtIn: "官方内置主题",
    version: "版本",
    backToThemes: "返回主题画廊",
  },
  en: {
    navThemes: "Themes",
    navHow: "How it works",
    navFaq: "FAQ",
    download: "Download for Mac",
    useTheme: "Use this theme",
    viewTheme: "View theme",
    allThemes: "View all themes",
    builtIn: "Official built-in theme",
    version: "Version",
    backToThemes: "Back to themes",
  },
} as const;
