import { DocumentPermissionRole } from "@prisma/client";
import type { Server } from "@hocuspocus/server";
import { applyPlainTextToProseMirrorFragment } from "./prosemirror-plain-text";

type CollaborationContext = {
  userId?: string;
  documentId?: string;
  role?: DocumentPermissionRole;
};

let collaborationServer: Server<CollaborationContext> | null = null;

export function registerCollaborationServer(server: Server<CollaborationContext>) {
  collaborationServer = server;
}

export function syncPlainTextToActiveDocument(
  documentId: string,
  plainText: string
): boolean {
  if (!collaborationServer) {
    return false;
  }

  const roomName = `document:${documentId}`;
  const liveDocument = collaborationServer.hocuspocus.documents.get(roomName);

  if (!liveDocument) {
    return false;
  }

  liveDocument.transact(
    () => {
      const fragment = liveDocument.getXmlFragment("prosemirror");
      applyPlainTextToProseMirrorFragment(fragment, plainText);
    },
    {
      source: "local",
      context: {
        userId: "system",
        documentId,
        role: DocumentPermissionRole.EDITOR,
      },
    }
  );

  return true;
}

export async function syncPlainTextToCollaborationDocument(
  documentId: string,
  plainText: string
): Promise<boolean> {
  if (!collaborationServer) {
    return false;
  }

  if (syncPlainTextToActiveDocument(documentId, plainText)) {
    return true;
  }

  const roomName = `document:${documentId}`;
  const direct = await collaborationServer.hocuspocus.openDirectConnection(roomName, {
    userId: "system",
    documentId,
    role: DocumentPermissionRole.EDITOR,
  });

  try {
    await direct.transact((document) => {
      const fragment = document.getXmlFragment("prosemirror");
      applyPlainTextToProseMirrorFragment(fragment, plainText);
    });
  } finally {
    await direct.disconnect();
  }

  return true;
}
