import { prisma } from "../../../../prisma/client";
import { extractPlainTextFromState } from "../../../../collaboration/prosemirror-plain-text";
import { chunkText } from "../chunking";
import type { KnowledgeSource, SourceBuildResult } from "./types";

/**
 * Documents are indexed from the latest DocumentVersion.plainText when present.
 * For live-edited documents (whose snapshots store plainText=null) we fall back
 * to decoding the current Yjs contentState into plain text.
 */
export const documentSource: KnowledgeSource = {
  type: "DOCUMENT",
  async build(documentId: string): Promise<SourceBuildResult | null> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        title: true,
        updatedAt: true,
        contentState: true,
      },
    });
    if (!doc) return null;

    const latest = await prisma.documentVersion.findFirst({
      where: { documentId, plainText: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { plainText: true, createdAt: true },
    });

    let text = (latest?.plainText ?? "").trim();
    // Fallback: derive plain text from the current collaborative state.
    if (!text && doc.contentState) {
      try {
        text = extractPlainTextFromState(new Uint8Array(doc.contentState)).trim();
      } catch {
        text = "";
      }
    }
    if (!text) return { projectId: doc.projectId, chunks: [] };

    const chunks = chunkText(text).map((c) => ({
      ...c,
      metadata: {
        title: doc.title,
        sourceType: "DOCUMENT",
        sourceId: doc.id,
        url: `/projects/${doc.projectId}/documents/${doc.id}`,
        createdAt: (latest?.createdAt ?? doc.updatedAt).toISOString(),
      },
    }));

    return { projectId: doc.projectId, chunks };
  },
};
