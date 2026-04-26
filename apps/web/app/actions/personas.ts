'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const personaSchema = z.object({
  name:                  z.string().min(1, 'Name is required').max(100),
  market_segment:        z.enum(['sme', 'public_company', 'family_office', 'hnw', 'startup', 'superannuation']),
  sophistication_level:  z.enum(['novice', 'intermediate', 'expert']).default('intermediate'),
  estimated_aum:         z.string().optional(),
  // Psychographic fields (assembled into JSONB)
  north_star:            z.string().optional(),
  anti_goal:             z.string().optional(),
  decision_making_style: z.enum(['data_driven', 'consensus_seeking', 'risk_averse', 'opportunistic', 'process_oriented']).optional().or(z.literal('')),
  // Strategic constraint fields (assembled into JSONB)
  regulatory_hurdles:    z.string().optional(),
  gatekeepers:           z.string().optional(),
  preferred_mediums:     z.string().optional(),
  // Success signals (assembled into JSONB)
  resonant_phrases:      z.string().optional(),
  success_indicators:    z.string().optional(),
  pain_point_keywords:   z.string().optional(),
  // Direct fields
  objection_bank:        z.string().optional(),
  notes:                 z.string().optional(),
});

function splitLines(value: string | undefined): string[] {
  if (!value) return [];
  return value.split('\n').map(s => s.trim()).filter(Boolean);
}

export async function createPersona(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = personaSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const d = parsed.data;

  const psychographic_profile = {
    north_star:            d.north_star || undefined,
    anti_goal:             d.anti_goal || undefined,
    decision_making_style: d.decision_making_style || undefined,
  };

  const strategic_constraints = {
    regulatory_hurdles: splitLines(d.regulatory_hurdles),
    gatekeepers:        splitLines(d.gatekeepers),
    preferred_mediums:  splitLines(d.preferred_mediums),
  };

  const success_signals = {
    resonant_phrases:    splitLines(d.resonant_phrases),
    success_indicators:  splitLines(d.success_indicators),
    pain_point_keywords: splitLines(d.pain_point_keywords),
  };

  const objection_bank = splitLines(d.objection_bank).slice(0, 5);

  const supabase = await createClient();
  const { data: persona, error } = await supabase.from('personas').insert({
    name:                 d.name,
    market_segment:       d.market_segment,
    sophistication_level: d.sophistication_level,
    estimated_aum:        d.estimated_aum || null,
    psychographic_profile,
    strategic_constraints,
    success_signals,
    objection_bank,
    notes:                d.notes || null,
  }).select().single();

  if (error) return { error: error.message };

  revalidatePath('/crm/personas');
  return { success: true, persona };
}

export async function updatePersona(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = personaSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const d = parsed.data;

  const psychographic_profile = {
    north_star:            d.north_star || undefined,
    anti_goal:             d.anti_goal || undefined,
    decision_making_style: d.decision_making_style || undefined,
  };

  const strategic_constraints = {
    regulatory_hurdles: splitLines(d.regulatory_hurdles),
    gatekeepers:        splitLines(d.gatekeepers),
    preferred_mediums:  splitLines(d.preferred_mediums),
  };

  const success_signals = {
    resonant_phrases:    splitLines(d.resonant_phrases),
    success_indicators:  splitLines(d.success_indicators),
    pain_point_keywords: splitLines(d.pain_point_keywords),
  };

  const objection_bank = splitLines(d.objection_bank).slice(0, 5);

  const supabase = await createClient();
  const { error } = await supabase.from('personas').update({
    name:                 d.name,
    market_segment:       d.market_segment,
    sophistication_level: d.sophistication_level,
    estimated_aum:        d.estimated_aum || null,
    psychographic_profile,
    strategic_constraints,
    success_signals,
    objection_bank,
    notes:                d.notes || null,
  }).eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/crm/personas');
  revalidatePath(`/crm/personas/${id}`);
  return { success: true };
}

export async function deletePersona(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('personas').delete().eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/crm/personas');
  return { success: true };
}
