import {
  DocumentConversionJobStatus,
  DocumentPermissionRole,
  DocumentSuggestionStatus,
  Prisma,
} from "@prisma/client";
import { buffer as readStreamBuffer } from "stream/consumers";
import { env } from "../../config/env";
import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import { syncPlainTextToCollaborationDocument } from "../../collaboration/collaboration.runtime";
import { createYjsStateFromPlainText } from "../../collaboration/prosemirror-plain-text";
import { enqueueDocumentSafe } from "../copilot/indexing/indexing.service";
import { deleteBySource } from "../copilot/indexing/knowledge.repository";
import { notifySafe } from "../notifications/notifications.service";
import {
  deleteDocumentAssetObject,
  getDocumentAssetStream,
  storeDocumentAsset,
} from "../../services/document-asset-storage.service";
import { dispatchDocumentConversionJob } from "../../services/document-conversion.service";
import type {
  CreateCommentDto,
  CreateCommentThreadDto,
  ConversionJobCallbackDto,
  CreateConversionJobDto,
  CreateDocumentDto,
  CreateSuggestionDto,
  CreateVersionDto,
  DocumentPermissionRoleDto,
  ResolveSuggestionDto,
  RestoreVersionDto,
  SetDocumentPermissionsDto,
  UpdateDocumentDto,
} from "./documents.schema";
import {
  addCommentToThread,
  createAuditLog,
  createCommentThread,
  createConversionJob,
  createDocument,
  createDocumentAsset,
  createDocumentSuggestion,
  createDocumentVersion,
  deleteDocumentAsset,
  findCommentThread,
  findConversionJob,
  findConversionJobById,
  findDocumentAccessForUser,
  findDocumentAsset,
  findDocumentForUser,
  findDocumentStateForUser,
  findDocumentSuggestion,
  findDocumentVersion,
  listCommentThreads,
  listConversionJobs,
  listDocumentAssets,
  listDocumentPermissions,
  listDocumentsByProject,
  listDocumentSuggestions,
  listDocumentVersions,
  replaceDocumentPermissions,
  resolveDocumentSuggestion,
  softDeleteDocument,
  updateConversionJob,
  updateCommentThreadResolution,
  updateDocumentContentState,
  updateDocumentTitle,
} from "./documents.repository";

export async function listProjectDocuments(projectId: string) {
  return listDocumentsByProject(projectId);
}

export async function createProjectDocument(
  projectId: string,
  userId: string,
  dto: CreateDocumentDto
) {
  await ensureProjectMembership(projectId, userId);
  const document = await createDocument(projectId, userId, dto);
  enqueueDocumentSafe(document.id);
  // Notify the other active project members about the new document.
  void prisma.project
    .findUnique({
      where: { id: projectId },
      select: {
        name: true,
        members: { where: { isActive: true }, select: { userId: true } },
      },
    })
    .then((project) => {
      if (!project) return;
      notifySafe({
        type: "DOCUMENT_CREATED",
        recipientIds: project.members.map((m) => m.userId),
        actorId: userId,
        data: {
          projectId,
          projectName: project.name,
          documentId: document.id,
          documentTitle: document.title,
        },
      });
    })
    .catch(() => undefined);
  return document;
}

export async function getDocument(documentId: string, userId: string) {
  const document = await findDocumentForUser(documentId, userId);
  if (!document) {
    throw new AppError("Document not found or access denied", 404);
  }
  const accessRole = await getDocumentAccessRole(documentId, userId);
  return {
    ...document,
    accessRole,
  };
}

export async function getDocumentAccessRole(
  documentId: string,
  userId: string
): Promise<DocumentPermissionRoleDto> {
  const access = await findDocumentAccessForUser(documentId, userId);
  if (!access) {
    throw new AppError("Document not found or access denied", 404);
  }

  const explicitRole = access.permissions[0]?.role;
  if (explicitRole) {
    return explicitRole;
  }

  // Backward compatibility for existing documents created before granular permissions.
  return DocumentPermissionRole.EDITOR;
}

export async function renameDocument(
  documentId: string,
  userId: string,
  dto: UpdateDocumentDto
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.EDITOR);

  const updated = await updateDocumentTitle(documentId, dto);
  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.title.updated",
    details: {
      title: dto.title,
    },
  });

  return updated;
}

export async function deleteDocument(documentId: string, userId: string) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.EDITOR);

  const deleted = await softDeleteDocument(documentId);
  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.deleted",
  });

  // Remove the document's chunks from the knowledge index.
  deleteBySource("DOCUMENT", documentId).catch((err) =>
    console.error(`[copilot] failed to remove chunks for document ${documentId}`, err)
  );

  return deleted;
}

