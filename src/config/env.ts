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
