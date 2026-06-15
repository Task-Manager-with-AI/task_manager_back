import { Request, Response, NextFunction } from "express";
import { DocumentSuggestionStatus } from "@prisma/client";
import { AppError } from "../../shared/errors/AppError";
import { sendCreated, sendSuccess } from "../../shared/utils/response";
import {
  createCommentSchema,
  createCommentThreadSchema,
  createConversionJobSchema,
  createDocumentSchema,
  createSuggestionSchema,
  createVersionSchema,
  conversionJobCallbackSchema,
  getDiffQuerySchema,
  listCommentThreadsQuerySchema,
  listVersionsQuerySchema,
  resolveSuggestionSchema,
  restoreVersionSchema,
  setDocumentPermissionsSchema,
  updateDocumentSchema,
} from "./documents.schema";
import {
  addCommentToDocumentThread,
  createCommentThreadForDocument,
  createConversionJobForDocument,
  createProjectDocument,
  createSuggestionForDocument,
  createVersionForDocument,
  deleteDocument,
  downloadDocumentAsset,
  getConversionJobForDocument,
  getDocument,
  getVersionDiffForDocument,
  listCommentThreadsForDocument,
  listConversionJobsForDocument,
  listDocumentAssetsForUser,
  listPermissionsForDocument,
  listProjectDocuments,
  listSuggestionsForDocument,
  listVersionsForDocument,
  handleConversionJobCallback,
  markConversionJobCanceled,
  removeDocumentAsset,
  renameDocument,
  resolveCommentThreadForDocument,
  resolveSuggestionForDocument,
  restoreDocumentVersion,
  updatePermissionsForDocument,
  uploadDocumentAsset,
} from "./documents.service";

export async function listDocumentsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const documents = await listProjectDocuments(req.params["projectId"] as string);
    sendSuccess(res, documents);
  } catch (err) {
    next(err);
  }
}

export async function createDocumentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = createDocumentSchema.parse(req.body);
    const document = await createProjectDocument(
      req.params["projectId"] as string,
      req.user!.id,
      dto
    );
    sendCreated(res, document, "Document created");
  } catch (err) {
    next(err);
  }
}

export async function getDocumentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const document = await getDocument(
      req.params["documentId"] as string,
      req.user!.id
    );
    sendSuccess(res, document);
  } catch (err) {
    next(err);
  }
}

export async function updateDocumentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = updateDocumentSchema.parse(req.body);
    const document = await renameDocument(
      req.params["documentId"] as string,
      req.user!.id,
      dto
    );
    sendSuccess(res, document, "Document renamed");
  } catch (err) {
    next(err);
  }
}

export async function deleteDocumentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await deleteDocument(req.params["documentId"] as string, req.user!.id);
    sendSuccess(res, null, "Document deleted");
  } catch (err) {
    next(err);
  }
}

export async function uploadDocumentAssetController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.file) {
      throw new AppError("No asset file provided (field name 'file')", 400);
    }

    const asset = await uploadDocumentAsset(
      req.params["documentId"] as string,
      req.user!.id,
      req.file
    );

    sendCreated(res, asset, "Document asset uploaded");
  } catch (err) {
    next(err);
  }
}

export async function listDocumentAssetsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const assets = await listDocumentAssetsForUser(
      req.params["documentId"] as string,
      req.user!.id
    );
    sendSuccess(res, assets);
  } catch (err) {
    next(err);
  }
}

