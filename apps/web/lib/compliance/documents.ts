import { documentPlaceholders, resolveDocument } from '@platform/shared';

/**
 * Whether a compliance document can be published, and what is stopping it.
 *
 * The Service Statement is the one document that gates the whole of Minute: no
 * active statement means nobody can log in, and an active statement whose
 * variables do not resolve means the same thing with a more confusing error.
 * `resolveDocument` already fails closed for the second case — an unresolved
 * `{{bts_abn}}` returns an empty body rather than a half-finished document — so
 * this module's job is to turn that refusal into something a founder can act on
 * *before* they publish rather than after.
 *
 * Pure, and tested without a database. The publishing rules are the part that
 * must not be wrong.
 */

/** Every field of the `company_profile` singleton, in the order the form shows them. */
export const PROFILE_FIELDS = [
  'legal_name',
  'trading_name',
  'abn',
  'acn',
  'registered_address',
  'registered_state',
  'registered_postcode',
  'public_phone',
  'public_email',
  'public_website',
  'complaints_contact',
  'complaints_email',
  'complaints_phone',
  'privacy_policy_url',
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** `legal_name` and `trading_name` are NOT NULL in the schema; the rest are not. */
export const REQUIRED_PROFILE_FIELDS: readonly ProfileField[] = Object.freeze([
  'legal_name',
  'trading_name',
]);

export type ProfileValues = Partial<Record<ProfileField, string | null>>;

export interface DocumentReadiness {
  /** True when every placeholder in the body has a value. */
  ready: boolean;
  /**
   * Placeholder keys with no value, sorted.
   *
   * Named rather than counted: "fill in three more" sends someone hunting, and
   * every key now names a field on the profile form.
   */
  missing: string[];
  /** The resolved body, or empty when `ready` is false. Never half-substituted. */
  body: string;
}

export interface DocumentInput {
  body: string;
  version: string;
  effectiveFrom: string | null;
}

/**
 * Resolve a document against the profile, and say what is missing.
 *
 * Every placeholder resolves from `company_profile`, including the privacy
 * policy URL — which was read from `NEXT_PUBLIC_PRIVACY_POLICY_URL` until
 * migration 20260916010000 gave it a column. A complete profile is now
 * sufficient, so everything this reports is fixable on the profile form.
 */
export function documentReadiness(
  document: DocumentInput,
  profile: ProfileValues | null,
  today: string,
): DocumentReadiness {
  const { body, missing } = resolveDocument(document.body, {
    profile: profile ?? {},
    version: document.version,
    date: document.effectiveFrom ?? today,
  });

  return { ready: missing.length === 0, missing, body };
}

/**
 * The profile fields a given document body actually needs.
 *
 * Not every field is used by every document, and telling someone the terms of
 * service are blocked on a complaints phone number they are not being asked for
 * would be a lie. Derived from the body's own placeholders.
 */
export function profileFieldsUsedBy(body: string): ProfileField[] {
  const keys = new Set(documentPlaceholders(body));

  return PROFILE_FIELDS.filter(
    (field) => keys.has(`bts_${field}`) || keys.has(field),
  );
}

/** Fields with no value. Whitespace counts as empty, as it does in the resolver. */
export function blankProfileFields(
  profile: ProfileValues | null,
  fields: readonly ProfileField[] = PROFILE_FIELDS,
): ProfileField[] {
  return fields.filter((field) => {
    const value = profile?.[field];
    return !value || value.trim() === '';
  });
}
