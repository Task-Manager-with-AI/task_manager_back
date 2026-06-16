import { createHash } from "crypto";

/**
 * Approximate token count. We avoid a tokenizer dependency on the backend and
 * use the common heuristic ~4 chars/token (good enough for budgeting chunks).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface TextChunk {
  content: string;
  tokenCount: number;
  contentHash: string;
}

const DEFAULT_MAX_TOKENS = 700;
const DEFAULT_OVERLAP_TOKENS = 80;

/**
 * Paragraph-aware chunker with token overlap. Splits on blank lines, packs
 * paragraphs up to `maxTokens`, and carries `overlapTokens` of tail context
 * into the next chunk so meaning isn't lost at boundaries. Long paragraphs are
 * hard-split by sentence/word.
 */
export function chunkText(
  raw: string,
  opts: { maxTokens?: number; overlapTokens?: number } = {}
): TextChunk[] {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = opts.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  // Split into paragraphs, then hard-split any paragraph that exceeds the budget.
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > maxChars ? hardSplit(p, maxChars) : [p]));

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (!current) {
      current = para;
    } else if (current.length + para.length + 2 <= maxChars) {
      current += "\n\n" + para;
    } else {
      chunks.push(current);
      const tail = current.slice(Math.max(0, current.length - overlapChars));
      current = (tail ? tail + "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current);

  return chunks.map((content) => ({
    content,
    tokenCount: estimateTokens(content),
    contentHash: contentHash(content),
  }));
}

function hardSplit(text: string, maxChars: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let current = "";
  for (const s of sentences) {
    const piece = s.length > maxChars ? s.slice(0, maxChars) : s;
    if (current.length + piece.length + 1 <= maxChars) {
      current += (current ? " " : "") + piece;
    } else {
      if (current) out.push(current);
      current = piece;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Build a single chunk for short, atomic sources (agreements, tasks, etc.). */
export function singleChunk(content: string): TextChunk {
  return {
    content,
    tokenCount: estimateTokens(content),
    contentHash: contentHash(content),
  };
}
