/**
 * Persisted user settings (userData/settings.json). Small surface, atomic
 * writes, tolerant of a missing/corrupt file.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface AppSettings {
  onboardingDone: boolean;
  launchAtLogin: boolean;
  /** Auto re-apply the active theme when Codex starts without CDP (M4). */
  autoApply: boolean;
  /** Absolute path to a user-selected Codex CLI executable, if any. */
  codexCliPath: string | null;
}

export function defaultSettings(): AppSettings {
  return {
    onboardingDone: false,
    launchAtLogin: false,
    autoApply: false,
    codexCliPath: null,
  };
}

export class SettingsStore {
  private settings: AppSettings;

  constructor(private file: string) {
    this.settings = defaultSettings();
  }

  get current(): AppSettings {
    return { ...this.settings };
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, "utf8"));
      this.settings = {
        ...defaultSettings(),
        ...(typeof raw?.onboardingDone === "boolean" ? { onboardingDone: raw.onboardingDone } : {}),
        ...(typeof raw?.launchAtLogin === "boolean" ? { launchAtLogin: raw.launchAtLogin } : {}),
        ...(typeof raw?.autoApply === "boolean" ? { autoApply: raw.autoApply } : {}),
        ...(typeof raw?.codexCliPath === "string" ? { codexCliPath: raw.codexCliPath } : {}),
      };
    } catch {
      this.settings = defaultSettings();
    }
    return this.current;
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = { ...this.settings, ...patch };
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(temporary, `${JSON.stringify(this.settings, null, 2)}\n`, "utf8");
    await fs.rename(temporary, this.file);
    return this.current;
  }
}
