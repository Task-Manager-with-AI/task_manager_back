import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { env } from "../config/env";

const uploadDir = path.resolve(env.AUDIO_UPLOAD_DIR);
const s3Bucket = env.AWS_S3_BUCKET?.trim();
const s3Region = env.AWS_REGION?.trim();
const s3Prefix = normalizePrefix(env.AWS_S3_AUDIO_PREFIX);
const s3Client =
  s3Bucket && s3Region ? new S3Client({ region: s3Region }) : null;

export async function storeAudio(
  meetingId: string,
  buffer: Buffer,
  extension: string,
  contentType?: string
): Promise<string> {
  const suffix = crypto.randomBytes(6).toString("hex");
  const safeExt = extension.replace(/[^a-z0-9]/gi, "") || "webm";
  const fileName = `${meetingId}-${suffix}.${safeExt}`;

  if (s3Client && s3Bucket) {
    const key = [s3Prefix, fileName].filter(Boolean).join("/");
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

  await mkdir(uploadDir, { recursive: true });
  const fullPath = path.join(uploadDir, fileName);
  await writeFile(fullPath, buffer);
  return `/uploads/audio/${fileName}`;
}

export async function readAudio(audioUrl: string): Promise<Buffer> {
  if (audioUrl.startsWith("s3://")) {
    const { bucket, key } = parseS3Url(audioUrl);
    const response = await s3ClientForRead(bucket).send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    return bodyToBuffer(response.Body);
  }

  const fileName = path.basename(audioUrl);
  return readFile(path.join(uploadDir, fileName));
}

export function inferExtensionFromMime(mimeType: string): string {
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
  return "webm";
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

function parseS3Url(audioUrl: string): { bucket: string; key: string } {
  const parsed = new URL(audioUrl);
  const key = parsed.pathname.replace(/^\/+/, "");
  if (!parsed.hostname || !key) {
    throw new Error(`Invalid S3 audio URL: ${audioUrl}`);
  }
  return { bucket: parsed.hostname, key };
}

function s3ClientForRead(bucket: string): S3Client {
  if (!s3Client) {
    throw new Error(
      `Audio is stored in S3 bucket ${bucket}, but AWS_REGION/AWS_S3_BUCKET are not configured`
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
