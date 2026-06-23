import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const FILES_BUCKET = 'platform-files';
// Short-lived: the /share/<id> link is stable, but each visit mints a
// fresh signed URL, so the underlying token never needs to be long-lived.
const SIGNED_URL_TTL_SECONDS = 3600;

interface Params {
  params: Promise<{ id: string }>;
}

// Public, unauthenticated endpoint. RLS restricts the anon role to rows
// (and storage objects) where is_public = true, so a private file 404s
// here even though the URL is known.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: file } = await (supabase as any)
    .from('platform_files')
    .select('storage_path, is_public')
    .eq('id', id)
    .eq('is_public', true)
    .single();

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
