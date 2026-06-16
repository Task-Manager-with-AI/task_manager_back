import { describe, expect, it } from "vitest";
import {
  chunkText,
  contentHash,
  estimateTokens,
  singleChunk,
} from "../src/modules/copilot/indexing/chunking";

describe("copilot chunking", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    const chunks = chunkText("Una sola frase corta.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toContain("Una sola frase corta");
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
    expect(chunks[0]!.contentHash).toHaveLength(64);
  });

  it("splits long text into multiple overlapping chunks", () => {
    const paragraph = "Lorem ipsum dolor sit amet. ".repeat(80);
    const text = Array.from({ length: 6 }, () => paragraph).join("\n\n");
    const chunks = chunkText(text, { maxTokens: 100, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should respect a reasonable upper bound on size.
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(100 * 4 + 200);
    }
  });

  it("produces a stable hash for identical content", () => {
    expect(contentHash("hola")).toBe(contentHash("hola"));
    expect(contentHash("hola")).not.toBe(contentHash("adios"));
  });

  it("estimates tokens roughly by length", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });

  it("singleChunk wraps content atomically", () => {
    const c = singleChunk("Acuerdo: hacer X");
    expect(c.content).toBe("Acuerdo: hacer X");
    expect(c.contentHash).toHaveLength(64);
  });
});
