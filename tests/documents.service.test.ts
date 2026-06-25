import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { AppError } from "../src/shared/errors/AppError";
import { createYjsStateFromPlainText } from "../src/collaboration/prosemirror-plain-text";

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  projectMember: {
    findUnique: vi.fn(),
  },
}));

const repositoryMock = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
  createDocument: vi.fn(),
  createDocumentAsset: vi.fn(),
  createGeneratedDiagram: vi.fn(),
  deleteDocumentAsset: vi.fn(),
  findDocumentAccessForUser: vi.fn(),
  findDocumentAsset: vi.fn(),
  findDocumentForUser: vi.fn(),
  findDocumentStateForUser: vi.fn(),
  listDocumentAssets: vi.fn(),
  listDocumentsByProject: vi.fn(),
  softDeleteDocument: vi.fn(),
  updateDocumentTitle: vi.fn(),
}));

const storageMock = vi.hoisted(() => ({
  deleteDocumentAssetObject: vi.fn(),
  getDocumentAssetStream: vi.fn(),
  storeDocumentAsset: vi.fn(),
  storeManagedAsset: vi.fn(),
}));

const aiFetchMock = vi.hoisted(() => ({
  aiFetch: vi.fn(),
}));

vi.mock("../src/prisma/client", () => ({
  prisma: prismaMock,
}));

vi.mock("../src/modules/documents/documents.repository", () => repositoryMock);

vi.mock("../src/services/document-asset-storage.service", () => storageMock);

vi.mock("../src/services/ai-fetch.service", () => aiFetchMock);

vi.mock("../src/modules/copilot/indexing/indexing.service", () => ({
  enqueueDocumentSafe: vi.fn(),
}));

vi.mock("../src/modules/copilot/indexing/knowledge.repository", () => ({
  deleteBySource: vi.fn(() => Promise.resolve()),
}));

