import { embedTexts } from "../../../services/ai-client.service";
import { prisma } from "../../../prisma/client";
import * as knowledge from "./knowledge.repository";
import type { KnowledgeSourceType } from "./knowledge.repository";
import { getSource } from "./sources";

/**
 * (Re)index a single source entity now (synchronously). Fetches the chunks via
 * the source adapter, embeds them, and replaces the stored chunks. If the source
 * is gone, its chunks are deleted. Returns the number of chunks written.
 */
export async function indexSource(
  sourceType: KnowledgeSourceType,
  sourceId: string
): Promise<number> {
  const source = getSource(sourceType);
  if (!source) throw new Error(`Unknown knowledge source type: ${sourceType}`);

  const built = await source.build(sourceId);
  if (!built) {
    await knowledge.deleteBySource(sourceType, sourceId);
    return 0;
  }
  if (built.chunks.length === 0) {
    await knowledge.deleteBySource(sourceType, sourceId);
    return 0;
  }

  const { vectors, model } = await embedTexts(built.chunks.map((c) => c.content));

  return knowledge.replaceChunks({
    projectId: built.projectId,
    sourceType,
    sourceId,
    chunks: built.chunks,
    embeddings: vectors,
    embeddingModel: model,
  });
}

/**
 * Enqueue an indexing job (idempotent per source). Safe to call from mutation
 * hooks — it never blocks the request; the worker drains the queue. A PENDING
 * job for the same source is reused.
 */
export async function enqueue(
  projectId: string,
  sourceType: KnowledgeSourceType,
  sourceId: string
): Promise<void> {
  const existing = await prisma.indexingJob.findFirst({
    where: { sourceType, sourceId, status: "PENDING" },
    select: { id: true },
  });
  if (existing) return;

  await prisma.indexingJob.create({
    data: { projectId, sourceType, sourceId, status: "PENDING" },
  });
}

/** Fire-and-forget enqueue that never throws into the caller's flow. */
export function enqueueSafe(
  projectId: string,
  sourceType: KnowledgeSourceType,
  sourceId: string
): void {
  enqueue(projectId, sourceType, sourceId).catch((err) => {
    console.error(
      `[copilot] failed to enqueue indexing job ${sourceType}:${sourceId}`,
      err
    );
  });
}

/** Convenience: enqueue a DOCUMENT reindex by resolving its projectId. */
export function enqueueDocumentSafe(documentId: string): void {
  prisma.document
    .findUnique({ where: { id: documentId }, select: { projectId: true } })
    .then((doc) => {
      if (doc) return enqueue(doc.projectId, "DOCUMENT", documentId);
      return undefined;
    })
    .catch((err) => {
      console.error(`[copilot] failed to enqueue document ${documentId}`, err);
    });
}

/** Enqueue (re)indexing of every source in a single project. Returns job count. */
export async function reindexProject(projectId: string): Promise<number> {
  const [documents, minutes, tasks, chats] = await Promise.all([
    prisma.document.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true },
    }),
    prisma.minute.findMany({
      where: { meeting: { projectId } },
      select: { id: true },
    }),
    prisma.task.findMany({ where: { projectId }, select: { id: true } }),
    prisma.chat.findMany({
      where: { projectId, type: "PROJECT" },
      select: { id: true },
    }),
  ]);

  const jobs: { sourceType: KnowledgeSourceType; sourceId: string }[] = [
    ...documents.map((d) => ({ sourceType: "DOCUMENT" as const, sourceId: d.id })),
    ...minutes.map((m) => ({ sourceType: "MINUTE" as const, sourceId: m.id })),
    ...minutes.map((m) => ({ sourceType: "MEETING_TRANSCRIPT" as const, sourceId: m.id })),
    ...tasks.map((t) => ({ sourceType: "TASK" as const, sourceId: t.id })),
    ...chats.map((c) => ({ sourceType: "CHAT_MESSAGE" as const, sourceId: c.id })),
  ];

  for (const job of jobs) {
    await enqueue(projectId, job.sourceType, job.sourceId);
  }
  return jobs.length;
}
