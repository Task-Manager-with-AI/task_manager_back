import { DocumentPermissionRole } from "@prisma/client";
import { Server } from "@hocuspocus/server";
import { jwtVerify } from "jose";
import { parse as parseCookie } from "cookie";
import * as Y from "yjs";
import { env } from "../config/env";
import { prisma } from "../prisma/client";
import { registerCollaborationServer } from "./collaboration.runtime";
import {
  createDocumentVersion,
  findDocumentStateForUser,
  pruneDocumentVersionsOlderThan,
  updateDocumentContentState,
} from "../modules/documents/documents.repository";
import { getDocumentAccessRole } from "../modules/documents/documents.service";

type CollaborationContext = {
  userId?: string;
  documentId?: string;
  role?: DocumentPermissionRole;
};

const secret = new TextEncoder().encode(env.JWT_SECRET);
const lastSnapshotAt = new Map<string, number>();

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
      const role = await getDocumentAccessRole(documentId, userId);

      if (!document) {
        throw new Error("Document not found or access denied");
      }

      return { userId, documentId, role };
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
    async onChange({ context, transactionOrigin }) {
      const source = (transactionOrigin as { source?: string } | undefined)?.source;
      if (source && source !== "connection") {
        return;
      }

      if (!context.role || context.role !== DocumentPermissionRole.EDITOR) {
        throw new Error("Editing is not allowed for your document role");
      }
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

      const encodedState = Buffer.from(Y.encodeStateAsUpdate(document));

      await updateDocumentContentState(documentId, encodedState);

      const now = Date.now();
      const last = lastSnapshotAt.get(documentId) ?? 0;

      if (now - last >= env.DOCS_SNAPSHOT_INTERVAL_MS) {
        await createDocumentVersion({
          documentId,
          source: "realtime_snapshot",
          contentState: encodedState,
          plainText: null,
        });

        await pruneDocumentVersionsOlderThan(
          documentId,
          new Date(now - env.DOCS_VERSION_RETENTION_DAYS * 24 * 60 * 60 * 1000)
        );

        lastSnapshotAt.set(documentId, now);
      }
    },
  });

  await server.listen(port);
  registerCollaborationServer(server);
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

