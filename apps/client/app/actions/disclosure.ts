'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireClientRepositories } from '@/lib/repositories';

/**
 * Record the acknowledgement. One of exactly two writes in the whole app.
 *
 * Takes an id and a version and nothing else — there is no free-text parameter
 * here and there is no column for one to land in. That is Rule 1 expressed at
 * the narrowest point: the write surface is not *reviewed* for personal
 * circumstances, it is *incapable* of carrying them.
 */
export async function acknowledgeDisclosure(formData: FormData): Promise<void> {
  const documentId = String(formData.get('documentId') ?? '');
  const documentVersion = String(formData.get('documentVersion') ?? '');

  if (!documentId || !documentVersion) {
    throw new Error('A disclosure acknowledgement needs a document and a version');
  }

  const repositories = await requireClientRepositories();

  // The IP is read server-side rather than accepted from the form. A
  // client-supplied address in an audit trail is worse than no address: it
  // looks like evidence and is not.
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0]?.trim();

  await repositories.writes.acknowledgeDisclosure({
    documentId,
    documentVersion,
    ...(ipAddress ? { ipAddress } : {}),
  });

  redirect('/');
}
