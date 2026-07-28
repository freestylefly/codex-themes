import assert from "node:assert/strict";
import test from "node:test";
import { createCodexDesktopAdapter } from "./index";

test("desktop adapter selection follows the operating system", () => {
  assert.equal(createCodexDesktopAdapter("darwin").platform, "darwin");
  assert.equal(createCodexDesktopAdapter("win32").platform, "win32");
  assert.equal(createCodexDesktopAdapter("linux").platform, "unsupported");
});
