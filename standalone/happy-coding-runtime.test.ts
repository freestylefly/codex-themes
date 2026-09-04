import assert from "node:assert/strict";
import test from "node:test";

import { parseRuntimeCommand } from "./happy-coding-runtime-core";

test("defaults to the persistent watcher", () => {
  assert.equal(parseRuntimeCommand([]), "watch");
  assert.equal(parseRuntimeCommand(["--watch"]), "watch");
});

test("recognizes one-shot apply and cleanup commands", () => {
  assert.equal(parseRuntimeCommand(["--apply-once"]), "apply-once");
  assert.equal(parseRuntimeCommand(["--cleanup"]), "cleanup");
});

test("rejects unknown commands", () => {
  assert.throws(() => parseRuntimeCommand(["--unknown"]), /Unknown option/);
});
