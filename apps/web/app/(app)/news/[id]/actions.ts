'use server';

import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';

/**
 * Mint a short-lived signed URL for a stored report artefact.
 *
 * The `reports` bucket is private, so `storage_path` is not a public URL and
 * cannot be rendered as a link. The URL is generated at click time, expires in
 * sixty seconds, and never sits in the rendered DOM — which keeps the split the
 * whole feature is built around: `reports.body` is the convenience surface, the
 * stored artefact is the source of record, and the source of record is never
 * exposed by an unguarded link.
 */
export async function getReportFileUrl(reportId: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { success: false as const, error: auth.error };

  // `reports` is absent from the generated Database types until
  // `pnpm --filter @platform/db generate-types` runs against the migrated
  // database. Cast at the boundary; the row shape is asserted explicitly.
  const { data: report, error: lookupError } = await auth.supabase
    .from('reports' as never)
    .select('storage_path, file_name')
    .eq('id', reportId)
    .single();

  if (lookupError || !report) {
    return { success: false as const, error: humanizeError(lookupError) };
  }

  const { storage_path, file_name } = report as unknown as {
    storage_path: string | null;
    file_name: string | null;
  };
  if (!storage_path) {
    return { success: false as const, error: 'No original file was stored for this report.' };
  }

  const { data, error } = await auth.supabase.storage
    .from('reports')
    .createSignedUrl(storage_path, 60);

  if (error || !data) {
    return { success: false as const, error: humanizeError(error) };
  }

  return { success: true as const, url: data.signedUrl, fileName: file_name ?? 'report' };
}

/**
 * Save the curator note — why this report matters, in a human's words.
 *
 * First-class data rather than a comment field: agents inherit the judgement,
 * not the document, and this is where that judgement lives.
 */
export async function saveReportCuratorNote(reportId: string, note: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from('reports' as never)
    .update({ curator_note: note.trim() || null } as never)
    .eq('id', reportId);

  if (error) return { error: humanizeError(error) };
  revalidatePath('/news');
  return { success: true };
}
