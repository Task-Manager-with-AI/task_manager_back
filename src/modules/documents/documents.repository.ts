import { prisma } from "../../prisma/client";
import type { CreateDocumentDto, UpdateDocumentDto } from "./documents.schema";

const documentSelect = {
  id: true,
  projectId: true,
  createdById: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  _count: {
    select: {
      assets: true,
    },
  },
};

const publicDocumentAssetSelect = {
  id: true,
  documentId: true,
  fileName: true,
  mimeType: true,
  size: true,
  uploadedById: true,
  createdAt: true,
  uploadedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
};

const privateDocumentAssetSelect = {
  ...publicDocumentAssetSelect,
  s3Key: true,
};

export function listDocumentsByProject(projectId: string) {
  return prisma.document.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    select: documentSelect,
    orderBy: {
      updatedAt: "desc",
    },
  });
}

export function createDocument(
  projectId: string,
  createdById: string,
  dto: CreateDocumentDto
) {
  return prisma.document.create({
    data: {
      projectId,
      createdById,
      title: dto.title,
    },
    select: documentSelect,
  });
}

export function findDocumentForUser(documentId: string, userId: string) {
  return prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
      project: {
        members: {
          some: {
            userId,
            isActive: true,
          },
        },
      },
    },
    select: documentSelect,
  });
}

export function findDocumentStateForUser(documentId: string, userId: string) {
  return prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
      project: {
        members: {
          some: {
            userId,
            isActive: true,
          },
        },
      },
    },
    select: {
      id: true,
      projectId: true,
      contentState: true,
      title: true,
    },
  });
}

export function updateDocumentTitle(documentId: string, dto: UpdateDocumentDto) {
  return prisma.document.update({
    where: {
      id: documentId,
    },
    data: {
      title: dto.title,
    },
    select: documentSelect,
  });
}

export function softDeleteDocument(documentId: string) {
  return prisma.document.update({
    where: {
      id: documentId,
    },
    data: {
      deletedAt: new Date(),
    },
    select: documentSelect,
  });
}

export function updateDocumentContentState(documentId: string, contentState: Buffer) {
  return prisma.document.update({
    where: {
      id: documentId,
    },
    data: {
      contentState,
    },
    select: {
      id: true,
      updatedAt: true,
    },
  });
}

export function createDocumentAsset(data: {
  documentId: string;
  s3Key: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string;
}) {
  return prisma.documentAsset.create({
    data,
    select: publicDocumentAssetSelect,
  });
}

export function listDocumentAssets(documentId: string) {
  return prisma.documentAsset.findMany({
    where: {
      documentId,
    },
    select: publicDocumentAssetSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export function findDocumentAsset(documentId: string, assetId: string) {
  return prisma.documentAsset.findFirst({
    where: {
      id: assetId,
      documentId,
    },
    select: privateDocumentAssetSelect,
  });
}

export function deleteDocumentAsset(assetId: string) {
  return prisma.documentAsset.delete({
    where: {
      id: assetId,
    },
    select: privateDocumentAssetSelect,
  });
}
