import type { LayoutKind } from "../electron/shared/types";
import dreamBannerPreview from "./assets/layout-previews/dream-banner-neon-star-hunter.webp";
import minimalFocusPreview from "./assets/layout-previews/minimal-focus-capybara.webp";
import paperBoardPreview from "./assets/layout-previews/paper-board-potion-workshop.webp";
import splitStudioPreview from "./assets/layout-previews/split-studio-mecha-cat.webp";
import terminalGridPreview from "./assets/layout-previews/terminal-grid-hacker-zero.webp";

export interface LayoutPreviewAsset {
  name: string;
  src: string;
}

const LAYOUT_PREVIEW_ASSETS: Partial<Record<LayoutKind, LayoutPreviewAsset>> = {
  "dream-banner": {
    name: "霓虹猎星者",
    src: dreamBannerPreview,
  },
  "split-studio": {
    name: "机甲猫工作室",
    src: splitStudioPreview,
  },
  "terminal-grid": {
    name: "零号骇客",
    src: terminalGridPreview,
  },
  "paper-board": {
    name: "魔法药水铺",
    src: paperBoardPreview,
  },
  "minimal-focus": {
    name: "打工水豚",
    src: minimalFocusPreview,
  },
};

export function getLayoutPreviewAsset(layout: LayoutKind): LayoutPreviewAsset | undefined {
  return LAYOUT_PREVIEW_ASSETS[layout];
}
