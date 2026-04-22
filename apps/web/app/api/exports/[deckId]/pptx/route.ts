import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDeckWithSlides } from '@/app/actions/decks';
import { generatePptx } from '@/lib/decks/export';

interface Params {
  params: Promise<{ deckId: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { deckId } = await params;
  const result = await getDeckWithSlides(deckId);

  if (!result) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  }

  const { deck, slides } = result;

  try {
    const buffer = await generatePptx(deck, slides);
    const filename = `${deck.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pptx`;
    const mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    // Slice to a plain ArrayBuffer to satisfy TypeScript's strict BlobPart typing
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: mimeType });

    return new Response(blob, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (err) {
    console.error('PPTX export error:', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
