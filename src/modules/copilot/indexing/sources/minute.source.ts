import { prisma } from "../../../../prisma/client";
import { chunkText, singleChunk } from "../chunking";
import type { BuiltChunk, KnowledgeSource, SourceBuildResult } from "./types";

/**
 * A meeting Minute yields several knowledge chunks: the executive summary, each
 * key point, and each agreement. The raw transcript is indexed separately under
 * the MEETING_TRANSCRIPT source type (see meeting-transcript.source.ts).
 */
export const minuteSource: KnowledgeSource = {
  type: "MINUTE",
  async build(minuteId: string): Promise<SourceBuildResult | null> {
    const minute = await prisma.minute.findUnique({
      where: { id: minuteId },
      select: {
        id: true,
        summary: true,
        keyPoints: true,
        createdAt: true,
        meeting: { select: { id: true, title: true, projectId: true, scheduledAt: true } },
        agreements: { select: { text: true, order: true }, orderBy: { order: "asc" } },
      },
    });
    if (!minute) return null;

    const meetingTitle = minute.meeting.title;
    const baseMeta = {
      title: `Minuta: ${meetingTitle}`,
      sourceType: "MINUTE",
      sourceId: minute.id,
      meetingId: minute.meeting.id,
      url: `/meetings/${minute.meeting.id}`,
      createdAt: (minute.meeting.scheduledAt ?? minute.createdAt).toISOString(),
    };

    const chunks: BuiltChunk[] = [];

    if (minute.summary?.trim()) {
      for (const c of chunkText(minute.summary)) {
        chunks.push({ ...c, metadata: { ...baseMeta, section: "summary" } });
      }
    }
    for (const kp of minute.keyPoints ?? []) {
      if (kp?.trim()) {
        chunks.push({ ...singleChunk(`Punto clave: ${kp}`), metadata: { ...baseMeta, section: "key_point" } });
      }
    }
    for (const ag of minute.agreements ?? []) {
      if (ag.text?.trim()) {
        chunks.push({
          ...singleChunk(`Acuerdo ${ag.order}: ${ag.text}`),
          metadata: { ...baseMeta, section: "agreement" },
        });
      }
    }

    return { projectId: minute.meeting.projectId, chunks };
  },
};

/** The full meeting transcript, chunked aggressively. */
export const meetingTranscriptSource: KnowledgeSource = {
  type: "MEETING_TRANSCRIPT",
  async build(minuteId: string): Promise<SourceBuildResult | null> {
    const minute = await prisma.minute.findUnique({
      where: { id: minuteId },
      select: {
        id: true,
        transcript: true,
        createdAt: true,
        meeting: { select: { id: true, title: true, projectId: true, scheduledAt: true } },
      },
    });
    if (!minute) return null;

    const text = (minute.transcript ?? "").trim();
    if (!text) return { projectId: minute.meeting.projectId, chunks: [] };

    const chunks = chunkText(text, { maxTokens: 800, overlapTokens: 120 }).map((c) => ({
      ...c,
      metadata: {
        title: `Transcripción: ${minute.meeting.title}`,
        sourceType: "MEETING_TRANSCRIPT",
        sourceId: minute.id,
        meetingId: minute.meeting.id,
        url: `/meetings/${minute.meeting.id}`,
        createdAt: (minute.meeting.scheduledAt ?? minute.createdAt).toISOString(),
      },
    }));

    return { projectId: minute.meeting.projectId, chunks };
  },
};
