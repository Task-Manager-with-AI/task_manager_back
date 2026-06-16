import {
  DocumentConversionJobType,
  DocumentPermissionRole,
  DocumentSuggestionType,
  DocumentSuggestionStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../prisma/client";
import type {
  DiagramTypeDto,
  CreateDocumentDto,
  UpdateDocumentDto,
} from "./documents.schema";

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
      commentThreads: true,
      suggestions: true,
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

export const documentPermissionSelect = {
  id: true,
  documentId: true,
  userId: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
};

const commentSelect = {
  id: true,
  threadId: true,
  authorId: true,
  body: true,
  mentions: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  author: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
};

const commentThreadSelect = {
  id: true,
  documentId: true,
  createdById: true,
  anchorFrom: true,
  anchorTo: true,
  quoteText: true,
  isResolved: true,
  resolvedAt: true,
  resolvedById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  resolvedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  comments: {
    select: commentSelect,
    orderBy: {
      createdAt: "asc" as const,
    },
  },
};

const suggestionSelect = {
  id: true,
  documentId: true,
  createdById: true,
  resolvedById: true,
  type: true,
  status: true,
  anchorFrom: true,
  anchorTo: true,
  note: true,
  payload: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  resolvedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
};

const versionSelect = {
  id: true,
  documentId: true,
  createdById: true,
  source: true,
  plainText: true,
  metadata: true,
  createdAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
};

const versionWithStateSelect = {
  ...versionSelect,
  contentState: true,
};

const conversionJobSelect = {
  id: true,
  documentId: true,
  createdById: true,
  type: true,
  status: true,
  inputAssetId: true,
  outputAssetId: true,
  sourceVersionId: true,
  resultVersionId: true,
  requestedFileName: true,
  providerJobId: true,
  errorMessage: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
};

const generatedDiagramSelect = {
  id: true,
  projectId: true,
  documentId: true,
  title: true,
  diagramType: true,
  prompt: true,
  storageKey: true,
  publicUrl: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  document: {
    select: {
      id: true,
      title: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
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
      permissions: {
        create: {
          userId: createdById,
          role: DocumentPermissionRole.EDITOR,
        },
      },
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

export function findDocumentAccessForUser(documentId: string, userId: string) {
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
      createdById: true,
      permissions: {
        where: {
          userId,
        },
        select: {
          role: true,
        },
        take: 1,
      },
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

export function listDocumentPermissions(documentId: string) {
  return prisma.documentPermission.findMany({
    where: { documentId },
    select: documentPermissionSelect,
    orderBy: {
      createdAt: "asc",
    },
  });
}

export function replaceDocumentPermissions(
  documentId: string,
  permissions: Array<{ userId: string; role: DocumentPermissionRole }>
) {
  return prisma.$transaction(async (tx) => {
    await tx.documentPermission.deleteMany({ where: { documentId } });

    if (permissions.length === 0) {
      return [];
    }

    await tx.documentPermission.createMany({
      data: permissions.map((permission) => ({
        documentId,
        userId: permission.userId,
        role: permission.role,
      })),
    });

    return tx.documentPermission.findMany({
      where: { documentId },
      select: documentPermissionSelect,
      orderBy: { createdAt: "asc" },
    });
  });
}

export function createCommentThread(data: {
  documentId: string;
  createdById: string;
  anchorFrom?: number;
  anchorTo?: number;
  quoteText?: string;
  body: string;
  mentions: string[];
}) {
  return prisma.commentThread.create({
    data: {
      documentId: data.documentId,
      createdById: data.createdById,
      anchorFrom: data.anchorFrom,
      anchorTo: data.anchorTo,
      quoteText: data.quoteText,
      comments: {
        create: {
          authorId: data.createdById,
          body: data.body,
          mentions: data.mentions,
        },
      },
    },
    select: commentThreadSelect,
  });
}

export function listCommentThreads(documentId: string, includeResolved: boolean) {
  return prisma.commentThread.findMany({
    where: {
      documentId,
      ...(includeResolved ? {} : { isResolved: false }),
    },
    select: commentThreadSelect,
    orderBy: {
      createdAt: "asc",
    },
  });
}

export function findCommentThread(documentId: string, threadId: string) {
  return prisma.commentThread.findFirst({
    where: {
      id: threadId,
      documentId,
    },
    select: commentThreadSelect,
  });
}

export function addCommentToThread(data: {
  threadId: string;
  authorId: string;
  body: string;
  mentions: string[];
}) {
  return prisma.comment.create({
    data,
    select: commentSelect,
  });
}

export function updateCommentThreadResolution(
  threadId: string,
  payload: { isResolved: boolean; userId: string }
) {
  return prisma.commentThread.update({
    where: { id: threadId },
    data: {
      isResolved: payload.isResolved,
      resolvedAt: payload.isResolved ? new Date() : null,
      resolvedById: payload.isResolved ? payload.userId : null,
    },
    select: commentThreadSelect,
  });
}

export function createDocumentSuggestion(data: {
  documentId: string;
  createdById: string;
  type: DocumentSuggestionType;
  anchorFrom?: number;
  anchorTo?: number;
  note?: string;
  payload?: Prisma.JsonObject;
}) {
  return prisma.documentSuggestion.create({
    data,
    select: suggestionSelect,
  });
}

export function listDocumentSuggestions(
  documentId: string,
  status?: DocumentSuggestionStatus
) {
  return prisma.documentSuggestion.findMany({
    where: {
      documentId,
      ...(status ? { status } : {}),
    },
    select: suggestionSelect,
    orderBy: {
      createdAt: "asc",
    },
  });
}

export function findDocumentSuggestion(documentId: string, suggestionId: string) {
  return prisma.documentSuggestion.findFirst({
    where: {
      id: suggestionId,
      documentId,
    },
    select: suggestionSelect,
  });
}

export function resolveDocumentSuggestion(data: {
  suggestionId: string;
  status: DocumentSuggestionStatus;
  resolvedById: string;
}) {
  return prisma.documentSuggestion.update({
    where: {
      id: data.suggestionId,
    },
    data: {
      status: data.status,
      resolvedById: data.resolvedById,
      resolvedAt: new Date(),
    },
    select: suggestionSelect,
  });
}

export function createDocumentVersion(data: {
  documentId: string;
  createdById?: string;
  source: string;
  contentState?: Buffer | null;
  plainText?: string | null;
  metadata?: Prisma.JsonObject;
}) {
  return prisma.documentVersion.create({
    data,
    select: versionSelect,
  });
}

export function listDocumentVersions(documentId: string, take: number) {
  return prisma.documentVersion.findMany({
    where: {
      documentId,
    },
    take,
    select: versionSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export function findDocumentVersion(documentId: string, versionId: string) {
  return prisma.documentVersion.findFirst({
    where: {
      id: versionId,
      documentId,
    },
    select: versionWithStateSelect,
  });
}

export function createAuditLog(data: {
  documentId: string;
  actorId?: string;
  eventType: string;
  details?: Prisma.JsonObject;
}) {
  return prisma.documentAuditLog.create({
    data,
    select: {
      id: true,
      documentId: true,
      actorId: true,
      eventType: true,
      createdAt: true,
    },
  });
}

export function createConversionJob(data: {
  documentId: string;
  createdById: string;
  type: DocumentConversionJobType;
  inputAssetId?: string;
  sourceVersionId?: string;
  requestedFileName?: string;
}) {
  return prisma.documentConversionJob.create({
    data,
    select: conversionJobSelect,
  });
}

export function listConversionJobs(documentId: string) {
  return prisma.documentConversionJob.findMany({
    where: { documentId },
    select: conversionJobSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export function findConversionJob(documentId: string, jobId: string) {
  return prisma.documentConversionJob.findFirst({
    where: {
      id: jobId,
      documentId,
    },
    select: conversionJobSelect,
  });
}

export function findConversionJobById(jobId: string) {
  return prisma.documentConversionJob.findUnique({
    where: { id: jobId },
    select: conversionJobSelect,
  });
}

export function updateConversionJob(
  jobId: string,
  data: Prisma.DocumentConversionJobUpdateInput
) {
  return prisma.documentConversionJob.update({
    where: { id: jobId },
    data,
    select: conversionJobSelect,
  });
}

export function pruneDocumentVersionsOlderThan(documentId: string, olderThan: Date) {
  return prisma.documentVersion.deleteMany({
    where: {
      documentId,
      createdAt: {
        lt: olderThan,
      },
      source: {
        not: "checkpoint",
      },
    },
  });
}

export function createGeneratedDiagram(data: {
  id: string;
  projectId: string;
  documentId?: string | null;
  title: string;
  diagramType: DiagramTypeDto;
  prompt?: string | null;
  storageKey: string;
  publicUrl: string;
  createdById: string;
}) {
  return prisma.generatedDiagram.create({
    data: {
      id: data.id,
      projectId: data.projectId,
      documentId: data.documentId ?? null,
      title: data.title,
      diagramType: data.diagramType,
      prompt: data.prompt ?? null,
      storageKey: data.storageKey,
      publicUrl: data.publicUrl,
      createdById: data.createdById,
    },
    select: generatedDiagramSelect,
  });
}

export function listGeneratedDiagramsByProject(projectId: string) {
  return prisma.generatedDiagram.findMany({
    where: { projectId },
    select: generatedDiagramSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export function listGeneratedDiagramsByDocument(documentId: string) {
  return prisma.generatedDiagram.findMany({
    where: { documentId },
    select: generatedDiagramSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export function findGeneratedDiagramForUser(diagramId: string, userId: string) {
  return prisma.generatedDiagram.findFirst({
    where: {
      id: diagramId,
      project: {
        members: {
          some: {
            userId,
            isActive: true,
          },
        },
      },
    },
    select: generatedDiagramSelect,
  });
}

