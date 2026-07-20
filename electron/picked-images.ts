/**
 * Allowlist of image paths the user explicitly picked via the file dialog.
 * Served to the renderer through the picked-image:// protocol so arbitrary
 * disk files are never reachable from the page.
 */

const picked = new Map<string, string>();
let counter = 0;

export function registerPickedImage(filePath: string): string {
  counter += 1;
  const token = `img-${counter}-${Date.now().toString(36)}`;
  picked.set(token, filePath);
  return `picked-image://${token}`;
}

export function resolvePickedImage(token: string): string | null {
  return picked.get(token) ?? null;
}
