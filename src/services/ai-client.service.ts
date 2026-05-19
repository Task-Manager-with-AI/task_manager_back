import { env } from "../config/env";
import { AppError } from "../shared/errors/AppError";

const baseUrl = env.AI_BACKEND_URL.replace(/\/$/, "");

interface AiAgreement {
  order: number;
  text: string;
}

interface AiSuggestion {
  title: string;
  description?: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  suggested_responsible_id?: string | null;
}

export interface TranscribeResult {
  transcript: string;
  language: string;
  duration_seconds: number;
}

export interface MinutesResult {
  summary: string;
  key_points: string[];
  agreements: AiAgreement[];
}

export interface SuggestionsResult {
  suggestions: AiSuggestion[];
}

async function readWrapped<T>(res: Response, label: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: T;
  };
  if (!res.ok || body.success === false) {
    throw new AppError(
      `AI service error during ${label}: ${body.message ?? res.statusText}`,
      502
    );
  }
  if (!body.data) {
    throw new AppError(`AI service returned empty payload for ${label}`, 502);
  }
  return body.data;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string,
  mimeType: string,
  language = "es"
): Promise<TranscribeResult> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  form.append("audio_file", blob, fileName);
  form.append("language", language);

  const res = await fetch(`${baseUrl}/api/v1/transcribe`, {
    method: "POST",
    body: form,
  });
  return readWrapped<TranscribeResult>(res, "transcription");
}

export async function generateMinutes(input: {
  transcript: string;
  meeting_title: string;
  participants: string[];
  language?: string;
}): Promise<MinutesResult> {
  const res = await fetch(`${baseUrl}/api/v1/minutes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "es", ...input }),
  });
  return readWrapped<MinutesResult>(res, "minutes generation");
}

export async function extractSuggestions(input: {
  agreements: string[];
  project_members: { id: string; name: string }[];
  language?: string;
}): Promise<SuggestionsResult> {
  const res = await fetch(`${baseUrl}/api/v1/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "es", ...input }),
  });
  return readWrapped<SuggestionsResult>(res, "task suggestions");
}
