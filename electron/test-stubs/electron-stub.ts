/**
 * Minimal Electron stub for running main-process modules under plain Node in
 * tests (wired via esbuild --alias:electron=...). Only covers what the
 * palette extractor touches: a 4×4 warm-toned BGRA bitmap.
 */

const WIDTH = 4;
const HEIGHT = 4;

function makeBitmap(): Buffer {
  const buf = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
    buf[i * 4] = 60; // B
    buf[i * 4 + 1] = 100; // G
    buf[i * 4 + 2] = 180; // R
    buf[i * 4 + 3] = 255; // A
  }
  return buf;
}

export const nativeImage = {
  createFromPath: (_path: string) => ({
    isEmpty: () => false,
    getSize: () => ({ width: WIDTH, height: HEIGHT }),
    getBitmap: () => makeBitmap(),
    toPNG: () => Buffer.from("preview-png"),
    resize: (_opts: unknown) => ({
      getBitmap: () => makeBitmap(),
      getSize: () => ({ width: WIDTH, height: HEIGHT }),
      toPNG: () => Buffer.from("preview-png"),
    }),
  }),
};
