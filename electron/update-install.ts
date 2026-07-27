export type UpdatePreparationResult =
  | { status: "ready" }
  | { status: "timed-out" }
  | { status: "failed"; error: Error };

/**
 * Give background services a short grace period to stop before handing the
 * process to the platform updater. Installation still proceeds if cleanup
 * fails or exceeds the deadline.
 */
export async function prepareUpdateInstall(
  prepare: () => Promise<void>,
  timeoutMs: number,
): Promise<UpdatePreparationResult> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const preparation: Promise<UpdatePreparationResult> = Promise.resolve()
    .then(prepare)
    .then(
      (): UpdatePreparationResult => ({ status: "ready" }),
      (error: unknown): UpdatePreparationResult => ({
        status: "failed",
        error: error instanceof Error ? error : new Error(String(error)),
      }),
    );
  const deadline = new Promise<UpdatePreparationResult>((resolve) => {
    timeout = setTimeout(() => resolve({ status: "timed-out" }), timeoutMs);
  });

  try {
    return await Promise.race([preparation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Prevent repeated clicks from submitting the same native install twice. */
export class UpdateInstallGate {
  private claimed = false;

  tryClaim(): boolean {
    if (this.claimed) return false;
    this.claimed = true;
    return true;
  }

  release(): void {
    this.claimed = false;
  }
}
