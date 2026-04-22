'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getDefaultSlideContent, type DeckRow, type DeckSlideRow } from '@/lib/decks/schema';
import type { SlideType } from '@platform/shared';

const ORG_ID = 'bts';

// ──────────────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────────────

export async function getDecks(): Promise<DeckRow[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('decks')
    .select('*')
    .eq('org_id', ORG_ID)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDeck(id: string): Promise<DeckRow | null> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('decks')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function getDeckWithSlides(
  id: string,
): Promise<{ deck: DeckRow; slides: DeckSlideRow[] } | null> {
  const supabase = await createClient();
  const [deckRes, slidesRes] = await Promise.all([
    (supabase as any).from('decks').select('*').eq('id', id).single(),
    (supabase as any)
      .from('deck_slides')
      .select('*')
      .eq('deck_id', id)
      .order('order_index', { ascending: true }),
  ]);
  if (deckRes.error || !deckRes.data) return null;
  return { deck: deckRes.data, slides: slidesRes.data ?? [] };
}

// ──────────────────────────────────────────────────────────
// Write
// ──────────────────────────────────────────────────────────

export async function createDeck(
  title: string,
): Promise<{ error: string } | { success: true; id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await (supabase as any)
    .from('decks')
    .insert({ org_id: ORG_ID, title: title.trim(), created_by: user?.id, updated_by: user?.id })
    .select('id')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/decks');
  return { success: true, id: data.id };
}

export async function updateDeckMeta(
  deckId: string,
  patch: Partial<Pick<DeckRow, 'title' | 'status' | 'theme_id' | 'aspect_ratio'>>,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await (supabase as any)
    .from('decks')
    .update({ ...patch, updated_by: user?.id })
    .eq('id', deckId);

  if (error) return { error: error.message };
  revalidatePath(`/decks/${deckId}/edit`);
  revalidatePath('/decks');
  return { success: true };
}

export async function deleteDeck(
  deckId: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { error } = await (supabase as any).from('decks').delete().eq('id', deckId);
  if (error) return { error: error.message };
  revalidatePath('/decks');
  return { success: true };
}

// ──────────────────────────────────────────────────────────
// Slides
// ──────────────────────────────────────────────────────────

export async function addSlide(
  deckId: string,
  type: SlideType,
  insertAfterIndex?: number,
): Promise<{ error: string } | { success: true; slide: DeckSlideRow }> {
  const supabase = await createClient();

  // Determine order_index: append at end, or insert after given index
  const { data: existing } = await (supabase as any)
    .from('deck_slides')
    .select('order_index')
    .eq('deck_id', deckId)
    .order('order_index', { ascending: false })
    .limit(1);

  const maxIndex = (existing?.[0]?.order_index ?? -1) as number;
  const orderIndex = insertAfterIndex !== undefined ? insertAfterIndex + 1 : maxIndex + 1;

  const defaultSlide = getDefaultSlideContent(type);

  const { data, error } = await (supabase as any)
    .from('deck_slides')
    .insert({
      deck_id: deckId,
      type,
      order_index: orderIndex,
      content_json: defaultSlide.content,
    })
    .select('*')
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/decks/${deckId}/edit`);
  return { success: true, slide: data as DeckSlideRow };
}

export async function updateSlide(
  deckId: string,
  slideId: string,
  contentPatch: Record<string, unknown>,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();

  // Fetch current content and merge patch
  const { data: current, error: fetchErr } = await (supabase as any)
    .from('deck_slides')
    .select('content_json')
    .eq('id', slideId)
    .single();

  if (fetchErr) return { error: fetchErr.message };

  const merged = { ...(current?.content_json ?? {}), ...contentPatch };

  const { error } = await (supabase as any)
    .from('deck_slides')
    .update({ content_json: merged })
    .eq('id', slideId)
    .eq('deck_id', deckId);

  if (error) return { error: error.message };
  revalidatePath(`/decks/${deckId}/edit`);
  return { success: true };
}

export async function reorderSlides(
  deckId: string,
  orderedSlideIds: string[],
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();

  const updates = orderedSlideIds.map((id, index) =>
    (supabase as any)
      .from('deck_slides')
      .update({ order_index: index })
      .eq('id', id)
      .eq('deck_id', deckId),
  );

  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error);
  if (firstError?.error) return { error: firstError.error.message };

  revalidatePath(`/decks/${deckId}/edit`);
  return { success: true };
}

export async function duplicateSlide(
  deckId: string,
  slideId: string,
): Promise<{ error: string } | { success: true; id: string }> {
  const supabase = await createClient();

  const { data: slide, error: fetchErr } = await (supabase as any)
    .from('deck_slides')
    .select('*')
    .eq('id', slideId)
    .single();

  if (fetchErr || !slide) return { error: fetchErr?.message ?? 'Slide not found' };

  const { data, error } = await (supabase as any)
    .from('deck_slides')
    .insert({
      deck_id: deckId,
      type: slide.type,
      order_index: slide.order_index + 1,
      content_json: slide.content_json,
      notes: slide.notes,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/decks/${deckId}/edit`);
  return { success: true, id: data.id };
}

export async function deleteSlide(
  deckId: string,
  slideId: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from('deck_slides')
    .delete()
    .eq('id', slideId)
    .eq('deck_id', deckId);
  if (error) return { error: error.message };
  revalidatePath(`/decks/${deckId}/edit`);
  return { success: true };
}
