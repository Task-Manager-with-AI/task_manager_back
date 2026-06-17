import { Router, type Router as ExpressRouter } from "express";
import multer from "multer";
import { env } from "../../config/env";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { membershipMiddleware } from "../../middlewares/membership.middleware";
import {
  conversionJobCallbackController,
  cancelConversionJobController,
  createCommentController,
  createCommentThreadController,
  createConversionJobController,
  createDocumentController,
  createGeneratedDiagramController,
  createSuggestionController,
  createVersionController,
  deleteDocumentAssetController,
  deleteDocumentController,
  downloadGeneratedDiagramController,
  downloadDocumentAssetController,
  getConversionJobController,
  getDocumentController,
  getVersionDiffController,
  listCommentThreadsController,
  listConversionJobsController,
  listDocumentAssetsController,
  listDocumentGeneratedDiagramsController,
  listDocumentPermissionsController,
  listDocumentsController,
  listProjectGeneratedDiagramsController,
  listSuggestionsController,
  listVersionsController,
  reopenCommentThreadController,
  resolveCommentThreadController,
  resolveSuggestionController,
  restoreVersionController,
  setDocumentPermissionsController,
  updateDocumentController,
  uploadDocumentAssetController,
} from "./documents.controller";

export const documentsRouter: ExpressRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.DOCUMENT_ASSET_MAX_FILE_SIZE_MB * 1024 * 1024 },
});

documentsRouter.get(
  "/projects/:projectId/documents",
  authMiddleware,
  membershipMiddleware,
  listDocumentsController
);

documentsRouter.post(
  "/projects/:projectId/documents",
  authMiddleware,
  membershipMiddleware,
  createDocumentController
);

documentsRouter.get(
  "/projects/:projectId/diagrams",
  authMiddleware,
  membershipMiddleware,
  listProjectGeneratedDiagramsController
);

documentsRouter.post(
  "/projects/:projectId/diagrams",
  authMiddleware,
  membershipMiddleware,
  createGeneratedDiagramController
);

documentsRouter.get(
  "/documents/:documentId",
  authMiddleware,
  getDocumentController
);

documentsRouter.patch(
  "/documents/:documentId",
  authMiddleware,
  updateDocumentController
);

documentsRouter.delete(
  "/documents/:documentId",
  authMiddleware,
  deleteDocumentController
);

documentsRouter.get(
  "/documents/:documentId/diagrams",
  authMiddleware,
  listDocumentGeneratedDiagramsController
);

documentsRouter.post(
  "/documents/:documentId/assets",
  authMiddleware,
  upload.single("file"),
  uploadDocumentAssetController
);

documentsRouter.get(
  "/documents/:documentId/assets",
  authMiddleware,
  listDocumentAssetsController
);

documentsRouter.get(
  "/documents/:documentId/assets/:assetId",
  authMiddleware,
  downloadDocumentAssetController
);

documentsRouter.delete(
  "/documents/:documentId/assets/:assetId",
  authMiddleware,
  deleteDocumentAssetController
);

documentsRouter.get(
  "/documents/:documentId/permissions",
  authMiddleware,
  listDocumentPermissionsController
);

documentsRouter.put(
  "/documents/:documentId/permissions",
  authMiddleware,
  setDocumentPermissionsController
);

documentsRouter.get(
  "/documents/:documentId/comments/threads",
  authMiddleware,
  listCommentThreadsController
);

documentsRouter.post(
  "/documents/:documentId/comments/threads",
  authMiddleware,
  createCommentThreadController
);

documentsRouter.post(
  "/documents/:documentId/comments/threads/:threadId/comments",
  authMiddleware,
  createCommentController
);

documentsRouter.post(
  "/documents/:documentId/comments/threads/:threadId/resolve",
  authMiddleware,
  resolveCommentThreadController
);

documentsRouter.post(
  "/documents/:documentId/comments/threads/:threadId/reopen",
  authMiddleware,
  reopenCommentThreadController
);

documentsRouter.get(
  "/documents/:documentId/suggestions",
  authMiddleware,
  listSuggestionsController
);

documentsRouter.post(
  "/documents/:documentId/suggestions",
  authMiddleware,
  createSuggestionController
);

documentsRouter.post(
  "/documents/:documentId/suggestions/:suggestionId/resolve",
  authMiddleware,
  resolveSuggestionController
);

documentsRouter.get(
  "/documents/:documentId/versions",
  authMiddleware,
  listVersionsController
);

documentsRouter.post(
  "/documents/:documentId/versions",
  authMiddleware,
  createVersionController
);

documentsRouter.get(
  "/documents/:documentId/versions/diff",
  authMiddleware,
  getVersionDiffController
);

documentsRouter.post(
  "/documents/:documentId/versions/:versionId/restore",
  authMiddleware,
  restoreVersionController
);

documentsRouter.get(
  "/documents/:documentId/conversion-jobs",
  authMiddleware,
  listConversionJobsController
);

documentsRouter.post(
  "/documents/:documentId/conversion-jobs",
  authMiddleware,
  createConversionJobController
);

documentsRouter.get(
  "/documents/:documentId/conversion-jobs/:jobId",
  authMiddleware,
  getConversionJobController
);

documentsRouter.post(
  "/documents/:documentId/conversion-jobs/:jobId/cancel",
  authMiddleware,
  cancelConversionJobController
);

documentsRouter.post(
  "/documents/conversion-jobs/:jobId/callback",
  conversionJobCallbackController
);

documentsRouter.get(
  "/diagrams/:diagramId/content",
  authMiddleware,
  downloadGeneratedDiagramController
);



