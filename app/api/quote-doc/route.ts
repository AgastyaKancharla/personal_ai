import { NextRequest, NextResponse } from 'next/server';
import { detectKind, extractQuoteDocText } from '@/lib/quoteDoc/extractText';
import { parseQuoteDoc } from '@/lib/quoteDoc/parseQuoteDoc';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 8MB).' }, { status: 400 });
  }

  const kind = detectKind(file.name, file.type);
  if (!kind) {
    return NextResponse.json({ error: 'Only PDF and Word (.docx) files are supported.' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractQuoteDocText(buffer, kind);
    const { items, totalLines } = parseQuoteDoc(text);
    return NextResponse.json({ items, totalLines });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not read that file.' }, { status: 500 });
  }
}
