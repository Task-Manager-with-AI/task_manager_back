import { env } from "../../config/env";
import { embedQuery } from "../../services/ai-client.service";
import * as knowledge from "./indexing/knowledge.repository";
import type {
  KnowledgeSourceType,
  RetrievedChunk,
} from "./indexing/knowledge.repository";

export interface SearchResult {
  chunkId: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  title: string;
  url: string | null;
  content: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Semantic search over a project's knowledge index. The projectId filter is the
 * hard isolation boundary — callers must pass the project the user is a member of.
 */
export async function searchKnowledge(params: {
  projectId: string;
  query: string;
  topK?: number;
  sourceTypes?: KnowledgeSourceType[];
}): Promise<SearchResult[]> {
  const { projectId, query } = params;
  const topK = params.topK ?? env.RAG_TOP_K;

  if (!query?.trim()) return [];

  const queryVector = await embedQuery(query);
  if (queryVector.length === 0) return [];

  const rows = await knowledge.retrieve({
    projectId,
    queryVector,
    topK,
    sourceTypes: params.sourceTypes,
  });

  return rows.map(toResult);
}

function toResult(row: RetrievedChunk): SearchResult {
  const meta = row.metadata ?? {};
  return {
    chunkId: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    title: (meta["title"] as string) ?? row.sourceType,
    url: (meta["url"] as string) ?? null,
    content: row.content,
    score: row.score,
    metadata: row.metadata,
  };
}
