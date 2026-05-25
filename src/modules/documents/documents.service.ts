import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import {
  deleteDocumentAssetObject,
  getDocumentAssetStream,
  storeDocumentAsset,
} from "../../services/document-asset-storage.service";
import type { CreateDocumentDto, UpdateDocumentDto } from "./documents.schema";
import {
  createDocument,
  createDocumentAsset,
  deleteDocumentAsset,
  findDocumentForUser,
  findDocumentAsset,
  listDocumentsByProject,
  listDocumentAssets,
  softDeleteDocument,
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
  return createDocument(projectId, userId, dto);
}

export async function getDocument(documentId: string, userId: string) {
  const document = await findDocumentForUser(documentId, userId);
  if (!document) {
    throw new AppError("Document not found or access denied", 404);
  }
  return document;
}

export async function renameDocument(
  documentId: string,
  userId: string,
  dto: UpdateDocumentDto
) {
  await getDocument(documentId, userId);
  return updateDocumentTitle(documentId, dto);
}

export async function deleteDocument(documentId: string, userId: string) {
  await getDocument(documentId, userId);
  return softDeleteDocument(documentId);
}

export async function uploadDocumentAsset(
  documentId: string,
  userId: string,
  file: Express.Multer.File
) {
  await getDocument(documentId, userId);

  const s3Key = await storeDocumentAsset(
    documentId,
    file.originalname,
    file.mimetype,
    file.buffer
  );

  return createDocumentAsset({
    documentId,
    s3Key,
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    uploadedById: userId,
  });
}

export async function listDocumentAssetsForUser(documentId: string, userId: string) {
  await getDocument(documentId, userId);
  return listDocumentAssets(documentId);
}

export async function getDocumentAssetForUser(
  documentId: string,
  userId: string,
  assetId: string
) {
  await getDocument(documentId, userId);
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
  const asset = await getDocumentAssetForUser(documentId, userId, assetId);
  await deleteDocumentAssetObject(asset.s3Key);
  await deleteDocumentAsset(asset.id);
  return asset;
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
