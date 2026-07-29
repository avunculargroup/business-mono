'use server';

import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isClientPromotable } from '@platform/shared';
import { humanizeError } from '@/lib/errors';
import { parseForm } from '@/lib/forms';
import { buildWatchConfig } from '@/lib/ecosystem/watchConfig';

// A watch belongs to exactly one register entity — the DB enforces
// num_nonnulls(...) = 1, and the form only ever submits one of these.
const watchSchema = z.object({
  product_service_id: z.string().uuid().optional().or(z.literal('')),
  advisor_partner_id: z.string().uuid().optional().or(z.literal('')),
  watch_type:         z.string().min(1, 'Watch type is required'),
  label:              z.string().min(1, 'Label is required'),
  source_url:         z.string().optional(),
  check_frequency:    z.string().optional(),
  enabled:            z.string().optional(),
  centrality:         z.string().optional(),
  owner_id:           z.string().uuid().optional().or(z.literal('')),
  notes:              z.string().optional(),
  created_by:         z.string().uuid().optional().or(z.literal('')),

  // Adapter config fields. The form renders only the ones its watch_type needs;
  // buildWatchConfig picks the right subset and drops the rest, so a stale field
  // left in the DOM by a type switch never lands in `config`.
  owner:                z.string().optional(),
  repo:                 z.string().optional(),
  include_prereleases:  z.string().optional(),
  track:                z.string().optional(),
  feed_url:             z.string().optional(),
  match:                z.string().optional(),
  event_terms:          z.string().optional(),
  recipient_local_part: z.string().optional(),
  subdomain:            z.string().optional(),
  provider:             z.string().optional(),
  base_url:             z.string().optional(),
  api:                  z.string().optional(),
  attestation_url:      z.string().optional(),
  expected_cadence_days: z.string().optional(),
  date_selector:        z.string().optional(),
  page_url:             z.string().optional(),
  content_selector:     z.string().optional(),
  min_change_ratio:     z.string().optional(),
  content_kind:         z.string().optional(),
  register:             z.string().optional(),
  identifier:           z.string().optional(),
  expected_status:      z.string().optional(),
});

const curatorNoteSchema = z.object({
  note: z.string().optional(),
});

// Where a watch's entity lives, for revalidation. Watches are managed on the
// register detail page, so both that page and the feed need refreshing.
function revalidateForWatch(productId: string | null, advisorId: string | null) {
  if (productId) revalidatePath(`/products/${productId}`);
  if (advisorId) revalidatePath(`/advisors/${advisorId}`);
  revalidatePath('/signals');
}

export async function createWatch(formData: FormData) {
  const parsed = parseForm(watchSchema, formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const d = parsed.data;

  const productId = d.product_service_id || null;
  const advisorId = d.advisor_partner_id || null;
  if ((productId ? 1 : 0) + (advisorId ? 1 : 0) !== 1) {
    return { error: 'A watch must belong to exactly one product or advisor.' };
  }

  const { data: watch, error } = await supabase
    .from('ecosystem_watches')
    .insert({
      product_service_id: productId,
      advisor_partner_id: advisorId,
      watch_type:         d.watch_type,
      label:              d.label,
      config:             buildWatchConfig(d.watch_type, d),
      source_url:         d.source_url || null,
      check_frequency:    d.check_frequency || 'daily',
      enabled:            d.enabled === 'on',
      centrality:         d.centrality ? parseFloat(d.centrality) : 1,
      owner_id:           d.owner_id || null,
      notes:              d.notes || null,
      created_by:         d.created_by || null,
    })
    .select()
    .single();

  if (error) return { error: humanizeError(error) };

  revalidateForWatch(productId, advisorId);
  return { success: true, watch };
}

export async function updateWatch(id: string, formData: FormData) {
  const parsed = parseForm(watchSchema, formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const d = parsed.data;

  // The parent is set at creation and never moves — a watch that changed entity
  // would orphan its existing changes' denormalised entity_name.
  const { error } = await supabase
    .from('ecosystem_watches')
    .update({
      watch_type:      d.watch_type,
      label:           d.label,
      config:          buildWatchConfig(d.watch_type, d),
      source_url:      d.source_url || null,
      check_frequency: d.check_frequency || 'daily',
      enabled:         d.enabled === 'on',
      centrality:      d.centrality ? parseFloat(d.centrality) : 1,
      owner_id:        d.owner_id || null,
      notes:           d.notes || null,
    })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidateForWatch(d.product_service_id || null, d.advisor_partner_id || null);
  return { success: true };
}

export async function setWatchEnabled(id: string, enabled: boolean) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase.from('ecosystem_watches').update({ enabled }).eq('id', id);
  if (error) return { error: humanizeError(error) };

  revalidatePath('/signals');
  return { success: true };
}

export async function deleteWatch(id: string, productId?: string, advisorId?: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  // Cascades to this watch's changes — the confirm dialog says so.
  const { error } = await supabase.from('ecosystem_watches').delete().eq('id', id);
  if (error) return { error: humanizeError(error) };

  revalidateForWatch(productId || null, advisorId || null);
  return { success: true };
}

export async function acknowledgeChange(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('ecosystem_changes')
    .update({
      status:          'acknowledged',
      acknowledged_by: user.id,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/signals');
  return { success: true };
}

export async function setChangeStatus(id: string, status: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase.from('ecosystem_changes').update({ status }).eq('id', id);
  if (error) return { error: humanizeError(error) };

  revalidatePath('/signals');
  return { success: true };
}

export async function pinChange(id: string, pinned: boolean) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase.from('ecosystem_changes').update({ pinned }).eq('id', id);
  if (error) return { error: humanizeError(error) };

  revalidatePath('/signals');
  return { success: true };
}

export async function setCuratorNote(id: string, formData: FormData) {
  const parsed = parseForm(curatorNoteSchema, formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from('ecosystem_changes')
    .update({ curator_note: parsed.data.note || null })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/signals');
  return { success: true };
}

/**
 * Queue a change for the future client-facing companion app.
 *
 * This is the dormant Lex gate, and it is why the action reads the row before
 * writing: only a change Lex has explicitly classified `neutral` may be
 * promoted. An unclassified change (compliance_class NULL — the classifier
 * failed, or has not run yet) is refused exactly like a non-neutral one. A
 * failed compliance call must never become an accidental promotion.
 *
 * Un-flagging is always allowed: withdrawing a change from the client queue
 * cannot create compliance exposure.
 */
export async function flagClientRelevant(id: string, flag: boolean) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  if (flag) {
    const { data: change, error: readError } = await supabase
      .from('ecosystem_changes')
      .select('compliance_class')
      .eq('id', id)
      .single();

    if (readError) return { error: humanizeError(readError) };

    if (!isClientPromotable(change?.compliance_class)) {
      return {
        error: change?.compliance_class
          ? 'This change is classified as compliance-sensitive and needs a compliance review before it can go to clients.'
          : 'This change has not been classified for compliance yet, so it cannot be flagged for clients.',
      };
    }
  }

  const { error } = await supabase
    .from('ecosystem_changes')
    .update({ client_relevant: flag })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/signals');
  return { success: true };
}
