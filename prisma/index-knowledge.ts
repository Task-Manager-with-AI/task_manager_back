/**
 * Idempotent backfill: enqueues indexing jobs for every indexable source across
 * all projects, so the RAG Copilot knowledge index is (re)built. The background
 * worker then drains the queue. Safe to run multiple times.
 *
 *   npx ts-node prisma/index-knowledge.ts            # enqueue only
 *   npx ts-node prisma/index-knowledge.ts --sync     # also index inline now
 *
 * Use --sync for a one-shot CLI build (e.g. in CI/dev) without a running server.
 */
import { PrismaClient } from "@prisma/client";
import { indexSource, enqueue } from "../src/modules/copilot/indexing/indexing.service";
import type { KnowledgeSourceType } from "../src/modules/copilot/indexing/knowledge.repository";

const prisma = new PrismaClient();
const SYNC = process.argv.includes("--sync");

async function collect(): Promise<
  { projectId: string; sourceType: KnowledgeSourceType; sourceId: string }[]
> {
  const out: { projectId: string; sourceType: KnowledgeSourceType; sourceId: string }[] = [];

  // Documents (latest plain-text version)
  const documents = await prisma.document.findMany({
    where: { deletedAt: null },
    select: { id: true, projectId: true },
  });
  documents.forEach((d) => out.push({ projectId: d.projectId, sourceType: "DOCUMENT", sourceId: d.id }));

  // Minutes → MINUTE (summary/keypoints/agreements) + MEETING_TRANSCRIPT
  const minutes = await prisma.minute.findMany({
    select: { id: true, meeting: { select: { projectId: true } } },
  });
  minutes.forEach((m) => {
    out.push({ projectId: m.meeting.projectId, sourceType: "MINUTE", sourceId: m.id });
    out.push({ projectId: m.meeting.projectId, sourceType: "MEETING_TRANSCRIPT", sourceId: m.id });
  });

  // Tasks
  const tasks = await prisma.task.findMany({ select: { id: true, projectId: true } });
  tasks.forEach((t) => out.push({ projectId: t.projectId, sourceType: "TASK", sourceId: t.id }));

  // Project (group) chats only
  const chats = await prisma.chat.findMany({
    where: { type: "PROJECT", projectId: { not: null } },
    select: { id: true, projectId: true },
  });
  chats.forEach((c) =>
    out.push({ projectId: c.projectId as string, sourceType: "CHAT_MESSAGE", sourceId: c.id })
  );

  return out;
}

async function main() {
  const items = await collect();
  console.log(`Found ${items.length} indexable sources. Mode: ${SYNC ? "sync" : "enqueue"}.`);

  let ok = 0;
  let failed = 0;
  for (const item of items) {
    try {
      if (SYNC) {
        const n = await indexSource(item.sourceType, item.sourceId);
        console.log(`✔ ${item.sourceType}:${item.sourceId} → ${n} chunks`);
      } else {
        await enqueue(item.projectId, item.sourceType, item.sourceId);
      }
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`✖ ${item.sourceType}:${item.sourceId}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nDone. ${SYNC ? "Indexed" : "Enqueued"} ${ok} sources (${failed} failed).`);
  if (!SYNC) console.log("The background worker will process the queue.");
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