export async function uploadDocumentAsset(
  documentId: string,
  userId: string,
  file: Express.Multer.File
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.EDITOR);

  const s3Key = await storeDocumentAsset(
    documentId,
    file.originalname,
    file.mimetype,
    file.buffer
  );

  const asset = await createDocumentAsset({
    documentId,
    s3Key,
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    uploadedById: userId,
  });

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.asset.uploaded",
    details: { assetId: asset.id, fileName: asset.fileName },
  });

  return asset;
}

export async function listDocumentAssetsForUser(documentId: string, userId: string) {
  await getDocumentAccessRole(documentId, userId);
  return listDocumentAssets(documentId);
}

export async function getDocumentAssetForUser(
  documentId: string,
  userId: string,
  assetId: string
) {
  await getDocumentAccessRole(documentId, userId);
  const asset = await findDocumentAsset(documentId, assetId);
  if (!asset) {
    throw new AppError("Document asset not found", 404);
  }
  return asset;
}

export async function downloadDocumentAsset(
  documentId: string,
  userId: string,
  assetId: string
) {
  const asset = await getDocumentAssetForUser(documentId, userId, assetId);
  const stream = await getDocumentAssetStream(asset.s3Key);
  return { asset, ...stream };
}

export async function removeDocumentAsset(
  documentId: string,
  userId: string,
  assetId: string
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.EDITOR);

  const asset = await getDocumentAssetForUser(documentId, userId, assetId);
  await deleteDocumentAssetObject(asset.s3Key);
  await deleteDocumentAsset(asset.id);

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.asset.deleted",
    details: { assetId: asset.id, fileName: asset.fileName },
  });

  return asset;
}

export async function listPermissionsForDocument(documentId: string, userId: string) {
  await getDocumentAccessRole(documentId, userId);
  return listDocumentPermissions(documentId);
}

export async function updatePermissionsForDocument(
  documentId: string,
  userId: string,
  dto: SetDocumentPermissionsDto
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.EDITOR);

  const document = await getDocument(documentId, userId);

  const uniquePermissions = dedupePermissions(dto.permissions);

  const activeProjectMembers = await prisma.projectMember.findMany({
    where: {
      projectId: document.projectId,
      isActive: true,
    },
    select: {
      userId: true,
    },
  });

  const membersSet = new Set(activeProjectMembers.map((member) => member.userId));

  for (const permission of uniquePermissions) {
    if (!membersSet.has(permission.userId)) {
      throw new AppError("Permission target user must be an active project member", 400);
    }
  }

  if (!uniquePermissions.some((permission) => permission.userId === document.createdById)) {
    uniquePermissions.push({
      userId: document.createdById,
      role: DocumentPermissionRole.EDITOR,
    });
  }

  const permissions = await replaceDocumentPermissions(documentId, uniquePermissions);

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.permissions.replaced",
    details: {
      count: permissions.length,
    },
  });

  return permissions;
}

export async function listCommentThreadsForDocument(
  documentId: string,
  userId: string,
  includeResolved: boolean
) {
  await getDocumentAccessRole(documentId, userId);
  return listCommentThreads(documentId, includeResolved);
}

export async function createCommentThreadForDocument(
  documentId: string,
  userId: string,
  dto: CreateCommentThreadDto
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.COMMENTER);

  const thread = await createCommentThread({
    documentId,
    createdById: userId,
    anchorFrom: dto.anchorFrom,
    anchorTo: dto.anchorTo,
    quoteText: dto.quoteText,
    body: dto.body,
    mentions: dto.mentions,
  });

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.commentThread.created",
    details: { threadId: thread.id },
  });

  return thread;
}

export async function addCommentToDocumentThread(
  documentId: string,
  threadId: string,
  userId: string,
  dto: CreateCommentDto
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.COMMENTER);

  const thread = await findCommentThread(documentId, threadId);
  if (!thread) {
    throw new AppError("Comment thread not found", 404);
  }

  if (thread.isResolved) {
    throw new AppError("Cannot add comments to a resolved thread", 400);
  }

  const comment = await addCommentToThread({
    threadId,
    authorId: userId,
    body: dto.body,
    mentions: dto.mentions,
  });

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.comment.created",
    details: { threadId, commentId: comment.id },
  });

  return comment;
}

export async function resolveCommentThreadForDocument(
  documentId: string,
  threadId: string,
  userId: string,
  resolved: boolean
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.COMMENTER);

  const thread = await findCommentThread(documentId, threadId);
  if (!thread) {
    throw new AppError("Comment thread not found", 404);
  }

  const updated = await updateCommentThreadResolution(threadId, {
    isResolved: resolved,
    userId,
  });

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: resolved
      ? "document.commentThread.resolved"
      : "document.commentThread.reopened",
    details: { threadId },
  });

  return updated;
}

