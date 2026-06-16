import { z } from "zod";

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(180),
});

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(180),
});

export const documentPermissionRoleSchema = z.enum([
  "VIEWER",
  "COMMENTER",
  "EDITOR",
]);

export const setDocumentPermissionsSchema = z.object({
  permissions: z
    .array(
      z.object({
        userId: z.string().uuid(),
        role: documentPermissionRoleSchema,
      })
    )
    .min(1),
});

export const createCommentThreadSchema = z.object({
  anchorFrom: z.coerce.number().int().nonnegative().optional(),
  anchorTo: z.coerce.number().int().nonnegative().optional(),
  quoteText: z.string().trim().max(600).optional(),
  body: z.string().trim().min(1, "Comment body is required").max(4000),
  mentions: z.array(z.string().uuid()).default([]),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment body is required").max(4000),
  mentions: z.array(z.string().uuid()).default([]),
});

export const listCommentThreadsQuerySchema = z.object({
  includeResolved: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const createSuggestionSchema = z.object({
  type: z.enum(["INSERT", "DELETE", "FORMAT", "REPLACE"]),
  anchorFrom: z.coerce.number().int().nonnegative().optional(),
  anchorTo: z.coerce.number().int().nonnegative().optional(),
  note: z.string().trim().max(2000).optional(),
  payload: z.record(z.any()).optional(),
});

export const resolveSuggestionSchema = z.object({
  status: z.enum(["ACCEPTED", "REJECTED"]),
});

export const createVersionSchema = z.object({
  source: z.string().trim().min(1).max(100).default("snapshot"),
  metadata: z.record(z.any()).optional(),
});

export const listVersionsQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(20),
});

export const getDiffQuerySchema = z.object({
  fromVersionId: z.string().uuid(),
  toVersionId: z.string().uuid(),
});

export const restoreVersionSchema = z.object({
  source: z.string().trim().min(1).max(100).default("restore"),
});

export const createConversionJobSchema = z.object({
  type: z.enum(["IMPORT_DOCX", "EXPORT_DOCX"]),
  inputAssetId: z.string().uuid().optional(),
  sourceVersionId: z.string().uuid().optional(),
  requestedFileName: z.string().trim().max(255).optional(),
});

export const diagramTypeSchema = z.enum(["class", "use_case", "sequence", "activity", "component", "deployment"]);

export const createGeneratedDiagramSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(10000),
  diagram_type: diagramTypeSchema,
  documentId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(180).optional(),
});

export const conversionJobCallbackSchema = z.object({
  documentId: z.string().uuid(),
  status: z.enum(["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELED"]),
  providerJobId: z.string().trim().max(255).nullish(),
  errorMessage: z.string().trim().max(5000).nullish(),
  startedAt: z.string().datetime().nullish(),
  finishedAt: z.string().datetime().nullish(),
  result: z
    .object({
      plainText: z.string().nullish(),
      outputFileName: z.string().trim().max(255).nullish(),
      outputMimeType: z.string().trim().max(255).nullish(),
      outputContentBase64: z.string().nullish(),
      metadata: z.record(z.any()).nullish(),
    })
    .nullish(),
});

export type CreateDocumentDto = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentDto = z.infer<typeof updateDocumentSchema>;
export type DocumentPermissionRoleDto = z.infer<typeof documentPermissionRoleSchema>;
export type SetDocumentPermissionsDto = z.infer<typeof setDocumentPermissionsSchema>;
export type CreateCommentThreadDto = z.infer<typeof createCommentThreadSchema>;
export type CreateCommentDto = z.infer<typeof createCommentSchema>;
export type ListCommentThreadsQueryDto = z.infer<typeof listCommentThreadsQuerySchema>;
export type CreateSuggestionDto = z.infer<typeof createSuggestionSchema>;
export type ResolveSuggestionDto = z.infer<typeof resolveSuggestionSchema>;
export type CreateVersionDto = z.infer<typeof createVersionSchema>;
export type ListVersionsQueryDto = z.infer<typeof listVersionsQuerySchema>;
export type GetDiffQueryDto = z.infer<typeof getDiffQuerySchema>;
export type RestoreVersionDto = z.infer<typeof restoreVersionSchema>;
export type CreateConversionJobDto = z.infer<typeof createConversionJobSchema>;
export type CreateGeneratedDiagramDto = z.infer<typeof createGeneratedDiagramSchema>;
export type DiagramTypeDto = z.infer<typeof diagramTypeSchema>;
export type ConversionJobCallbackDto = z.infer<typeof conversionJobCallbackSchema>;
