import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  COOKIE_NAME: z.string().default("access_token"),
  BACKEND_PORT: z.coerce.number().default(4000),
  COLLABORATION_PORT: z.coerce.number().optional(),
  BACKEND_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL"),
  AI_BACKEND_URL: z.string().url().default("http://localhost:8000"),
  /** Max wait for AI HTTP responses (ms). Transcription on CPU can take several minutes. */
  AI_FETCH_TIMEOUT_MS: z.coerce.number().default(900_000),
  AUDIO_UPLOAD_DIR: z.string().default("./public/uploads/audio"),
  CHAT_UPLOAD_DIR: z.string().default("./public/uploads/chat"),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_AUDIO_PREFIX: z.string().default("meetings/audio"),
  AWS_S3_CHAT_PREFIX: z.string().default("chat/attachments"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  DOCUMENT_ASSET_STORAGE_MODE: z.enum(["auto", "s3", "local"]).default("auto"),
  DOCUMENT_ASSET_LOCAL_DIR: z.string().default("./public/uploads/documents"),
  DOCX_CONVERTER_URL: z.string().url().optional(),
  DOCX_CONVERTER_CALLBACK_SECRET: z.string().default("local-docx-callback-secret"),
  DOCUMENT_ASSET_MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).default(200),
  DOCS_VERSION_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
  DOCS_SNAPSHOT_INTERVAL_MS: z.coerce.number().int().min(30_000).default(300_000),
  // ── RAG Copilot (Sprint 3) ──────────────────────────────────────────────
  /** Embedding vector dimension — MUST match the AI backend EMBEDDING_DIM and the pgvector column. */
  EMBEDDING_DIM: z.coerce.number().int().min(1).default(1536),
  /** Default number of chunks retrieved per semantic search. */
  RAG_TOP_K: z.coerce.number().int().min(1).default(8),
  /** Max iterations of the agent tool-calling loop (safety cap). */
  COPILOT_MAX_TOOL_ITERATIONS: z.coerce.number().int().min(1).default(6),
  /** Enable the background indexing worker on server start. */
  COPILOT_INDEXING_WORKER_ENABLED: z.coerce.boolean().default(true),
  /** Polling interval (ms) of the indexing worker. */
  COPILOT_INDEXING_POLL_MS: z.coerce.number().int().min(1000).default(5000),
  // ── Notifications (Sprint 3) ────────────────────────────────────────────
  /** VAPID keys for Web Push. If unset, push is disabled (in-app still works). */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:fsociety.soporte@gmail.com"),
  /** Minutes before a scheduled meeting to send a reminder. */
  NOTIF_MEETING_REMINDER_MIN: z.coerce.number().int().min(1).default(15),
  /** Enable the background jobs (meeting reminders + task deadlines). */
  NOTIF_JOBS_ENABLED: z.coerce.boolean().default(true),
  /** Max Prisma pool size — keep low when using Supabase pooler (default 15). */
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(50).default(5),
  // ── Email (vía API HTTP de Resend; SMTP ya no se usa) ──────────────────────
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("Task Manager <onboarding@resend.dev>"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  // ── Google OAuth ────────────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
