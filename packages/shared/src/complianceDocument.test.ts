import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_VARIABLE_KEYS,
  documentPlaceholders,
  resolveDocument,
  type DocumentVariables,
} from './complianceDocument.js';

const PROFILE = {
  legal_name: 'Bitcoin Treasury Solutions Pty Ltd',
  trading_name: 'Bitcoin Treasury Solutions',
  abn: '00 000 000 000',
  acn: '000 000 000',
  registered_address: '1 Example Street',
  registered_state: 'VIC',
  registered_postcode: '3000',
  public_phone: '+61 3 0000 0000',
  public_email: 'hello@example.test',
  public_website: 'https://example.test',
  complaints_contact: 'The Directors',
  complaints_email: 'complaints@example.test',
  complaints_phone: '+61 3 0000 0001',
  privacy_policy_url: 'https://example.test/privacy',
};

function variables(overrides: Partial<DocumentVariables> = {}): DocumentVariables {
  return {
    profile: PROFILE,
    version: '1.0',
    date: '2026-09-11',
    ...overrides,
  };
}

describe('resolveDocument', () => {
  it('substitutes a value from the company profile', () => {
    const { body } = resolveDocument('ABN {{bts_abn}}', variables());

    expect(body).toBe('ABN 00 000 000 000');
  });

  it('substitutes the document version and date', () => {
    const { body } = resolveDocument(
      'Version {{statement_version}} · {{statement_date}}',
      variables(),
    );

    expect(body).toBe('Version 1.0 · 2026-09-11');
  });

  it('substitutes the privacy policy URL, which is a profile field like any other', () => {
    const { body } = resolveDocument('See {{bts_privacy_policy_url}}', variables());

    expect(body).toBe('See https://example.test/privacy');
  });

  it('substitutes every occurrence, not just the first', () => {
    const { body } = resolveDocument('{{bts_acn}} and {{bts_acn}}', variables());

    expect(body).toBe('000 000 000 and 000 000 000');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(resolveDocument('{{ bts_abn }}', variables()).body).toBe('00 000 000 000');
  });
});

describe('a document that cannot be fully resolved', () => {
  it('names the missing keys', () => {
    const { missing } = resolveDocument(
      'ABN {{bts_abn}}, ACN {{bts_acn}}',
      variables({ profile: { ...PROFILE, abn: null, acn: undefined } }),
    );

    expect(missing).toEqual(['bts_abn', 'bts_acn']);
  });

  it('returns no body at all rather than a partial one', () => {
    // A half-substituted document looks finished and is not. Returning nothing
    // forces the caller to decide, instead of letting "ABN {{bts_abn}}" reach a
    // subscriber because someone forgot to check.
    const { body } = resolveDocument(
      'ABN {{bts_abn}}, trading as {{bts_trading_name}}',
      variables({ profile: { ...PROFILE, abn: null } }),
    );

    expect(body).toBe('');
  });

  it('treats an empty string as missing', () => {
    // "ABN " with nothing after it is not a finished document either.
    const { missing } = resolveDocument(
      '{{bts_abn}}',
      variables({ profile: { ...PROFILE, abn: '   ' } }),
    );

    expect(missing).toEqual(['bts_abn']);
  });

  it('treats an unknown placeholder as missing rather than leaving it in place', () => {
    const { missing } = resolveDocument('{{not_a_real_variable}}', variables());

    expect(missing).toEqual(['not_a_real_variable']);
  });

  it('reports a repeated missing key once', () => {
    const { missing } = resolveDocument(
      '{{bts_abn}} {{bts_abn}}',
      variables({ profile: { ...PROFILE, abn: null } }),
    );

    expect(missing).toEqual(['bts_abn']);
  });

  it('resolves a body with no placeholders at all', () => {
    const { body, missing } = resolveDocument('Plain text.', variables());

    expect(body).toBe('Plain text.');
    expect(missing).toEqual([]);
  });
});

describe('documentPlaceholders', () => {
  it('lists the keys a body uses, sorted and deduplicated', () => {
    expect(documentPlaceholders('{{b}} {{a}} {{b}}')).toEqual(['a', 'b']);
  });

  it('returns nothing for a body with none', () => {
    expect(documentPlaceholders('Plain text.')).toEqual([]);
  });
});

describe('the declared variable set', () => {
  it('covers every key the resolver can source', () => {
    // Guards the seed test next door: a template using a key absent from here
    // would fail to resolve at the gate rather than at build time.
    const body = DOCUMENT_VARIABLE_KEYS.map((key) => `{{${key}}}`).join(' ');

    expect(resolveDocument(body, variables()).missing).toEqual([]);
  });
});
