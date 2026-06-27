import type { Server as HttpServer } from "http";
import { parse as parseUrl } from "url";
import { DocumentPermissionRole } from "@prisma/client";
import {
  Hocuspocus,
  type WebSocketLike,
} from "@hocuspocus/server";
import crossws from "crossws/adapters/node";
import { jwtVerify } from "jose";
import { parse as parseCookie } from "cookie";
import * as Y from "yjs";
import { env } from "../config/env";
import { prisma } from "../prisma/client";
import {
  registerCollaborationServer,
  type CollaborationRuntime,
} from "./collaboration.runtime";
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

export const COLLABORATION_WS_PATH = "/collaboration";

export async function setupCollaboration(
  httpServer: HttpServer
): Promise<CollaborationRuntime> {
  const hocuspocus = new Hocuspocus<CollaborationContext>({
    quiet: true,
    debounce: 1500,
    maxDebounce: 10000,
    async onAuthenticate({ documentName, requestHeaders, token }) {
      let resolvedDocumentId: string | undefined;
      let resolvedUserId: string | undefined;
      try {
        resolvedDocumentId = parseDocumentId(documentName);
        resolvedUserId = await resolveUserId(requestHeaders, token);

        const document = await findDocumentStateForUser(resolvedDocumentId, resolvedUserId);
        if (!document) {
          throw new Error("Document not found or access denied");
        }

        const role = await getDocumentAccessRole(resolvedDocumentId, resolvedUserId);
        return { userId: resolvedUserId, documentId: resolvedDocumentId, role };
      } catch (error) {
        console.error("[collaboration:auth] Authentication failed:", {
          documentName,
          documentId: resolvedDocumentId,
          userId: resolvedUserId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
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

  const crosswsInstance = crossws({
    hooks: {
      open: (peer) => {
        const clientConnection = hocuspocus.handleConnection(
          peer.websocket as unknown as WebSocketLike,
          peer.request as Request
        );
        (peer as { _hocuspocus?: unknown })._hocuspocus = clientConnection;
      },
      message: (peer, message) => {
        (
          peer as {
            _hocuspocus?: { handleMessage: (payload: Uint8Array) => void };
          }
        )._hocuspocus?.handleMessage(message.uint8Array());
      },
      close: (peer, event) => {
        (
          peer as {
            _hocuspocus?: {
              handleClose: (payload: { code: number; reason: string }) => void;
            };
          }
        )._hocuspocus?.handleClose({
          code: event.code ?? 1000,
          reason: event.reason ?? "",
        });
      },
      error: (_peer, error) => {
        console.error("Collaboration WebSocket error:", error);
      },
    },
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = parseUrl(request.url ?? "").pathname ?? "";
    if (pathname !== COLLABORATION_WS_PATH) {
      return;
    }

    void (async () => {
      try {
        await hocuspocus.hooks("onUpgrade", {
          request,
          socket,
          head,
          instance: hocuspocus,
        });
        crosswsInstance.handleUpgrade(request, socket, head);
      } catch (error) {
        if (error) {
          console.error("Collaboration upgrade failed:", error);
        }
        socket.destroy();
      }
    })();
  });

  const runtime: CollaborationRuntime = { hocuspocus };
  registerCollaborationServer(runtime);
  console.log(
    `Collaboration WebSocket attached at ${COLLABORATION_WS_PATH} (port ${env.BACKEND_PORT})`
  );

  return runtime;
}

function parseDocumentId(documentName: string): string {
  const [prefix, documentId] = documentName.split(":");
  if (prefix !== "document" || !documentId) {
    throw new Error("Invalid collaboration room");
  }
  return documentId;
}

async function resolveUserId(
  headers: Headers | Record<string, string | string[] | undefined>,
  token?: string
): Promise<string> {
  const rawToken = token?.trim() || getCookieToken(headers);

  if (!rawToken) {
    throw new Error("Authentication required");
  }

  const { payload } = await jwtVerify(rawToken, secret);
  const userId = payload.id as string | undefined;

  if (!userId) {
    throw new Error("Authentication required");
  }

  return userId;
}

function getCookieToken(
  headers: Headers | Record<string, string | string[] | undefined>
): string | undefined {
  const cookieHeader = getCookieHeader(headers);
  const cookies = parseCookie(cookieHeader);
  return cookies[env.COOKIE_NAME];
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
