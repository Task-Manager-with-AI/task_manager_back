import { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/errors/AppError";
import { sendCreated, sendSuccess } from "../../shared/utils/response";
import {
  createDocumentSchema,
  updateDocumentSchema,
} from "./documents.schema";
import {
  createProjectDocument,
  deleteDocument,
  downloadDocumentAsset,
  getDocument,
  listDocumentAssetsForUser,
  listProjectDocuments,
  renameDocument,
  removeDocumentAsset,
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
