'use server';

import { getAuthedClient, getAuthedRepositories } from '@/lib/action';
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
 *
 * Two halves, deliberately: which artefact a report points at is data and comes
 * from the repository, while minting the URL is a Storage call and stays on the
 * raw client — for the same reason auth does. Storage is not data, and there is
 * nothing for a fixture adapter to stand in for.
 */
export async function getReportFileUrl(reportId: string) {
  const auth = await getAuthedRepositories();
  if (!auth.ok) return { success: false as const, error: auth.error };

  let storagePath: string | null;
  let fileName: string | null;
  try {
    ({ storagePath, fileName } = await auth.repositories.research.getReportFile(reportId));
  } catch (err) {
    return { success: false as const, error: humanizeError(err) };
  }

  if (!storagePath) {
    return { success: false as const, error: 'No original file was stored for this report.' };
  }

  const client = await getAuthedClient();
  if (!client.ok) return { success: false as const, error: client.error };

  const { data, error } = await client.supabase.storage
    .from('reports')
    .createSignedUrl(storagePath, 60);

  if (error || !data) {
    return { success: false as const, error: humanizeError(error) };
  }

  return { success: true as const, url: data.signedUrl, fileName: fileName ?? 'report' };
}

/**
 * Save the curator note — why this report matters, in a human's words.
 *
 * First-class data rather than a comment field: agents inherit the judgement,
 * not the document, and this is where that judgement lives.
 */
export async function saveReportCuratorNote(reportId: string, note: string) {
  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };

  try {
    await auth.repositories.research.setReportCuratorNote(reportId, note);
  } catch (err) {
    // An inline literal, not `actionError(err)` — see the note in
    // app/actions/approvals.ts about how that breaks callers' narrowing.
    return { error: humanizeError(err) };
  }

  revalidatePath('/news');
  return { success: true };
}
