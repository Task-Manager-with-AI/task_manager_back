import type { TextChunk } from "../chunking";
import type { KnowledgeSourceType } from "../knowledge.repository";

export interface BuiltChunk extends TextChunk {
  metadata: Record<string, unknown>;
}

export interface SourceBuildResult {
  projectId: string;
  chunks: BuiltChunk[];
}

/**
 * A knowledge source adapter. `build` returns the chunks to (re)index for the
 * given entity, or `null` when the entity no longer exists / should be removed
 * from the index (the worker then deletes its chunks).
 */
export interface KnowledgeSource {
  type: KnowledgeSourceType;
  build(sourceId: string): Promise<SourceBuildResult | null>;
}
