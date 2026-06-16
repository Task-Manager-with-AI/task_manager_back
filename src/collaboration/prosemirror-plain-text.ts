import * as Y from "yjs";

export function applyPlainTextToProseMirrorFragment(
  fragment: Y.XmlFragment,
  plainText: string
) {
  if (fragment.length > 0) {
    fragment.delete(0, fragment.length);
  }

  const normalized = plainText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const safeLines = lines.length > 0 ? lines : [""];

  for (const line of safeLines) {
    const paragraph = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();

    if (line.length > 0) {
      text.insert(0, line);
    }

    paragraph.insert(0, [text]);
    fragment.insert(fragment.length, [paragraph]);
  }

  if (fragment.length === 0) {
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText()]);
    fragment.insert(0, [paragraph]);
  }
}

export function createYjsStateFromPlainText(plainText: string): Buffer {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("prosemirror");
  applyPlainTextToProseMirrorFragment(fragment, plainText);
  return Buffer.from(Y.encodeStateAsUpdate(ydoc));
}

/**
 * Extract plain text from an encoded Yjs document state (the inverse of
 * createYjsStateFromPlainText). Used by the RAG indexer to read live-edited
 * documents whose DocumentVersion.plainText was never populated.
 */
export function extractPlainTextFromState(state: Uint8Array): string {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  const fragment = ydoc.getXmlFragment("prosemirror");
  const blocks: string[] = [];

  const walk = (node: Y.XmlElement | Y.XmlText | Y.XmlFragment): string => {
    if (node instanceof Y.XmlText) return node.toString();
    let text = "";
    node.forEach((child) => {
      text += walk(child as Y.XmlElement | Y.XmlText);
    });
    return text;
  };

  fragment.forEach((child) => {
    const block = walk(child as Y.XmlElement | Y.XmlText).trim();
    if (block) blocks.push(block);
  });

  return blocks.join("\n\n");
}