export async function downloadDocumentAssetController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { asset, stream, contentType, contentLength } =
      await downloadDocumentAsset(
        req.params["documentId"] as string,
        req.user!.id,
        req.params["assetId"] as string
      );

    const safeFileName = asset.fileName.replace(/["\\]/g, "_");

    res.setHeader("Content-Type", contentType ?? "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}"`
    );

    if (typeof contentLength === "number") {
      res.setHeader("Content-Length", contentLength.toString());
    }

    stream.on("error", (err) => next(err));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function deleteDocumentAssetController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await removeDocumentAsset(
      req.params["documentId"] as string,
      req.user!.id,
      req.params["assetId"] as string
    );

    sendSuccess(res, null, "Document asset deleted");
  } catch (err) {
    next(err);
  }
}

export async function listDocumentPermissionsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const permissions = await listPermissionsForDocument(
      req.params["documentId"] as string,
      req.user!.id
    );
    sendSuccess(res, permissions);
  } catch (err) {
    next(err);
  }
}

export async function setDocumentPermissionsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = setDocumentPermissionsSchema.parse(req.body);
    const permissions = await updatePermissionsForDocument(
      req.params["documentId"] as string,
      req.user!.id,
      dto
    );
    sendSuccess(res, permissions, "Document permissions updated");
  } catch (err) {
    next(err);
  }
}

export async function listCommentThreadsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const query = listCommentThreadsQuerySchema.parse(req.query);
    const threads = await listCommentThreadsForDocument(
      req.params["documentId"] as string,
      req.user!.id,
      query.includeResolved ?? false
    );
    sendSuccess(res, threads);
  } catch (err) {
    next(err);
  }
}

export async function createCommentThreadController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = createCommentThreadSchema.parse(req.body);
    const thread = await createCommentThreadForDocument(
      req.params["documentId"] as string,
      req.user!.id,
      dto
    );
    sendCreated(res, thread, "Comment thread created");
  } catch (err) {
    next(err);
  }
}

export async function createCommentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = createCommentSchema.parse(req.body);
    const comment = await addCommentToDocumentThread(
      req.params["documentId"] as string,
      req.params["threadId"] as string,
      req.user!.id,
      dto
    );

    sendCreated(res, comment, "Comment created");
  } catch (err) {
    next(err);
  }
}

export async function resolveCommentThreadController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const thread = await resolveCommentThreadForDocument(
      req.params["documentId"] as string,
      req.params["threadId"] as string,
      req.user!.id,
      true
    );
    sendSuccess(res, thread, "Comment thread resolved");
  } catch (err) {
    next(err);
  }
}

export async function reopenCommentThreadController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const thread = await resolveCommentThreadForDocument(
      req.params["documentId"] as string,
      req.params["threadId"] as string,
      req.user!.id,
      false
    );
    sendSuccess(res, thread, "Comment thread reopened");
  } catch (err) {
    next(err);
  }
}

export async function listSuggestionsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const statusParam = req.query["status"] as string | undefined;
    const status =
      statusParam && ["OPEN", "ACCEPTED", "REJECTED"].includes(statusParam)
        ? (statusParam as DocumentSuggestionStatus)
        : undefined;

    const suggestions = await listSuggestionsForDocument(
      req.params["documentId"] as string,
      req.user!.id,
      status
    );

    sendSuccess(res, suggestions);
  } catch (err) {
    next(err);
  }
}

export async function createSuggestionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = createSuggestionSchema.parse(req.body);
    const suggestion = await createSuggestionForDocument(
      req.params["documentId"] as string,
      req.user!.id,
      dto
    );
    sendCreated(res, suggestion, "Suggestion created");
  } catch (err) {
    next(err);
  }
}

export async function resolveSuggestionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = resolveSuggestionSchema.parse(req.body);
    const suggestion = await resolveSuggestionForDocument(
      req.params["documentId"] as string,
      req.params["suggestionId"] as string,
      req.user!.id,
      dto
    );

    sendSuccess(res, suggestion, "Suggestion resolved");
  } catch (err) {
    next(err);
  }
}

export async function createVersionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = createVersionSchema.parse(req.body ?? {});
    const version = await createVersionForDocument(
      req.params["documentId"] as string,
      req.user!.id,
      dto
    );
    sendCreated(res, version, "Version created");
  } catch (err) {
    next(err);
  }
}

export async function listVersionsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const query = listVersionsQuerySchema.parse(req.query ?? {});
    const versions = await listVersionsForDocument(
      req.params["documentId"] as string,
      req.user!.id,
      query.take
    );
    sendSuccess(res, versions);
  } catch (err) {
    next(err);
  }
}

export async function getVersionDiffController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const query = getDiffQuerySchema.parse(req.query);
    const diff = await getVersionDiffForDocument(
      req.params["documentId"] as string,
      req.user!.id,
      query.fromVersionId,
      query.toVersionId
    );
    sendSuccess(res, diff);
  } catch (err) {
    next(err);
  }
}

export async function restoreVersionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = restoreVersionSchema.parse(req.body ?? {});
    const restored = await restoreDocumentVersion(
      req.params["documentId"] as string,
      req.params["versionId"] as string,
      req.user!.id,
      dto
    );
    sendSuccess(res, restored, "Version restored");
  } catch (err) {
    next(err);
  }
}

export async function createConversionJobController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = createConversionJobSchema.parse(req.body);
    const job = await createConversionJobForDocument(
      req.params["documentId"] as string,
      req.user!.id,
      dto
    );
    sendCreated(res, job, "Conversion job created");
  } catch (err) {
    next(err);
  }
}

export async function listConversionJobsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const jobs = await listConversionJobsForDocument(
      req.params["documentId"] as string,
      req.user!.id
    );
    sendSuccess(res, jobs);
  } catch (err) {
    next(err);
  }
}

export async function getConversionJobController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const job = await getConversionJobForDocument(
      req.params["documentId"] as string,
      req.params["jobId"] as string,
      req.user!.id
    );
    sendSuccess(res, job);
  } catch (err) {
    next(err);
  }
}

export async function cancelConversionJobController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const canceled = await markConversionJobCanceled(
      req.params["documentId"] as string,
      req.params["jobId"] as string,
      req.user!.id
    );

    sendSuccess(res, canceled, "Conversion job canceled");
  } catch (err) {
    next(err);
  }
}

export async function conversionJobCallbackController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const payload = conversionJobCallbackSchema.parse(req.body);
    const callbackSecret = req.header("x-docx-callback-secret");
    const job = await handleConversionJobCallback(
      req.params["jobId"] as string,
      callbackSecret,
      payload
    );
    sendSuccess(res, job, "Conversion callback processed");
  } catch (err) {
    next(err);
  }
}

