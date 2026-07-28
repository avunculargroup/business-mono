import { z } from 'zod';

/**
 * Zod schema for a checkbox that round-trips through FormData as the string
 * 'true' or 'false'.
 *
 * `z.coerce.boolean()` must not be used for these. It is `Boolean(input)`, and
 * `Boolean('false') === true`, so any client that writes the field explicitly
 * (rather than omitting it when unchecked, as a native form does) will have an
 * unchecked box persist as enabled. Every client in this app writes the field
 * explicitly — `fd.set('x', v.x ? 'true' : 'false')`.
 *
 * The field stays optional so an omitted field still falls back to `fallback`.
 */
export function formBoolean(fallback: boolean) {
  return z
    .enum(['true', 'false'])
    .optional()
    .default(fallback ? 'true' : 'false')
    .transform((v) => v === 'true');
}
