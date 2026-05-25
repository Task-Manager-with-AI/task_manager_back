import { Router, type Router as ExpressRouter } from "express";
import multer from "multer";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { membershipMiddleware } from "../../middlewares/membership.middleware";
import {
  createDocumentController,
  deleteDocumentAssetController,
  deleteDocumentController,
  downloadDocumentAssetController,
  getDocumentController,
  listDocumentAssetsController,
  listDocumentsController,
  updateDocumentController,
  uploadDocumentAssetController,
} from "./documents.controller";

export const documentsRouter: ExpressRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
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
