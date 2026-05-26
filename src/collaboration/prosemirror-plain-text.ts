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
