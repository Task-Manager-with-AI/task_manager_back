import type { KnowledgeSourceType } from "../knowledge.repository";
import { chatSource } from "./chat.source";
import { documentSource } from "./document.source";
import { meetingTranscriptSource, minuteSource } from "./minute.source";
import { taskSource } from "./task.source";
import type { KnowledgeSource } from "./types";

const sources: KnowledgeSource[] = [
  documentSource,
  minuteSource,
  meetingTranscriptSource,
  taskSource,
  chatSource,
];

export const sourceRegistry: Record<string, KnowledgeSource> = Object.fromEntries(
  sources.map((s) => [s.type, s])
);

export function getSource(type: KnowledgeSourceType): KnowledgeSource | undefined {
  return sourceRegistry[type];
}

export type { KnowledgeSource, SourceBuildResult, BuiltChunk } from "./types";
