/**
 * Variable substitution for compliance documents.
 *
 * The Service Statement is stored in `compliance_documents.body` with
 * `{{variable}}` placeholders, and its variable schema sources them all from
 * `company_profile` plus the document's own version and date. This resolves
 * them at render.
 *
 * Lives in `@platform/shared` because two places need it: the blocking gate in
 * `apps/client`, and `apps/web` when a founder previews a document before
 * setting it active. The same reasoning as the `/prepare` template parser next
 * door — one implementation, or two that eventually disagree about what a
 * resolved document looks like.
 *
 * **The important behaviour is the failure.** An unresolved `{{bts_abn}}` shown
 * to a subscriber is worse than showing nothing: it is a document that looks
 * finished and is not, in a document whose whole value is being accurate. So
 * resolution returns the missing keys rather than substituting a blank, and the
 * caller is expected to refuse to render.
 *
 * Spec: `docs/features/client-app/compliance/service-statement-variables.json`.
 */

/** Where a variable's value comes from. Mirrors the variable schema's `source`. */
export type VariableSource = 'company_profile' | 'computed';

export interface DocumentVariables {
  /** Whatever `company_profile` holds, by the schema's `source_field` names. */
  profile: Record<string, string | null | undefined>;
  /** The document's own version, which the gate records against an acknowledgement. */
  version: string;
  /** Rendered as the statement date. ISO date, not a timestamp. */
  date: string;
}

export interface ResolvedDocument {
  /** The body with every `{{variable}}` replaced. Empty when `missing` is not. */
  body: string;
  /**
   * Placeholders that had no value.
   *
   * Non-empty means the document is not ready to show anyone. The caller
   * refuses rather than rendering a partially-substituted body.
   */
  missing: string[];
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/**
 * Maps a placeholder key to where its value lives.
 *
 * Derived from `service-statement-variables.json`. Explicit rather than
 * convention-based: `bts_legal_name` reads from `legal_name`, and a rule that
 * strips a `bts_` prefix would quietly break the first time a variable did not
 * follow it.
 */
const COMPANY_PROFILE_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  bts_legal_name: 'legal_name',
  bts_trading_name: 'trading_name',
  bts_abn: 'abn',
  bts_acn: 'acn',
  bts_registered_address: 'registered_address',
  bts_registered_state: 'registered_state',
  bts_registered_postcode: 'registered_postcode',
  bts_public_phone: 'public_phone',
  bts_public_email: 'public_email',
  bts_public_website: 'public_website',
  complaints_contact: 'complaints_contact',
  complaints_email: 'complaints_email',
  complaints_phone: 'complaints_phone',
  // Not a fact about the company but a commitment that a page exists, which is
  // why it lived in an environment variable until 20260916010000. It is
  // verified by a person before the document goes active either way, and a
  // second storage mechanism meant setting the same string on two Vercel
  // projects to publish one document.
  bts_privacy_policy_url: 'privacy_policy_url',
});

/** Keys the document computes rather than reads. */
const COMPUTED_KEYS = ['statement_version', 'statement_date'] as const;

/** Every placeholder the Service Statement may use. Exported for the seed test. */
export const DOCUMENT_VARIABLE_KEYS: readonly string[] = Object.freeze([
  ...Object.keys(COMPANY_PROFILE_FIELDS),
  ...COMPUTED_KEYS,
]);

function valueFor(key: string, variables: DocumentVariables): string | null {
  if (key === 'statement_version') return variables.version || null;
  if (key === 'statement_date') return variables.date || null;

  const field = COMPANY_PROFILE_FIELDS[key];
  if (!field) return null;

  const value = variables.profile[field];
  // An empty string is as missing as a null. A document rendering
  // "ABN " with nothing after it is not a finished document.
  return value && value.trim() !== '' ? value : null;
}

/**
 * Substitutes every placeholder, or reports which ones it could not.
 *
 * Never partially substitutes: if anything is missing, `body` is empty and
 * `missing` names the keys. That forces the caller to decide, rather than
 * letting a half-finished document reach a reader by default.
 */
export function resolveDocument(
  body: string,
  variables: DocumentVariables,
): ResolvedDocument {
  const missing = new Set<string>();

  PLACEHOLDER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER.exec(body)) !== null) {
    if (valueFor(match[1]!, variables) === null) missing.add(match[1]!);
  }

  if (missing.size > 0) return { body: '', missing: [...missing].sort() };

  return {
    body: body.replace(PLACEHOLDER, (_whole, key: string) => valueFor(key, variables)!),
    missing: [],
  };
}

/** Placeholders a body uses, whether or not they resolve. */
export function documentPlaceholders(body: string): string[] {
  const keys = new Set<string>();
  PLACEHOLDER.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER.exec(body)) !== null) keys.add(match[1]!);

  return [...keys].sort();
}
