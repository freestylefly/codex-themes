import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareUpdateInstall,
  UpdateInstallGate,
} from "./update-install";

test("update installation preparation completes normally", async () => {
  let prepared = false;
  const result = await prepareUpdateInstall(async () => {
    prepared = true;
  }, 100);

  assert.equal(prepared, true);
  assert.deepEqual(result, { status: "ready" });
});

test("update installation continues after preparation timeout", async () => {
  const result = await prepareUpdateInstall(
    () => new Promise<void>(() => {}),
    5,
  );

  assert.deepEqual(result, { status: "timed-out" });
});

test("update installation captures preparation failures", async () => {
  const result = await prepareUpdateInstall(
    async () => {
      throw new Error("shutdown failed");
    },
    100,
  );

  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.error.message, "shutdown failed");
  }
});

test("update installation gate accepts only one active request", () => {
  const gate = new UpdateInstallGate();

  assert.equal(gate.tryClaim(), true);
  assert.equal(gate.tryClaim(), false);
  gate.release();
  assert.equal(gate.tryClaim(), true);
});