export async function listSuggestionsForDocument(
  documentId: string,
  userId: string,
  status?: DocumentSuggestionStatus
) {
  await getDocumentAccessRole(documentId, userId);
  return listDocumentSuggestions(documentId, status);
}

export async function createSuggestionForDocument(
  documentId: string,
  userId: string,
  dto: CreateSuggestionDto
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.COMMENTER);

  const suggestion = await createDocumentSuggestion({
    documentId,
    createdById: userId,
    type: dto.type,
    anchorFrom: dto.anchorFrom,
    anchorTo: dto.anchorTo,
    note: dto.note,
    payload: (dto.payload ?? undefined) as Prisma.JsonObject | undefined,
  });

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.suggestion.created",
    details: { suggestionId: suggestion.id, type: suggestion.type },
  });

  return suggestion;
}

export async function resolveSuggestionForDocument(
  documentId: string,
  suggestionId: string,
  userId: string,
  dto: ResolveSuggestionDto
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.EDITOR);

  const suggestion = await findDocumentSuggestion(documentId, suggestionId);
  if (!suggestion) {
    throw new AppError("Suggestion not found", 404);
  }

  if (suggestion.status !== DocumentSuggestionStatus.OPEN) {
    throw new AppError("Only open suggestions can be resolved", 400);
  }

  const resolved = await resolveDocumentSuggestion({
    suggestionId,
    status: dto.status,
    resolvedById: userId,
  });

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.suggestion.resolved",
    details: { suggestionId: resolved.id, status: resolved.status },
  });

  return resolved;
}

export async function createVersionForDocument(
  documentId: string,
  userId: string,
  dto: CreateVersionDto
) {
  await getDocumentAccessRole(documentId, userId);

  const docState = await findDocumentStateForUser(documentId, userId);
  if (!docState) {
    throw new AppError("Document not found or access denied", 404);
  }

  const version = await createDocumentVersion({
    documentId,
    createdById: userId,
    source: dto.source,
    contentState: docState.contentState ? Buffer.from(docState.contentState) : null,
    plainText: null,
    metadata: (dto.metadata ?? undefined) as Prisma.JsonObject | undefined,
  });

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.version.created",
    details: { versionId: version.id, source: dto.source },
  });

  // A user explicitly saved a version → reindex the document.
  enqueueDocumentSafe(documentId);

  return version;
}

export async function listVersionsForDocument(
  documentId: string,
  userId: string,
  take: number
) {
  await getDocumentAccessRole(documentId, userId);
  return listDocumentVersions(documentId, take);
}

export async function getVersionDiffForDocument(
  documentId: string,
  userId: string,
  fromVersionId: string,
  toVersionId: string
) {
  await getDocumentAccessRole(documentId, userId);

  const [fromVersion, toVersion] = await Promise.all([
    findDocumentVersion(documentId, fromVersionId),
    findDocumentVersion(documentId, toVersionId),
  ]);

  if (!fromVersion || !toVersion) {
    throw new AppError("One or both versions were not found", 404);
  }

  const fromText = fromVersion.plainText ?? "";
  const toText = toVersion.plainText ?? "";

  return {
    fromVersionId,
    toVersionId,
    summary: {
      fromLength: fromText.length,
      toLength: toText.length,
      deltaLength: toText.length - fromText.length,
    },
    diff: createSimpleTextDiff(fromText, toText),
  };
}

export async function restoreDocumentVersion(
  documentId: string,
  versionId: string,
  userId: string,
  dto: RestoreVersionDto
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.EDITOR);

  const version = await findDocumentVersion(documentId, versionId);
  if (!version) {
    throw new AppError("Version not found", 404);
  }

  if (!version.contentState) {
    throw new AppError("Version cannot be restored because it has no stored state", 400);
  }

  await updateDocumentContentState(documentId, Buffer.from(version.contentState));

  const restoredVersion = await createDocumentVersion({
    documentId,
    createdById: userId,
    source: dto.source,
    contentState: Buffer.from(version.contentState),
    plainText: version.plainText,
    metadata: {
      restoredFromVersionId: version.id,
    },
  });

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.version.restored",
    details: { sourceVersionId: version.id, restoredVersionId: restoredVersion.id },
  });

  enqueueDocumentSafe(documentId);

  return restoredVersion;
}

