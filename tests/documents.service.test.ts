import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/shared/errors/AppError";

const prismaMock = vi.hoisted(() => ({
  projectMember: {
    findUnique: vi.fn(),
  },
}));

const repositoryMock = vi.hoisted(() => ({
  createDocument: vi.fn(),
  createDocumentAsset: vi.fn(),
  deleteDocumentAsset: vi.fn(),
  findDocumentAsset: vi.fn(),
  findDocumentForUser: vi.fn(),
  listDocumentAssets: vi.fn(),
  listDocumentsByProject: vi.fn(),
  softDeleteDocument: vi.fn(),
  updateDocumentTitle: vi.fn(),
}));

const storageMock = vi.hoisted(() => ({
  deleteDocumentAssetObject: vi.fn(),
  getDocumentAssetStream: vi.fn(),
  storeDocumentAsset: vi.fn(),
}));

vi.mock("../src/prisma/client", () => ({
  prisma: prismaMock,
}));

vi.mock("../src/modules/documents/documents.repository", () => repositoryMock);

vi.mock("../src/services/document-asset-storage.service", () => storageMock);

import {
  createProjectDocument,
  deleteDocument,
  downloadDocumentAsset,
  getDocument,
  listDocumentAssetsForUser,
  removeDocumentAsset,
  renameDocument,
  uploadDocumentAsset,
} from "../src/modules/documents/documents.service";

describe("documents.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a document only when the user is an active project member", async () => {
    const created = { id: "doc-1", title: "Plan" };
    prismaMock.projectMember.findUnique.mockResolvedValue({ isActive: true });
    repositoryMock.createDocument.mockResolvedValue(created);

    await expect(
      createProjectDocument("project-1", "user-1", { title: "Plan" })
    ).resolves.toBe(created);

    expect(repositoryMock.createDocument).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      { title: "Plan" }
    );
  });

  it("rejects document creation for a non-member", async () => {
    prismaMock.projectMember.findUnique.mockResolvedValue(null);

    await expect(
      createProjectDocument("project-1", "user-2", { title: "Plan" })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(repositoryMock.createDocument).not.toHaveBeenCalled();
  });

  it("returns a document for an authorized user and rejects missing access", async () => {
    repositoryMock.findDocumentForUser.mockResolvedValueOnce({ id: "doc-1" });
    await expect(getDocument("doc-1", "user-1")).resolves.toEqual({
      id: "doc-1",
    });

    repositoryMock.findDocumentForUser.mockResolvedValueOnce(null);
    await expect(getDocument("doc-1", "user-2")).rejects.toBeInstanceOf(
      AppError
    );
  });

  it("renames and soft deletes only after access validation", async () => {
    repositoryMock.findDocumentForUser.mockResolvedValue({ id: "doc-1" });
    repositoryMock.updateDocumentTitle.mockResolvedValue({
      id: "doc-1",
      title: "Nuevo",
    });
    repositoryMock.softDeleteDocument.mockResolvedValue({ id: "doc-1" });

    await expect(
      renameDocument("doc-1", "user-1", { title: "Nuevo" })
    ).resolves.toMatchObject({ title: "Nuevo" });
    await expect(deleteDocument("doc-1", "user-1")).resolves.toMatchObject({
      id: "doc-1",
    });
  });

  it("uploads an asset to S3 and stores public metadata without exposing s3Key", async () => {
    repositoryMock.findDocumentForUser.mockResolvedValue({ id: "doc-1" });
    storageMock.storeDocumentAsset.mockResolvedValue(
      "documents/assets/doc-1/file.txt"
    );
    repositoryMock.createDocumentAsset.mockResolvedValue({
      id: "asset-1",
      documentId: "doc-1",
      fileName: "file.txt",
      mimeType: "text/plain",
      size: 4,
      uploadedById: "user-1",
      createdAt: new Date(),
    });

    const asset = await uploadDocumentAsset("doc-1", "user-1", {
      originalname: "file.txt",
      mimetype: "text/plain",
      buffer: Buffer.from("hola"),
      size: 4,
    } as Express.Multer.File);

    expect(storageMock.storeDocumentAsset).toHaveBeenCalledWith(
      "doc-1",
      "file.txt",
      "text/plain",
      Buffer.from("hola")
    );
    expect(asset).not.toHaveProperty("s3Key");
  });

  it("lists, downloads and removes assets after membership validation", async () => {
    const asset = {
      id: "asset-1",
      s3Key: "documents/assets/doc-1/file.txt",
      fileName: "file.txt",
    };
    const stream = Readable.from(["hola"]);

    repositoryMock.findDocumentForUser.mockResolvedValue({ id: "doc-1" });
    repositoryMock.listDocumentAssets.mockResolvedValue([{ id: "asset-1" }]);
    repositoryMock.findDocumentAsset.mockResolvedValue(asset);
    repositoryMock.deleteDocumentAsset.mockResolvedValue(asset);
    storageMock.getDocumentAssetStream.mockResolvedValue({
      stream,
      contentType: "text/plain",
      contentLength: 4,
    });

    await expect(
      listDocumentAssetsForUser("doc-1", "user-1")
    ).resolves.toEqual([{ id: "asset-1" }]);
    await expect(
      downloadDocumentAsset("doc-1", "user-1", "asset-1")
    ).resolves.toMatchObject({ asset, stream });
    await expect(
      removeDocumentAsset("doc-1", "user-1", "asset-1")
    ).resolves.toEqual(asset);

    expect(storageMock.deleteDocumentAssetObject).toHaveBeenCalledWith(
      asset.s3Key
    );
  });
});
