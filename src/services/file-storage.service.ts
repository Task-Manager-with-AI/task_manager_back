import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, writeFile, readFile as fsReadFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { env } from "../config/env";

/**
 * Hybrid file storage shared by meeting audio and chat attachments.
 * If AWS_S3_BUCKET + AWS_REGION are configured, files go to S3 and the
 * returned URL is `s3://bucket/key`. Otherwise they are written to a local
 * upload directory and the returned URL is the public path served by
 * `express.static` in development (e.g. `/uploads/chat/<file>`).
 *
 * The raw storage URL never leaves the backend for chat attachments — it is
 * served back through an authenticated proxy endpoint (see chats.routes).
 */

export type StorageCategory = "meetings/audio" | "chat/attachments";

interface CategoryConfig {
  uploadDir: string; // absolute path
  s3Prefix: string; // normalized (no leading/trailing slash)
  publicPathPrefix: string; // e.g. "/uploads/audio"
}

const categories: Record<StorageCategory, CategoryConfig> = {
  "meetings/audio": {
    uploadDir: path.resolve(env.AUDIO_UPLOAD_DIR),
    s3Prefix: normalizePrefix(env.AWS_S3_AUDIO_PREFIX),
    publicPathPrefix: "/uploads/audio",
  },
  "chat/attachments": {
    uploadDir: path.resolve(env.CHAT_UPLOAD_DIR),
    s3Prefix: normalizePrefix(env.AWS_S3_CHAT_PREFIX),
    publicPathPrefix: "/uploads/chat",
  },
};

const s3Bucket = env.AWS_S3_BUCKET?.trim();
const s3Region = env.AWS_REGION?.trim();
const s3Client =
  s3Bucket && s3Region ? new S3Client({ region: s3Region }) : null;

export async function storeFile(
  category: StorageCategory,
  id: string,
  buffer: Buffer,
  extension: string,
  contentType?: string
): Promise<string> {
  const config = categories[category];
  const suffix = crypto.randomBytes(6).toString("hex");
  const safeExt = extension.replace(/[^a-z0-9]/gi, "") || "bin";
  const fileName = `${id}-${suffix}.${safeExt}`;

  if (s3Client && s3Bucket) {
    const key = [config.s3Prefix, fileName].filter(Boolean).join("/");
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return `s3://${s3Bucket}/${key}`;
  }

  await mkdir(config.uploadDir, { recursive: true });
  const fullPath = path.join(config.uploadDir, fileName);
  await writeFile(fullPath, buffer);
  return `${config.publicPathPrefix}/${fileName}`;
}

export async function readFile(fileUrl: string): Promise<Buffer> {
  if (fileUrl.startsWith("s3://")) {
    const { bucket, key } = parseS3Url(fileUrl);
    const response = await s3ClientForRead(bucket).send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    return bodyToBuffer(response.Body);
  }

  const config = resolveLocalCategory(fileUrl);
  const fileName = path.basename(fileUrl);
  return fsReadFile(path.join(config.uploadDir, fileName));
}

function resolveLocalCategory(fileUrl: string): CategoryConfig {
  const match = Object.values(categories).find((c) =>
    fileUrl.startsWith(c.publicPathPrefix)
  );
  // Fall back to audio for legacy URLs without a recognized prefix.
  return match ?? categories["meetings/audio"];
}

export function inferExtensionFromMime(mimeType: string): string {
  // Audio / video
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("m4a") || mimeType.includes("x-m4a")) return "m4a";
  if (mimeType.includes("wav") || mimeType.includes("x-wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("flac") || mimeType.includes("x-flac")) return "flac";
  if (mimeType.includes("aac") || mimeType.includes("x-aac")) return "aac";
  if (mimeType.includes("quicktime") || mimeType.includes("mov")) return "mov";
  if (mimeType.includes("x-msvideo") || mimeType.includes("avi")) return "avi";
  if (mimeType.includes("x-matroska") || mimeType.includes("mkv")) return "mkv";
  // Images / documents (chat attachments)
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("svg")) return "svg";
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("wordprocessingml")) return "docx";
  if (mimeType.includes("msword")) return "doc";
  if (mimeType.includes("plain")) return "txt";
  return "bin";
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

function parseS3Url(fileUrl: string): { bucket: string; key: string } {
  const parsed = new URL(fileUrl);
  const key = parsed.pathname.replace(/^\/+/, "");
  if (!parsed.hostname || !key) {
    throw new Error(`Invalid S3 URL: ${fileUrl}`);
  }
  return { bucket: parsed.hostname, key };
}

function s3ClientForRead(bucket: string): S3Client {
  if (!s3Client) {
    throw new Error(
      `File is stored in S3 bucket ${bucket}, but AWS_REGION/AWS_S3_BUCKET are not configured`
    );
  }
  return s3Client;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error("S3 object body is empty");
  }

  const bodyWithTransform = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };

  if (typeof bodyWithTransform.transformToByteArray === "function") {
    return Buffer.from(await bodyWithTransform.transformToByteArray());
  }

  if (typeof bodyWithTransform.arrayBuffer === "function") {
    return Buffer.from(await bodyWithTransform.arrayBuffer());
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported S3 object body type");
}
