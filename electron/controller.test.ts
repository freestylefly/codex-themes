import assert from "node:assert/strict";
import test from "node:test";
import { canAttemptAutoApply, shouldStopStaleWatcher } from "./controller";

test("a running watcher cannot block auto-apply after its CDP endpoint disappears", () => {
  assert.equal(shouldStopStaleWatcher(true, false), true);
  assert.equal(shouldStopStaleWatcher(true, true), false);
  assert.equal(shouldStopStaleWatcher(false, false), false);
});

test("auto-apply cannot restart Codex again before the user ends the current run", () => {
  assert.equal(canAttemptAutoApply(false), true);
  assert.equal(canAttemptAutoApply(true), false);
});
