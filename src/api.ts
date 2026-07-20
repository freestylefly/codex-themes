/**
 * Typed access to the preload bridge. Centralizes the window declaration so
 * components never touch `window` directly.
 */

import type { CodexThemesApi } from "../electron/shared/types";

export interface CodexThemesWindowApi extends CodexThemesApi {
  getPathForFile(file: File): string;
}

declare global {
  interface Window {
    codexThemes: CodexThemesWindowApi;
  }
}

export const api: CodexThemesWindowApi = window.codexThemes;