export async function createConversionJobForDocument(
  documentId: string,
  userId: string,
  dto: CreateConversionJobDto
) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.EDITOR);

  if (dto.type === "IMPORT_DOCX" && !dto.inputAssetId) {
    throw new AppError("inputAssetId is required for IMPORT_DOCX jobs", 400);
  }

  if (dto.type === "EXPORT_DOCX" && !dto.sourceVersionId) {
    throw new AppError("sourceVersionId is required for EXPORT_DOCX jobs", 400);
  }

  let inputAsset: Awaited<ReturnType<typeof findDocumentAsset>> | null = null;
  if (dto.inputAssetId) {
    inputAsset = await findDocumentAsset(documentId, dto.inputAssetId);
    if (!inputAsset) {
      throw new AppError("Input asset not found", 404);
    }
  }

  let sourceVersion: Awaited<ReturnType<typeof findDocumentVersion>> | null = null;
  if (dto.sourceVersionId) {
    sourceVersion = await findDocumentVersion(documentId, dto.sourceVersionId);
    if (!sourceVersion) {
      throw new AppError("Source version not found", 404);
    }
  }

  const job = await createConversionJob({
    documentId,
    createdById: userId,
    type: dto.type,
    inputAssetId: dto.inputAssetId,
    sourceVersionId: dto.sourceVersionId,
    requestedFileName: dto.requestedFileName,
  });

  await createAuditLog({
    documentId,
    actorId: userId,
    eventType: "document.conversion.job.created",
    details: { jobId: job.id, type: job.type },
  });

  let inputFileBase64: string | null = null;
  if (dto.type === "IMPORT_DOCX" && inputAsset) {
    const streamResult = await getDocumentAssetStream(inputAsset.s3Key);
    const binary = await readStreamBuffer(streamResult.stream);
    inputFileBase64 = binary.toString("base64");
  }

  queueDocumentConversion({
    ...job,
    inputFileBase64,
    sourcePlainText: sourceVersion?.plainText ?? null,
    sourceTitle: dto.requestedFileName ?? null,
  });

  return job;
}

export async function listConversionJobsForDocument(documentId: string, userId: string) {
  await getDocumentAccessRole(documentId, userId);
  return listConversionJobs(documentId);
}

export async function getConversionJobForDocument(
  documentId: string,
  jobId: string,
  userId: string
) {
  await getDocumentAccessRole(documentId, userId);

  const job = await findConversionJob(documentId, jobId);
  if (!job) {
    throw new AppError("Conversion job not found", 404);
  }

  return job;
}

async function queueDocumentConversion(job: {
  id: string;
  documentId: string;
  type: "IMPORT_DOCX" | "EXPORT_DOCX";
  inputAssetId?: string | null;
  sourceVersionId?: string | null;
  requestedFileName?: string | null;
  inputFileBase64?: string | null;
  sourcePlainText?: string | null;
  sourceTitle?: string | null;
}) {
  void dispatchDocumentConversionJob({
    id: job.id,
    documentId: job.documentId,
    type: job.type,
    inputAssetId: job.inputAssetId,
    sourceVersionId: job.sourceVersionId,
    requestedFileName: job.requestedFileName,
    inputFileBase64: job.inputFileBase64,
    sourcePlainText: job.sourcePlainText,
    sourceTitle: job.sourceTitle,
  });
}

