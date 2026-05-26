import {
  DocumentConversionJobStatus,
  DocumentConversionJobType,
  Prisma,
} from "@prisma/client";
import { env } from "../config/env";
import { updateConversionJob } from "../modules/documents/documents.repository";

type ConversionDispatchPayload = {
  id: string;
  documentId: string;
  type: DocumentConversionJobType;
  inputAssetId?: string | null;
  sourceVersionId?: string | null;
  requestedFileName?: string | null;
  inputFileBase64?: string | null;
  sourcePlainText?: string | null;
  sourceTitle?: string | null;
};

type ConverterJobResponse = {
  providerJobId?: string;
  status?: "queued" | "processing" | "completed" | "failed";
  errorMessage?: string;
};

export async function dispatchDocumentConversionJob(
  job: ConversionDispatchPayload
): Promise<void> {
  if (!env.DOCX_CONVERTER_URL) {
    await updateConversionJob(job.id, {
      status: DocumentConversionJobStatus.FAILED,
      finishedAt: new Date(),
      errorMessage: "DOCX converter service is not configured",
    });
    return;
  }

  await updateConversionJob(job.id, {
    status: DocumentConversionJobStatus.PROCESSING,
    startedAt: new Date(),
  });

  try {
    const callbackBase = env.BACKEND_URL ?? `http://localhost:${env.BACKEND_PORT}`;
    const callbackUrl = `${callbackBase.replace(/\/$/, "")}/api/v1/documents/conversion-jobs/${job.id}/callback`;

    const response = await fetch(`${env.DOCX_CONVERTER_URL}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobId: job.id,
        documentId: job.documentId,
        type: job.type,
        inputAssetId: job.inputAssetId ?? null,
        sourceVersionId: job.sourceVersionId ?? null,
        requestedFileName: job.requestedFileName ?? null,
        inputFileBase64: job.inputFileBase64 ?? null,
        sourcePlainText: job.sourcePlainText ?? null,
        sourceTitle: job.sourceTitle ?? null,
        callbackUrl,
        callbackSecret: env.DOCX_CONVERTER_CALLBACK_SECRET,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as ConverterJobResponse;

    if (!response.ok) {
      await updateConversionJob(job.id, {
        status: DocumentConversionJobStatus.FAILED,
        finishedAt: new Date(),
        errorMessage:
          body.errorMessage ?? `DOCX converter request failed with status ${response.status}`,
      });
      return;
    }

    const data: Prisma.DocumentConversionJobUpdateInput = {
      providerJobId: body.providerJobId,
    };

    if (body.status === "failed") {
      data.status = DocumentConversionJobStatus.FAILED;
      data.finishedAt = new Date();
      data.errorMessage = body.errorMessage ?? "DOCX conversion failed";
    } else if (body.status === "completed") {
      data.status = DocumentConversionJobStatus.COMPLETED;
      data.finishedAt = new Date();
    } else {
      data.status = DocumentConversionJobStatus.PROCESSING;
    }

    await updateConversionJob(job.id, data);
  } catch (error) {
    await updateConversionJob(job.id, {
      status: DocumentConversionJobStatus.FAILED,
      finishedAt: new Date(),
      errorMessage:
        error instanceof Error ? error.message : "DOCX converter request failed",
    });
  }
}

