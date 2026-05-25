import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import crypto from "crypto";
import path from "path";
import { Readable } from "stream";
import { env } from "../config/env";
import { AppError } from "../shared/errors/AppError";

const s3Bucket = env.AWS_S3_BUCKET?.trim();
const s3Region = env.AWS_REGION?.trim();
const s3Client =
  s3Bucket && s3Region ? new S3Client({ region: s3Region }) : null;

export async function storeDocumentAsset(
  documentId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<string> {
  if (!s3Client || !s3Bucket) {
    throw new AppError(
      "S3 storage is not configured for document assets",
      503
    );
  }

  const safeFileName = sanitizeFileName(fileName);
  const suffix = crypto.randomBytes(6).toString("hex");
  const key = `documents/assets/${documentId}/${suffix}-${safeFileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return key;
}

export async function getDocumentAssetStream(s3Key: string): Promise<{
  stream: Readable;
  contentType?: string;
  contentLength?: number;
}> {
  if (!s3Client || !s3Bucket) {
    throw new AppError(
      "S3 storage is not configured for document assets",
      503
    );
  }

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
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
}

export async function deleteDocumentAssetObject(s3Key: string): Promise<void> {
  if (!s3Client || !s3Bucket) {
    throw new AppError(
      "S3 storage is not configured for document assets",
      503
    );
  }

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
    })
  );
}

function sanitizeFileName(fileName: string): string {
  const parsed = path.parse(fileName);
  const name = parsed.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  const ext = parsed.ext.replace(/[^a-z0-9.]+/gi, "");
  return `${name || "asset"}${ext}`;
}
