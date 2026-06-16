import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  document: {
    update: vi.fn(),
  },
}));

vi.mock("../src/prisma/client", () => ({
  prisma: prismaMock,
}));

import { updateDocumentContentState } from "../src/modules/documents/documents.repository";

describe("documents.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the Yjs state snapshot in Document.contentState", async () => {
    const contentState = Buffer.from([1, 2, 3]);
    prismaMock.document.update.mockResolvedValue({
      id: "doc-1",
      updatedAt: new Date(),
    });

    await updateDocumentContentState("doc-1", contentState);

    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: {
        id: "doc-1",
      },
      data: {
        contentState,
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });
  });
});
