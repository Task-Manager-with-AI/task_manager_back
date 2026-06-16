import { prisma } from "../../../prisma/client";

export type KnowledgeSourceType =
  | "DOCUMENT"
  | "MINUTE"
  | "MEETING_TRANSCRIPT"
  | "AGREEMENT"
  | "TASK"
  | "CHAT_MESSAGE"
  | "DAILY_ANALYSIS"
  | "ATTACHMENT";

export interface ChunkInput {
  content: string;
  tokenCount: number;
  contentHash: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievedChunk {
  id: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

/**
 * Replace all chunks for a given source entity with a fresh set, transactionally.
 * The embeddings array must align 1:1 with `chunks`.
 */
export async function replaceChunks(params: {
  projectId: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  chunks: ChunkInput[];
  embeddings: number[][];
  embeddingModel: string;
}): Promise<number> {
  const { projectId, sourceType, sourceId, chunks, embeddings, embeddingModel } =
    params;

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeChunk.deleteMany({ where: { sourceType, sourceId } });

    if (chunks.length > 0) {
      await tx.knowledgeChunk.createMany({
        data: chunks.map((chunk, i) => ({
          projectId,
          sourceType,
          sourceId,
          chunkIndex: i,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          embeddingModel,
          embedding: embeddings[i] ?? [],
          metadata: (chunk.metadata ?? {}) as object,
          contentHash: chunk.contentHash,
        })),
      });
    }
  });

  return chunks.length;
}

export async function deleteBySource(
  sourceType: KnowledgeSourceType,
  sourceId: string
): Promise<void> {
  await prisma.knowledgeChunk.deleteMany({ where: { sourceType, sourceId } });
}

/** Existing content hashes for a source — lets the indexer skip unchanged work. */
export async function existingHashes(
  sourceType: KnowledgeSourceType,
  sourceId: string
): Promise<string[]> {
  const rows = await prisma.knowledgeChunk.findMany({
    where: { sourceType, sourceId },
    orderBy: { chunkIndex: "asc" },
    select: { contentHash: true },
  });
  return rows.map((r) => r.contentHash);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Semantic search. The projectId filter is the hard isolation boundary — it is
 * always applied. Candidate chunks for the project are scored by cosine
 * similarity in-process and the top-K are returned.
 *
 * Note: this scans the project's chunks (no ANN index). It is intentionally
 * simple and DB-agnostic — adequate for per-project corpora. For large-scale
 * deployments, swap the storage/query for pgvector + HNSW (see plan §3.2).
 */
export async function retrieve(params: {
  projectId: string;
  queryVector: number[];
  topK: number;
  sourceTypes?: KnowledgeSourceType[];
}): Promise<RetrievedChunk[]> {
  const { projectId, queryVector, topK, sourceTypes } = params;

  const rows = await prisma.knowledgeChunk.findMany({
    where: {
      projectId,
      ...(sourceTypes && sourceTypes.length > 0
        ? { sourceType: { in: sourceTypes } }
        : {}),
    },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      chunkIndex: true,
      content: true,
      metadata: true,
      embedding: true,
    },
  });

  return rows
    .map((r) => ({
      id: r.id,
      sourceType: r.sourceType as KnowledgeSourceType,
      sourceId: r.sourceId,
      chunkIndex: r.chunkIndex,
      content: r.content,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      score: cosineSimilarity(queryVector, r.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function indexStatus(projectId: string): Promise<{
  totalChunks: number;
  byType: { sourceType: KnowledgeSourceType; count: number }[];
  lastIndexedAt: Date | null;
}> {
  const grouped = await prisma.knowledgeChunk.groupBy({
    by: ["sourceType"],
    where: { projectId },
    _count: { _all: true },
  });
  const last = await prisma.knowledgeChunk.aggregate({
    where: { projectId },
    _max: { updatedAt: true },
  });

  return {
    totalChunks: grouped.reduce((acc, g) => acc + g._count._all, 0),
    byType: grouped.map((g) => ({
      sourceType: g.sourceType as KnowledgeSourceType,
      count: g._count._all,
    })),
    lastIndexedAt: last._max.updatedAt ?? null,
  };
}
