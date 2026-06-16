/**
 * Thin wrapper over the generalized file-storage service, kept so the
 * meetings module keeps its existing `storeAudio` / `readAudio` API.
 */
import {
  storeFile,
  readFile,
  inferExtensionFromMime as inferExt,
} from "./file-storage.service";

export async function storeAudio(
  meetingId: string,
  buffer: Buffer,
  extension: string,
  contentType?: string
): Promise<string> {
  return storeFile("meetings/audio", meetingId, buffer, extension, contentType);
}

export async function readAudio(audioUrl: string): Promise<Buffer> {
  return readFile(audioUrl);
}

export function inferExtensionFromMime(mimeType: string): string {
  return inferExt(mimeType);
}