import {
  createProjectDocument,
  createGeneratedDiagramForProject,
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
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Proyecto",
      members: [{ userId: "user-1" }],
    });
    repositoryMock.findDocumentAccessForUser.mockResolvedValue({
      id: "doc-1",
      projectId: "project-1",
      createdById: "user-1",
      permissions: [{ role: "EDITOR" }],
    });
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
      accessRole: "EDITOR",
    });

    repositoryMock.findDocumentForUser.mockResolvedValueOnce(null);
    await expect(getDocument("doc-1", "user-2")).rejects.toBeInstanceOf(
      AppError
    );
  });

  it("renames and soft deletes only after access validation", async () => {
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
    } as Express.Application);

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

  it("generates diagrams through Kroki/PlantUML and stores the image asset", async () => {
    const diagram = {
      id: "diagram-1",
      projectId: "project-1",
      documentId: null,
      title: "Class Diagram",
      diagramType: "class",
      prompt: "modelo de usuarios",
      storageKey: "local://projects/project-1/generated-diagrams/diagram-1/class.png",
      publicUrl: "/api/v1/diagrams/diagram-1/content",
      createdById: "user-1",
    };

    prismaMock.projectMember.findUnique.mockResolvedValue({ isActive: true });
    aiFetchMock.aiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          provider: "kroki",
          source_language: "plantuml",
          url: "http://ai.local/public/diagrams/kroki_class_1.png",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from("png"),
      });
    storageMock.storeManagedAsset.mockResolvedValue(diagram.storageKey);
    repositoryMock.createGeneratedDiagram.mockResolvedValue(diagram);

    await expect(
      createGeneratedDiagramForProject("project-1", "user-1", {
        prompt: "modelo de usuarios",
        diagram_type: "class",
      })
    ).resolves.toEqual(diagram);

    expect(aiFetchMock.aiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/diagrams/generate"),
      expect.objectContaining({
        method: "POST",
      }),
      "kroki diagram generation"
    );
    expect(storageMock.storeManagedAsset).toHaveBeenCalledWith(
      expect.stringContaining("projects/project-1/generated-diagrams/"),
      "image/png",
      Buffer.from("png")
    );
    expect(repositoryMock.createGeneratedDiagram).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        diagramType: "class",
        prompt: "modelo de usuarios",
        storageKey: diagram.storageKey,
      })
    );
  });

  it("includes document context in the diagram prompt when requested", async () => {
    const diagram = {
      id: "diagram-2",
      projectId: "project-1",
      documentId: "doc-1",
      title: "Arquitectura",
      diagramType: "component",
      prompt: "enfocate en servicios",
      storageKey: "local://diagram.png",
      publicUrl: "/api/v1/diagrams/diagram-2/content",
      createdById: "user-1",
    };

    prismaMock.projectMember.findUnique.mockResolvedValue({ isActive: true });
    repositoryMock.findDocumentForUser.mockResolvedValue({
      id: "doc-1",
      projectId: "project-1",
    });
    repositoryMock.findDocumentStateForUser.mockResolvedValue({
      id: "doc-1",
      projectId: "project-1",
      title: "Arquitectura del sistema",
      contentState: createYjsStateFromPlainText("Frontend Next.js\nBackend Node.js\nPostgreSQL"),
    });
    aiFetchMock.aiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          provider: "kroki",
          source_language: "plantuml",
          url: "http://ai.local/public/diagrams/kroki_component_1.png",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from("png"),
      });
    storageMock.storeManagedAsset.mockResolvedValue(diagram.storageKey);
    repositoryMock.createGeneratedDiagram.mockResolvedValue(diagram);

    await expect(
      createGeneratedDiagramForProject("project-1", "user-1", {
        prompt: "enfocate en servicios",
        diagram_type: "component",
        documentId: "doc-1",
        includeDocumentContext: true,
      })
    ).resolves.toEqual(diagram);

    const request = aiFetchMock.aiFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string) as { prompt: string };
    expect(body.prompt).toContain("Instruccion del usuario:");
    expect(body.prompt).toContain("enfocate en servicios");
    expect(body.prompt).toContain('Contexto del documento "Arquitectura del sistema":');
    expect(body.prompt).toContain("Backend Node.js");
  });

  it("allows diagram generation with only document context", async () => {
    prismaMock.projectMember.findUnique.mockResolvedValue({ isActive: true });
    repositoryMock.findDocumentForUser.mockResolvedValue({
      id: "doc-1",
      projectId: "project-1",
    });
    repositoryMock.findDocumentStateForUser.mockResolvedValue({
      id: "doc-1",
      projectId: "project-1",
      title: "Documento",
      contentState: createYjsStateFromPlainText("Usuarios crean tareas y sprints."),
    });
    aiFetchMock.aiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          url: "http://ai.local/public/diagrams/kroki_class_1.png",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from("png"),
      });
    storageMock.storeManagedAsset.mockResolvedValue("local://diagram.png");
    repositoryMock.createGeneratedDiagram.mockResolvedValue({ id: "diagram-3" });

    await expect(
      createGeneratedDiagramForProject("project-1", "user-1", {
        prompt: "",
        diagram_type: "class",
        documentId: "doc-1",
        includeDocumentContext: true,
      })
    ).resolves.toEqual({ id: "diagram-3" });

    const request = aiFetchMock.aiFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string) as { prompt: string };
    expect(body.prompt).toContain("Genera un diagrama Class Diagram coherente");
  });

  it("rejects document context without a document id", async () => {
    prismaMock.projectMember.findUnique.mockResolvedValue({ isActive: true });

    await expect(
      createGeneratedDiagramForProject("project-1", "user-1", {
        prompt: "",
        diagram_type: "class",
        includeDocumentContext: true,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects empty document context", async () => {
    prismaMock.projectMember.findUnique.mockResolvedValue({ isActive: true });
    repositoryMock.findDocumentForUser.mockResolvedValue({
      id: "doc-1",
      projectId: "project-1",
    });
    repositoryMock.findDocumentStateForUser.mockResolvedValue({
      id: "doc-1",
      projectId: "project-1",
      title: "Documento vacio",
      contentState: null,
    });

    await expect(
      createGeneratedDiagramForProject("project-1", "user-1", {
        prompt: "",
        diagram_type: "class",
        documentId: "doc-1",
        includeDocumentContext: true,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
