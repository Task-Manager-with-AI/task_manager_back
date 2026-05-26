import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import crypto from "crypto";
import { createReadStream } from "fs";
import { mkdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { env } from "../config/env";
import { AppError } from "../shared/errors/AppError";

const s3Bucket = env.AWS_S3_BUCKET?.trim();
const s3Region = env.AWS_REGION?.trim();
const s3Client =
  s3Bucket && s3Region ? new S3Client({ region: s3Region }) : null;

const localBaseDir = path.resolve(env.DOCUMENT_ASSET_LOCAL_DIR);

export async function storeDocumentAsset(
  documentId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<string> {
  const safeFileName = sanitizeFileName(fileName);
  const suffix = crypto.randomBytes(6).toString("hex");
  const relativeKey = `documents/assets/${documentId}/${suffix}-${safeFileName}`;

  if (shouldUseS3ForWrite()) {
    try {
      await storeInS3(relativeKey, mimeType, buffer);
      return relativeKey;
    } catch (error) {
      if (env.DOCUMENT_ASSET_STORAGE_MODE === "auto" && isS3AccessDenied(error)) {
        return storeInLocal(relativeKey, buffer);
      }
      throw mapS3Error(error);
    }
  }

  return storeInLocal(relativeKey, buffer);
}

export async function getDocumentAssetStream(assetKey: string): Promise<{
  stream: Readable;
  contentType?: string;
  contentLength?: number;
}> {
  if (isLocalKey(assetKey)) {
    return getLocalAssetStream(assetKey);
  }

  if (!s3Client || !s3Bucket) {
    throw new AppError(
      "S3 storage is not configured for document assets",
      503
    );
  }

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: s3Bucket,
        Key: assetKey,
      })
    );

    const body = response.Body;

    if (!body || typeof (body as Readable).pipe !== "function") {
      throw new AppError("Asset content not available", 500);
    }

    return {
      stream: body as Readable,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  } catch (error) {
    throw mapS3Error(error);
  }
}

export async function deleteDocumentAssetObject(assetKey: string): Promise<void> {
  if (isLocalKey(assetKey)) {
    await deleteLocalAsset(assetKey);
    return;
  }

  if (!s3Client || !s3Bucket) {
    throw new AppError(
      "S3 storage is not configured for document assets",
      503
    );
  }

  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: s3Bucket,
        Key: assetKey,
      })
    );
  } catch (error) {
    throw mapS3Error(error);
  }
}

function shouldUseS3ForWrite() {
  if (env.DOCUMENT_ASSET_STORAGE_MODE === "local") {
    return false;
  }

  if (env.DOCUMENT_ASSET_STORAGE_MODE === "s3") {
    if (!s3Client || !s3Bucket) {
      throw new AppError(
        "DOCUMENT_ASSET_STORAGE_MODE is 's3' but AWS_S3_BUCKET/AWS_REGION is not configured",
        503
      );
    }
    return true;
  }

  return Boolean(s3Client && s3Bucket);
}

async function storeInS3(key: string, mimeType: string, buffer: Buffer) {
  if (!s3Client || !s3Bucket) {
    throw new AppError("S3 storage is not configured for document assets", 503);
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );
}

async function storeInLocal(relativeKey: string, buffer: Buffer): Promise<string> {
  const localKey = `local://${relativeKey}`;
  const fullPath = localKeyToPath(localKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return localKey;
}

async function getLocalAssetStream(localKey: string): Promise<{
  stream: Readable;
  contentType?: string;
  contentLength?: number;
}> {
  const fullPath = localKeyToPath(localKey);
  const info = await stat(fullPath);
  return {
    stream: createReadStream(fullPath),
    contentLength: info.size,
  };
}

async function deleteLocalAsset(localKey: string): Promise<void> {
  const fullPath = localKeyToPath(localKey);
  try {
    await unlink(fullPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function isLocalKey(assetKey: string) {
  return assetKey.startsWith("local://");
}

function localKeyToPath(localKey: string): string {
  if (!isLocalKey(localKey)) {
    throw new AppError("Invalid local asset key", 500);
  }

  const relative = localKey.slice("local://".length).replace(/\\/g, "/");
  const normalized = path.normalize(relative);

  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new AppError("Invalid local asset key", 500);
  }

  return path.join(localBaseDir, normalized);
}

function mapS3Error(error: unknown): AppError {
  if (isS3AccessDenied(error)) {
    return new AppError(
      "S3 access denied for document assets. Check IAM permissions for s3:PutObject/GetObject/DeleteObject on your bucket path.",
      403
    );
  }

  if (error instanceof AppError) {
    return error;
  }

  return new AppError(
    error instanceof Error ? error.message : "S3 storage request failed",
    500
  );
}

function isS3AccessDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { Code?: string; name?: string };
  return maybe.Code === "AccessDenied" || maybe.name === "AccessDenied";
}

function sanitizeFileName(fileName: string): string {
  const parsed = path.parse(fileName);
  const name = parsed.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  const ext = parsed.ext.replace(/[^a-z0-9.]+/gi, "");
  return `${name || "asset"}${ext}`;
}
