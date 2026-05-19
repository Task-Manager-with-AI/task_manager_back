import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { env } from "../config/env";

const uploadDir = path.resolve(env.AUDIO_UPLOAD_DIR);

export async function storeAudio(
  meetingId: string,
  buffer: Buffer,
  extension: string
): Promise<string> {
  await mkdir(uploadDir, { recursive: true });
  const suffix = crypto.randomBytes(6).toString("hex");
  const safeExt = extension.replace(/[^a-z0-9]/gi, "") || "webm";
  const fileName = `${meetingId}-${suffix}.${safeExt}`;
  const fullPath = path.join(uploadDir, fileName);
  await writeFile(fullPath, buffer);
  return `/uploads/audio/${fileName}`;
}

export async function readAudio(audioUrl: string): Promise<Buffer> {
  const fileName = path.basename(audioUrl);
  return readFile(path.join(uploadDir, fileName));
}

export function inferExtensionFromMime(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  return "webm";
}
