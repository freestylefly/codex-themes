/**
 * Backup/restore of the appearance-related keys in ~/.codex/config.toml.
 * Ported from theme-config.mjs (MIT). Only [desktop] section keys
 * appearanceTheme / appearanceDarkCodeThemeId are touched; writes are atomic
 * and file modes are preserved.
 */

import fs from "node:fs/promises";
import path from "node:path";

const APPEARANCE_KEYS = ["appearanceTheme", "appearanceDarkCodeThemeId"] as const;

interface DesktopSection {
  bodyStart: number;
  bodyEnd: number;
  body: string;
}

interface ThemeBackup {
  schemaVersion: 1;
  platform: string;
  createdAt: string;
  configPath: string;
  values: Record<string, string | null>;
}

function desktopSection(content: string): DesktopSection | null {
  const header = /^\[desktop\]\s*\r?\n/m.exec(content);
  if (!header) return null;
  const bodyStart = header.index + header[0].length;
  const remainder = content.slice(bodyStart);
  const nextHeader = /^\[/m.exec(remainder);
  const bodyEnd = nextHeader ? bodyStart + nextHeader.index : content.length;
  return { bodyStart, bodyEnd, body: content.slice(bodyStart, bodyEnd) };
}

const escapeKey = (key: string) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function replaceSetting(body: string, key: string, line: string | null): string {
  const pattern = new RegExp(`^${escapeKey(key)}\\s*=.*(?:\\r?\\n)?`, "m");
  if (line === null) return body.replace(pattern, "");
  if (pattern.test(body)) return body.replace(pattern, `${line}\n`);
  const separator = body.length && !body.endsWith("\n") ? "\n" : "";
  return `${body}${separator}${line}\n`;
}

async function atomicWrite(file: string, value: string, modeBits: number): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, value, { mode: modeBits });
  await fs.rename(temporary, file);
  await fs.chmod(file, modeBits);
}

/**
 * Save the current appearance key lines into backupPath (first apply only).
 * The user's appearance settings themselves are left untouched — the skin
 * auto-adapts to light/dark.
 */
export async function backupAppearanceKeys(configPath: string, backupPath: string): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // No config yet — still record an empty backup so restore is a no-op.
      content = "";
    } else {
      throw error;
    }
  }

  try {
    await fs.access(backupPath);
    return; // backup already exists — never overwrite the original
  } catch {
    // create it below
  }

  const section = desktopSection(content);
  const values: Record<string, string | null> = {};
  for (const key of APPEARANCE_KEYS) {
    const match = section
      ? new RegExp(`^${escapeKey(key)}\\s*=.*$`, "m").exec(section.body)
      : null;
    values[key] = match ? match[0] : null;
  }
  const backup: ThemeBackup = {
    schemaVersion: 1,
    platform: "darwin",
    createdAt: new Date().toISOString(),
    configPath,
    values,
  };
  await fs.mkdir(path.dirname(backupPath), { recursive: true, mode: 0o700 });
  await atomicWrite(backupPath, `${JSON.stringify(backup, null, 2)}\n`, 0o600);
}

/** Restore the backed-up appearance key lines and remove the backup file. */
export async function restoreAppearanceKeys(configPath: string, backupPath: string): Promise<void> {
  let backup: ThemeBackup;
  try {
    backup = JSON.parse(await fs.readFile(backupPath, "utf8")) as ThemeBackup;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return; // nothing to restore
    throw new Error(`Could not read the theme backup: ${(error as Error).message}`);
  }
  if (backup.schemaVersion !== 1 || backup.configPath !== configPath || !backup.values) {
    throw new Error("Theme backup identity or schema does not match this config; nothing was restored.");
  }

  let content: string;
  try {
    content = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") content = "";
    else throw error;
  }
  const originalStat = await fs.stat(configPath).catch(() => null);

  let section = desktopSection(content);
  if (!section) {
    const hasSavedSetting = APPEARANCE_KEYS.some((key) => backup.values[key]);
    if (!hasSavedSetting) {
      await fs.unlink(backupPath);
      return;
    }
    content = `${content.trimEnd()}\n\n[desktop]\n`;
    section = desktopSection(content)!;
  }
  let body = section.body;
  for (const key of APPEARANCE_KEYS) body = replaceSetting(body, key, backup.values[key] ?? null);
  const restored = content.slice(0, section.bodyStart) + body + content.slice(section.bodyEnd);
  await atomicWrite(configPath, restored, (originalStat?.mode ?? 0o600) & 0o777);
  await fs.unlink(backupPath);
}
