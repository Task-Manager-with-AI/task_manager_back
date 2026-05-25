import { Server } from "@hocuspocus/server";
import { jwtVerify } from "jose";
import { parse as parseCookie } from "cookie";
import * as Y from "yjs";
import { env } from "../config/env";
import { prisma } from "../prisma/client";
import { findDocumentStateForUser, updateDocumentContentState } from "../modules/documents/documents.repository";

type CollaborationContext = {
  userId?: string;
  documentId?: string;
};

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function setupCollaboration() {
  const port = env.COLLABORATION_PORT ?? env.BACKEND_PORT + 1;

  const server = new Server<CollaborationContext>({
    port,
    quiet: true,
    debounce: 1500,
    maxDebounce: 10000,
    async onAuthenticate({ documentName, requestHeaders }) {
      const documentId = parseDocumentId(documentName);
      const userId = await authenticateFromCookies(requestHeaders);
      const document = await findDocumentStateForUser(documentId, userId);

      if (!document) {
        throw new Error("Document not found or access denied");
      }

      return { userId, documentId };
    },
    async onLoadDocument({ context, document }) {
      if (!context.documentId || !context.userId) {
        throw new Error("Authentication required");
      }

      const storedDocument = await findDocumentStateForUser(
        context.documentId,
        context.userId
      );

      if (!storedDocument) {
        throw new Error("Document not found or access denied");
      }

      if (storedDocument.contentState) {
        Y.applyUpdate(document, new Uint8Array(storedDocument.contentState));
      }

      return document;
    },
    async onStoreDocument({ documentName, document }) {
      const documentId = parseDocumentId(documentName);
      const exists = await prisma.document.findFirst({
        where: {
          id: documentId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!exists) return;

      await updateDocumentContentState(
        documentId,
        Buffer.from(Y.encodeStateAsUpdate(document))
      );
    },
  });

  await server.listen(port);
  console.log(`Collaboration server listening on ws://localhost:${port}/collaboration`);

  return server;
}

function parseDocumentId(documentName: string): string {
  const [prefix, documentId] = documentName.split(":");
  if (prefix !== "document" || !documentId) {
    throw new Error("Invalid collaboration room");
  }
  return documentId;
}

async function authenticateFromCookies(
  headers: Headers | Record<string, string | string[] | undefined>
): Promise<string> {
  const cookieHeader = getCookieHeader(headers);
  const cookies = parseCookie(cookieHeader);
  const token = cookies[env.COOKIE_NAME];

  if (!token) {
    throw new Error("Authentication required");
  }

  const { payload } = await jwtVerify(token, secret);
  const userId = payload.id as string | undefined;

  if (!userId) {
    throw new Error("Authentication required");
  }

  return userId;
}

function getCookieHeader(
  headers: Headers | Record<string, string | string[] | undefined>
): string {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get("cookie") ?? "";
  }

  const raw = (headers as Record<string, string | string[] | undefined>)["cookie"];
  if (Array.isArray(raw)) {
    return raw.join("; ");
  }

  return raw ?? "";
}
