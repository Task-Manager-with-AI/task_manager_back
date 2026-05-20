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

export interface DetectTypeResult {
  meeting_type: "DAILY" | "SPRINT_PLANNING" | "REGULAR";
  confidence: number;
  reason: string;
}

export interface DailyEntry {
  participant_name: string;
  yesterday: string;
  today: string;
  blockers: string[];
}

export interface AnalyzeDailyResult {
  entries: DailyEntry[];
  overall_blockers: string[];
  sprint_health: "GREEN" | "YELLOW" | "RED";
}

export interface SprintTask {
  title: string;
  description?: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  suggested_responsible_id?: string | null;
  story_points?: number | null;
}

export interface AnalyzeSprintResult {
  sprint_goal: string;
  sprint_duration_weeks?: number | null;
  user_stories: string[];
  tasks: SprintTask[];
}

export interface KanbanUpdate {
  task_id?: string | null;
  task_title: string;
  new_status: "DONE" | "IN_PROGRESS" | "BLOCKED";
  mentioned_by: string;
  confidence: number;
  notes?: string | null;
}

export interface DetectKanbanUpdatesResult {
  updates: KanbanUpdate[];
}

export interface ExistingTaskInput {
  id: string;
  title: string;
  column_title: string;
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

export async function detectMeetingType(input: {
  transcript: string;
  meeting_title: string;
  participants: string[];
  language?: string;
}): Promise<DetectTypeResult> {
  const res = await fetch(`${baseUrl}/api/v1/detect-type`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "es", ...input }),
  });
  return readWrapped<DetectTypeResult>(res, "meeting type detection");
}

export async function analyzeDaily(input: {
  transcript: string;
  participants: string[];
  language?: string;
}): Promise<AnalyzeDailyResult> {
  const res = await fetch(`${baseUrl}/api/v1/analyze-daily`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "es", ...input }),
  });
  return readWrapped<AnalyzeDailyResult>(res, "daily analysis");
}

export async function analyzeSprintPlanning(input: {
  transcript: string;
  meeting_title: string;
  participants: string[];
  project_members: { id: string; name: string }[];
  language?: string;
}): Promise<AnalyzeSprintResult> {
  const res = await fetch(`${baseUrl}/api/v1/analyze-sprint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "es", ...input }),
  });
  return readWrapped<AnalyzeSprintResult>(res, "sprint planning analysis");
}

export async function detectKanbanUpdates(input: {
  transcript: string;
  existing_tasks: ExistingTaskInput[];
  language?: string;
}): Promise<DetectKanbanUpdatesResult> {
  const res = await fetch(`${baseUrl}/api/v1/detect-kanban-updates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "es", ...input }),
  });
  return readWrapped<DetectKanbanUpdatesResult>(res, "kanban updates detection");
}
