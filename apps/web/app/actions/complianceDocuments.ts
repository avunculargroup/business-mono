'use server';

import { revalidatePath } from 'next/cache';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';
import {
  PROFILE_FIELDS,
  REQUIRED_PROFILE_FIELDS,
  documentReadiness,
  type ProfileField,
} from '@/lib/compliance/documents';

/**
 * The company profile, and publishing a compliance document.
 *
 * Two actions, and the second is the one with teeth: it re-checks that the
 * document actually resolves before it publishes, server-side, rather than
 * trusting a disabled button. Publishing an unresolvable Service Statement
 * locks every subscriber out of Minute behind a page that says the statement is
 * unavailable — the correct failure, and a very expensive one to cause by
 * accident.
 */

export async function saveCompanyProfile(values: Record<string, string>) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const clean = (field: ProfileField): string => (values[field] ?? '').trim();

  const blankRequired = REQUIRED_PROFILE_FIELDS.filter((field) => clean(field) === '');
  if (blankRequired.length > 0) {
    // NOT NULL in the schema, so the database would reject this anyway — but a
    // constraint violation reads as a bug and this reads as a form.
    return {
      error: `${blankRequired.join(' and ')} cannot be empty.`,
    };
  }

  const optional: Record<string, string | null> = {};
  for (const field of PROFILE_FIELDS) {
    if (REQUIRED_PROFILE_FIELDS.includes(field)) continue;
    const value = clean(field);
    // Empty means NULL, not the string "". The resolver treats both as missing,
    // but a NULL is honest about the field never having been filled.
    optional[field] = value === '' ? null : value;
  }

  // `company_profile` is a singleton: `id BOOLEAN PRIMARY KEY DEFAULT TRUE
  // CHECK (id)`. Upserting that one row is the whole write.
  //
  // The two NOT NULL columns are named rather than spread, so the guard above
  // and the insert are one code path: a `Record<string, string | null>` cannot
  // prove to the compiler that they are present, and satisfying it with a cast
  // would delete the only check that they are.
  const { error } = await auth.supabase.from('company_profile').upsert(
    {
      id: true,
      legal_name: clean('legal_name'),
      trading_name: clean('trading_name'),
      ...optional,
    },
    { onConflict: 'id' },
  );

  if (error) return { error: humanizeError(error) };

  revalidatePath('/compliance');
  return { success: true };
}

export async function activateComplianceDocument(documentId: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const { data: document, error: readError } = await auth.supabase
    .from('compliance_documents')
    .select('id, doc_type, title, version, body, status, effective_from')
    .eq('id', documentId)
    .maybeSingle();

  if (readError) return { error: humanizeError(readError) };
  if (!document) return { error: 'That document no longer exists.' };
  if (document.status === 'active') return { error: 'That version is already live.' };

  const { data: profile, error: profileError } = await auth.supabase
    .from('company_profile')
    .select(
      'legal_name, trading_name, abn, acn, registered_address, registered_state, registered_postcode, public_phone, public_email, public_website, complaints_contact, complaints_email, complaints_phone, privacy_policy_url',
    )
    .maybeSingle();

  if (profileError) return { error: humanizeError(profileError) };

  // Re-checked here and not only in the page. The button that got you here can
  // be stale — someone else may have blanked a profile field since it rendered
  // — and this is the last point at which the check is free.
  const readiness = documentReadiness(
    {
      body: document.body,
      version: document.version,
      effectiveFrom: document.effective_from,
    },
    profile as Partial<Record<ProfileField, string | null>> | null,
    new Date().toISOString().slice(0, 10),
  );

  if (!readiness.ready) {
    return {
      error: `This cannot go live yet — ${readiness.missing.join(', ')} ${
        readiness.missing.length === 1 ? 'has' : 'have'
      } no value. A subscriber would see "not available" instead of the document.`,
    };
  }

  // The RPC supersedes the incumbent and activates this one in one
  // transaction. Doing it as two client-side updates would leave zero active
  // documents if the second failed, which for a Service Statement means every
  // subscriber locked out. See the migration header.
  const { error } = await auth.supabase.rpc('activate_compliance_document', {
    p_id: documentId,
  });

  if (error) return { error: humanizeError(error) };

  revalidatePath('/compliance');
  return { success: true };
}
