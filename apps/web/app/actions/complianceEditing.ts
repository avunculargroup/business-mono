'use server';

import { revalidatePath } from 'next/cache';
import { KNOWN_FACT_KEYS } from '@platform/data-supabase';
import { getAuthedClient } from '@/lib/action';
import { humanizeError } from '@/lib/errors';
import {
  checkTemplateBody,
  frozenReason,
  isValidVersion,
  withVersion,
} from '@/lib/compliance/editing';

/**
 * Editing bodies, and cutting new versions.
 *
 * The immutability rule these work within is enforced by triggers, not here —
 * see `supabase/migrations/20260912050000_frozen_bodies.sql`. What these add is
 * the part a trigger cannot: a readable reason, and for templates the parser
 * check that refuses a body which would not render.
 *
 * The check is a refusal rather than a warning on purpose. A template that
 * saves and will not render is discovered by a subscriber halfway through
 * assembling a board paper, and a warning is exactly the shape of thing that
 * gets clicked past at five to six.
 */

const DOCUMENT_COLUMNS = 'id, doc_type, title, version, body, status';
const TEMPLATE_COLUMNS =
  'id, slug, title, artefact_type, client_type, version, body, status, facts_required, regulatory_references';

export async function updateComplianceDocumentBody(id: string, body: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  if (body.trim() === '') {
    // NOT NULL in the schema catches a null, not a blank. An empty Service
    // Statement resolves perfectly and serves a subscriber an empty page.
    return { error: 'The body cannot be empty.' };
  }

  const { data: row, error: readError } = await auth.supabase
    .from('compliance_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (readError) return { error: humanizeError(readError) };
  if (!row) return { error: 'That document no longer exists.' };

  const frozen = frozenReason(row.status);
  if (frozen) return { error: frozen };

  const { error } = await auth.supabase
    .from('compliance_documents')
    .update({ body })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/compliance');
  return { success: true };
}

export async function updateTemplateBody(id: string, body: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  const { data: row, error: readError } = await auth.supabase
    .from('prepare_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (readError) return { error: humanizeError(readError) };
  if (!row) return { error: 'That template no longer exists.' };

  const frozen = frozenReason(row.status);
  if (frozen) return { error: frozen };

  const check = checkTemplateBody(body, KNOWN_FACT_KEYS);
  if (!check.ok) {
    return { error: 'This template would not render.', problems: check.problems };
  }

  // `facts_required` is what the RLS policy and the adapter read; the body's
  // front matter is what a human reads. Writing both from the one parse is what
  // keeps them saying the same thing — the live adapter takes the column as
  // authoritative, so a disagreement is invisible rather than harmless.
  const { error } = await auth.supabase
    .from('prepare_templates')
    .update({ body, facts_required: check.parsed.factsRequired })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/compliance');

  // The trigger clears any Lex review when the body changes. Reported because
  // it is a consequence of saving that the person saving should hear about,
  // rather than discover when the publish button stops working.
  return { success: true, reviewCleared: row.status !== 'draft' };
}

export async function createComplianceDocumentVersion(id: string, version: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  if (!isValidVersion(version)) {
    return { error: 'Give the new version a short label with no spaces, such as 1.1.' };
  }

  const { data: row, error: readError } = await auth.supabase
    .from('compliance_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (readError) return { error: humanizeError(readError) };
  if (!row) return { error: 'That document no longer exists.' };

  const trimmed = version.trim();

  const { error } = await auth.supabase.from('compliance_documents').insert({
    doc_type: row.doc_type,
    title: row.title,
    version: trimmed,
    body: row.body,
    // A copy always starts as a draft, whatever it was copied from. The point
    // of cutting a version is that this one has not been published yet.
    status: 'draft',
    effective_from: null,
    notes: `Copied from version ${row.version}.`,
  });

  if (error) {
    if (error.code === '23505') {
      return { error: `Version ${trimmed} already exists for this document type.` };
    }
    return { error: humanizeError(error) };
  }

  revalidatePath('/compliance');
  return { success: true };
}

export async function createTemplateVersion(id: string, version: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };

  if (!isValidVersion(version)) {
    return { error: 'Give the new version a short label with no spaces, such as 1.1.' };
  }

  const { data: row, error: readError } = await auth.supabase
    .from('prepare_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (readError) return { error: humanizeError(readError) };
  if (!row) return { error: 'That template no longer exists.' };

  const trimmed = version.trim();

  const { error } = await auth.supabase.from('prepare_templates').insert({
    slug: row.slug,
    title: row.title,
    artefact_type: row.artefact_type,
    client_type: row.client_type,
    version: trimmed,
    // Front matter rewritten to match the column, so the two agree from the
    // first save rather than from whenever someone notices.
    body: withVersion(row.body, trimmed),
    status: 'draft',
    facts_required: row.facts_required,
    regulatory_references: row.regulatory_references,
    notes: `Copied from version ${row.version}. Not reviewed.`,
  });

  if (error) {
    if (error.code === '23505') {
      return { error: `Version ${trimmed} already exists for this template.` };
    }
    return { error: humanizeError(error) };
  }

  revalidatePath('/compliance');
  return { success: true };
}
