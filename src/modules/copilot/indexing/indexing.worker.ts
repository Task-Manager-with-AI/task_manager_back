import { env } from "../../../config/env";
import { prisma } from "../../../prisma/client";
import { indexSource } from "./indexing.service";

const MAX_ATTEMPTS = 3;
let timer: NodeJS.Timeout | null = null;
let draining = false;

/**
 * Claim and process the next PENDING indexing job. Returns true if a job was
 * processed (so the caller can keep draining), false if the queue was empty.
 */
async function processNext(): Promise<boolean> {
  // Atomically claim one job (RUNNING) so concurrent workers don't double-pick.
  const claimed = await prisma.$transaction(async (tx) => {
    const job = await tx.indexingJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!job) return null;
    return tx.indexingJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", attempts: { increment: 1 } },
    });
  });

  if (!claimed) return false;

  try {
    await indexSource(claimed.sourceType, claimed.sourceId);
    await prisma.indexingJob.update({
      where: { id: claimed.id },
      data: { status: "DONE", errorMessage: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedPermanently = claimed.attempts >= MAX_ATTEMPTS;
    await prisma.indexingJob.update({
      where: { id: claimed.id },
      data: {
        status: failedPermanently ? "FAILED" : "PENDING",
        errorMessage: message,
      },
    });
    console.error(
      `[copilot] indexing job ${claimed.sourceType}:${claimed.sourceId} failed` +
        ` (attempt ${claimed.attempts}/${MAX_ATTEMPTS}): ${message}`
    );
  }
  return true;
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    // Process up to a bounded batch per tick to avoid starving the event loop.
    let processed = 0;
    while (processed < 20 && (await processNext())) processed++;
  } catch (err) {
    console.error("[copilot] indexing worker drain error:", err);
  } finally {
    draining = false;
  }
}

export function startIndexingWorker(): void {
  if (!env.COPILOT_INDEXING_WORKER_ENABLED) {
    console.log("[copilot] indexing worker disabled (COPILOT_INDEXING_WORKER_ENABLED=false)");
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    void drain();
  }, env.COPILOT_INDEXING_POLL_MS);
  // Don't keep the process alive solely for the worker.
  timer.unref?.();
  console.log(
    `[copilot] indexing worker started (poll every ${env.COPILOT_INDEXING_POLL_MS}ms)`
  );
}

export function stopIndexingWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
