import { Agent, setGlobalDispatcher } from "undici";
import { env } from "../config/env";
import { AppError } from "../shared/errors/AppError";

let dispatcherConfigured = false;

function ensureLongTimeoutDispatcher(): void {
  if (dispatcherConfigured) return;
  setGlobalDispatcher(
    new Agent({
      connectTimeout: 60_000,
      headersTimeout: env.AI_FETCH_TIMEOUT_MS,
      bodyTimeout: env.AI_FETCH_TIMEOUT_MS,
    })
  );
  dispatcherConfigured = true;
}

export async function aiFetch(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  ensureLongTimeoutDispatcher();
  try {
    return await fetch(url, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause =
      err instanceof Error && err.cause instanceof Error
        ? err.cause.message
        : undefined;
    const hint =
      label === "transcription"
        ? " La transcripción de audios largos en CPU puede tardar varios minutos."
        : "";
    throw new AppError(
      `AI service unreachable during ${label}: ${message}${
        cause ? ` (${cause})` : ""
      }.${hint} Revisa AI_BACKEND_URL y AI_FETCH_TIMEOUT_MS.`,
      502
    );
  }
}