export async function handleConversionJobCallback(
  jobId: string,
  callbackSecret: string | undefined,
  payload: ConversionJobCallbackDto
) {
  if (callbackSecret !== env.DOCX_CONVERTER_CALLBACK_SECRET) {
    throw new AppError("Invalid conversion callback secret", 401);
  }

  const job = await findConversionJobById(jobId);
  if (!job) {
    throw new AppError("Conversion job not found", 404);
  }

  if (job.documentId !== payload.documentId) {
    throw new AppError("Callback document mismatch", 400);
  }

  let outputAssetId: string | null = null;
  if (payload.result?.outputContentBase64) {
    const outputBuffer = Buffer.from(payload.result.outputContentBase64, "base64");
    const fileName =
      payload.result.outputFileName ??
      `${payload.documentId}-${job.id}.docx`;
    const mimeType =
      payload.result.outputMimeType ??
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const s3Key = await storeDocumentAsset(payload.documentId, fileName, mimeType, outputBuffer);
    const asset = await createDocumentAsset({
      documentId: payload.documentId,
      s3Key,
      fileName,
      mimeType,
      size: outputBuffer.byteLength,
      uploadedById: job.createdById,
    });
    outputAssetId = asset.id;
  }

  let resultVersionId: string | null = null;
  if (typeof payload.result?.plainText === "string") {
    const importedContentState =
      job.type === "IMPORT_DOCX"
        ? createYjsStateFromPlainText(payload.result.plainText)
        : null;

    if (importedContentState) {
      await updateDocumentContentState(payload.documentId, importedContentState);
      await syncPlainTextToCollaborationDocument(
        payload.documentId,
        payload.result.plainText
      );
    }

    const version = await createDocumentVersion({
      documentId: payload.documentId,
      createdById: job.createdById,
      source: "conversion_result",
      contentState: importedContentState,
      plainText: payload.result.plainText,
      metadata: (payload.result.metadata ?? undefined) as Prisma.JsonObject | undefined,
    });
    resultVersionId = version.id;
    // Imported/converted content now has plain text → index it.
    enqueueDocumentSafe(payload.documentId);
  }

  const status = payload.status as DocumentConversionJobStatus;
  const now = new Date();

  const updated = await updateConversionJob(jobId, {
    status,
    providerJobId: payload.providerJobId,
    errorMessage: payload.errorMessage,
    startedAt: payload.startedAt ? new Date(payload.startedAt) : job.startedAt ?? undefined,
    finishedAt:
      payload.finishedAt
        ? new Date(payload.finishedAt)
        : status === DocumentConversionJobStatus.COMPLETED ||
            status === DocumentConversionJobStatus.FAILED ||
            status === DocumentConversionJobStatus.CANCELED
          ? now
          : undefined,
    ...(outputAssetId
      ? {
          outputAsset: {
            connect: { id: outputAssetId },
          },
        }
      : {}),
    ...(resultVersionId
      ? {
          resultVersion: {
            connect: { id: resultVersionId },
          },
        }
      : {}),
  });

  await createAuditLog({
    documentId: payload.documentId,
    actorId: job.createdById,
    eventType: "document.conversion.job.callback",
    details: {
      jobId,
      status,
      outputAssetId,
      resultVersionId,
    },
  });

  return updated;
}

function ensureRoleAtLeast(
  role: DocumentPermissionRole,
  requiredRole: DocumentPermissionRole
) {
  const ranking: Record<DocumentPermissionRole, number> = {
    VIEWER: 1,
    COMMENTER: 2,
    EDITOR: 3,
  };

  if (ranking[role] < ranking[requiredRole]) {
    throw new AppError("Access forbidden", 403);
  }
}

function dedupePermissions(
  permissions: SetDocumentPermissionsDto["permissions"]
): Array<{ userId: string; role: DocumentPermissionRole }> {
  const map = new Map<string, DocumentPermissionRole>();
  for (const permission of permissions) {
    map.set(permission.userId, permission.role as DocumentPermissionRole);
  }
  return Array.from(map.entries()).map(([userId, role]) => ({ userId, role }));
}

function createSimpleTextDiff(fromText: string, toText: string) {
  const fromLines = fromText.split(/\r?\n/);
  const toLines = toText.split(/\r?\n/);
  const max = Math.max(fromLines.length, toLines.length);

  const changes: Array<{
    index: number;
    from?: string;
    to?: string;
    type: "added" | "removed" | "changed";
  }> = [];

  for (let index = 0; index < max; index += 1) {
    const fromLine = fromLines[index];
    const toLine = toLines[index];

    if (fromLine === toLine) {
      continue;
    }

    if (typeof fromLine === "undefined") {
      changes.push({ index, to: toLine, type: "added" });
      continue;
    }

    if (typeof toLine === "undefined") {
      changes.push({ index, from: fromLine, type: "removed" });
      continue;
    }

    changes.push({ index, from: fromLine, to: toLine, type: "changed" });
  }

  return changes;
}

async function ensureProjectMembership(projectId: string, userId: string) {
  const membership = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
  });

  if (!membership || !membership.isActive) {
    throw new AppError("Access forbidden", 403);
  }
}

export async function canUserEditDocument(documentId: string, userId: string) {
  const role = await getDocumentAccessRole(documentId, userId);
  return role === DocumentPermissionRole.EDITOR;
}

export async function markConversionJobCanceled(documentId: string, jobId: string, userId: string) {
  const role = await getDocumentAccessRole(documentId, userId);
  ensureRoleAtLeast(role, DocumentPermissionRole.EDITOR);

  const job = await findConversionJob(documentId, jobId);
  if (!job) {
    throw new AppError("Conversion job not found", 404);
  }

  if (job.status === DocumentConversionJobStatus.COMPLETED) {
    throw new AppError("Completed jobs cannot be canceled", 400);
  }

  return prisma.documentConversionJob.update({
    where: { id: jobId },
    data: {
      status: DocumentConversionJobStatus.CANCELED,
      finishedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      finishedAt: true,
    },
  });
}



