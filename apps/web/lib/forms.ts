// Shared helpers for FormData-backed server actions.
//
// Nearly every create/update action repeats the same two-step preamble —
// `Object.fromEntries(formData.entries())` → `schema.safeParse(...)` → return
// the first Zod issue as `{ error }` — and several build their update payload by
// looping over the parsed data. These helpers factor out both so the actions
// read as intent, not boilerplate, and so the error shape stays consistent.

import type { z } from 'zod';

export type ParseFormResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Parse a FormData submission against a Zod schema.
 *
 * Returns the parsed data or the first validation issue's message — mirroring
 * the `{ ok }` shape `getAuthedClient()` uses so actions can early-return on
 * both the same way:
 *
 *   const parsed = parseForm(schema, formData);
 *   if (!parsed.ok) return { error: parsed.error };
 *   const data = parsed.data;
 */
export function parseForm<T>(schema: z.ZodType<T>, formData: FormData): ParseFormResult<T> {
  const result = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) {
    return { ok: false, error: result.error.errors[0]?.message ?? 'Invalid input' };
  }
  return { ok: true, data: result.data };
}

/**
 * Build a partial update payload from parsed form data: include only the fields
 * the form actually submitted — those that are neither `undefined` (omitted from
 * a partial schema) nor `''` (left blank). This is the one update strategy the
 * app standardises on; an omitted or blank field is left untouched rather than
 * written as null. Fields needing a genuine "clear to null" still map explicitly.
 */
export function buildUpdate<T extends Record<string, unknown>>(
  data: T,
): { [K in keyof T]?: Exclude<T[K], ''> } {
  const out: { [K in keyof T]?: Exclude<T[K], ''> } = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== '') {
      out[key as keyof T] = value as Exclude<T[keyof T], ''>;
    }
  }
  return out;
}
