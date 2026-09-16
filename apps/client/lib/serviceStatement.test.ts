import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOCUMENT_VARIABLE_KEYS,
  documentPlaceholders,
  resolveDocument,
} from '@platform/shared';

/**
 * The seeded Service Statement, checked against the resolver that renders it.
 *
 * The statement is a string in a migration and its variables are a map in
 * TypeScript, and nothing connects the two at compile time. The failure mode is
 * not a crash: it is the blocking gate refusing to render on launch day,
 * because a placeholder nobody wired up came back missing.
 *
 * This is also where the document's own claims about the product get checked.
 * Section 2 says BTS is not licensed; section 3 says there is no facility to
 * enter personal circumstances; section 5 says prepared documents stay on the
 * device. Every subscriber acknowledges those before using the service, so a
 * statement that drifts from what the app does is worse than no statement.
 */
const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url));

function seededStatement(): string {
  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const parts = sql.split('$statement$');
    if (parts.length >= 3) return parts[1]!;
  }
  throw new Error('No seeded Service Statement found in supabase/migrations');
}

const BODY = seededStatement();

/**
 * The body with runs of whitespace collapsed.
 *
 * The statement is hard-wrapped prose, so a sentence the document states in one
 * breath is two lines in the file. Asserting against the raw text means every
 * claim below is really an assertion about where the author pressed return,
 * and it breaks on a reflow that changed nothing.
 */
const PROSE = BODY.replace(/\s+/g, ' ');

describe('the seeded Service Statement', () => {
  it('was found, so the cases below assert something', () => {
    expect(BODY.length).toBeGreaterThan(1000);
  });

  it('uses only placeholders the resolver can source', () => {
    // A placeholder the resolver does not know comes back missing, and a
    // missing placeholder blocks the gate. Caught here rather than on launch
    // day.
    const unknown = documentPlaceholders(BODY).filter(
      (key) => !DOCUMENT_VARIABLE_KEYS.includes(key),
    );

    expect(unknown).toEqual([]);
  });

  it('resolves completely once the company profile is filled', () => {
    const filled = Object.fromEntries(
      [
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
        // A column as of 20260916010000, not an environment variable. The
        // statement resolves from one source now.
        'privacy_policy_url',
      ].map((field) => [field, 'value']),
    );

    const { body, missing } = resolveDocument(BODY, {
      profile: filled,
      version: '0.1',
      date: '2026-09-11',
    });

    expect(missing).toEqual([]);
    expect(body).not.toContain('{{');
  });

  it('refuses to render at all while the profile is empty', () => {
    // Fails closed. An unfilled profile means the gate says "not available"
    // rather than showing a subscriber "ABN {{bts_abn}}".
    const { body, missing } = resolveDocument(BODY, {
      profile: {},
      version: '0.1',
      date: '2026-09-11',
    });

    expect(body).toBe('');
    expect(missing.length).toBeGreaterThan(0);
  });
});

describe('what the statement claims about the product', () => {
  it('states the not-advice position without hedging', () => {
    // Section 2 is the whole document. Hedging it would weaken the only thing
    // it is for.
    expect(PROSE).toContain('It does not provide financial advice of any kind.');
    expect(PROSE).toContain('we do not hold an Australian Financial Services Licence');
  });

  it('claims no facility to receive personal circumstances', () => {
    // Section 3, and it is a claim about `client_accounts` rather than about
    // conduct. The tripwire comment in the client tables migration is the other
    // half of this.
    expect(PROSE).toContain('Minute has no facility for you to tell us');
  });

  it('promises prepared documents stay on the device', () => {
    // Section 5. Keepable only because of the two-layer model, which
    // lib/prepare/prose.test.ts asserts structurally.
    expect(PROSE).toContain('They are not sent to us, we cannot read them');
  });

  it('promises every fact carries a link', () => {
    // Section 7. A commitment the provenance rail already meets — and one not
    // to make if a surface ever ships without sources.
    expect(PROSE).toContain('every fact in Minute carries a link');
  });

  it('describes the register as precedent rather than investment research', () => {
    // Section 4, carrying implementation-facts-not-outcome-facts in plain
    // language. If the register ever shows current value, this stops being true.
    expect(PROSE).toContain('It is not investment research');
  });

  it('states the subscription is the only revenue', () => {
    expect(PROSE).toContain('Your subscription fee is our only revenue from Minute.');
  });

  it('does not point a subscriber at AFCA', () => {
    // AFCA handles complaints about financial firms. Referring subscribers
    // there would imply a status BTS does not have; Australian Consumer Law is
    // the correct reference and the statement uses it.
    expect(PROSE).not.toContain('AFCA');
    expect(PROSE).toContain('Australian Consumer Law');
  });

  it('never calls itself a Financial Services Guide', () => {
    expect(PROSE).not.toContain('Financial Services Guide');
  });
});
