import { DocumentPermissionRole } from "@prisma/client";
import type { Hocuspocus } from "@hocuspocus/server";
import { applyPlainTextToProseMirrorFragment } from "./prosemirror-plain-text";

type CollaborationContext = {
  userId?: string;
  documentId?: string;
  role?: DocumentPermissionRole;
};

export type CollaborationRuntime = {
  hocuspocus: Hocuspocus<CollaborationContext>;
};

let collaborationRuntime: CollaborationRuntime | null = null;

export function registerCollaborationServer(runtime: CollaborationRuntime) {
  collaborationRuntime = runtime;
}

export function syncPlainTextToActiveDocument(
  documentId: string,
  plainText: string
): boolean {
  if (!collaborationRuntime) {
    return false;
  }

  const roomName = `document:${documentId}`;
  const liveDocument = collaborationRuntime.hocuspocus.documents.get(roomName);

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
  if (!collaborationRuntime) {
    return false;
  }

  if (syncPlainTextToActiveDocument(documentId, plainText)) {
    return true;
  }

  const roomName = `document:${documentId}`;
  const direct = await collaborationRuntime.hocuspocus.openDirectConnection(roomName, {
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
