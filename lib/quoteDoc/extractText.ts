import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

export type QuoteDocKind = 'pdf' | 'docx';

export function detectKind(filename: string, mimeType: string): QuoteDocKind | null {
  const name = filename.toLowerCase();
  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return 'docx';
  }
  return null;
}

/** Server-only. Pulls raw text out of an uploaded quote document — no
 * layout/structure preserved, just the words, for parseQuoteDoc to work
 * with. Throws on a corrupt or unreadable file; callers surface that as
 * a normal error response rather than a parse result. */
export async function extractQuoteDocText(buffer: Buffer, kind: QuoteDocKind): Promise<string> {
  if (kind === 'pdf') {
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(doc, { mergePages: true });
    return text;
  }
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}
