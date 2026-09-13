import { describe, expect, it } from 'vitest';
import {
  PROHIBITED_CONCLUSIONS,
  parseTemplate,
  validateTemplate,
  type ParsedTemplate,
} from './prepare.js';

const KNOWN = ['btc_spot_aud', 'btc_realised_vol_90d'];

const VALID = `---
slug: board-paper-treasury
version: 1.3
artefact_type: board_paper
client_type: corporate
title: Board paper — bitcoin as a treasury asset
regulatory_references:
  - AASB 138
  - Corporations Amendment (Digital Assets Framework) Act 2026
facts_required:
  - btc_spot_aud
  - btc_realised_vol_90d
---

::section id=purpose
prompt: What decision, if any, is being sought from the board at this meeting?
why: >
  A paper that does not name the decision invites the board to infer one.
  Naming it — including "no decision is sought at this meeting" — is what
  makes the paper safe to table.
facts: []
::

::section id=market-context
prompt: >
  What context does the board need about current conditions, and what
  period are you asking them to consider?
why: >
  Boards read a single price as a recommendation. Framing the period
  yourself is how you stop them doing that.
facts: [btc_spot_aud, btc_realised_vol_90d]
::
`;

describe('parseTemplate', () => {
  it('reads the front matter', () => {
    const parsed = parseTemplate(VALID);

    expect(parsed.slug).toBe('board-paper-treasury');
    expect(parsed.version).toBe('1.3');
    expect(parsed.artefactType).toBe('board_paper');
    expect(parsed.clientType).toBe('corporate');
    expect(parsed.title).toBe('Board paper — bitcoin as a treasury asset');
    expect(parsed.regulatoryReferences).toEqual([
      'AASB 138',
      'Corporations Amendment (Digital Assets Framework) Act 2026',
    ]);
    expect(parsed.factsRequired).toEqual(['btc_spot_aud', 'btc_realised_vol_90d']);
  });

  it('reads every section block in order', () => {
    const parsed = parseTemplate(VALID);

    expect(parsed.sections.map((s) => s.id)).toEqual(['purpose', 'market-context']);
  });

  it('folds a `>` block into one line', () => {
    const parsed = parseTemplate(VALID);

    expect(parsed.sections[0]!.why).toBe(
      'A paper that does not name the decision invites the board to infer one. '
        + 'Naming it — including "no decision is sought at this meeting" — is what '
        + 'makes the paper safe to table.',
    );
  });

  it('reads both list forms', () => {
    const parsed = parseTemplate(VALID);

    expect(parsed.sections[0]!.facts).toEqual([]);
    expect(parsed.sections[1]!.facts).toEqual(['btc_spot_aud', 'btc_realised_vol_90d']);
  });

  it('defaults optional to false', () => {
    expect(parseTemplate(VALID).sections[0]!.optional).toBe(false);
  });

  it('survives a body with no front matter rather than throwing', () => {
    const parsed = parseTemplate('::section id=a\nprompt: Why?\nwhy: Because.\nfacts: []\n::\n');

    expect(parsed.slug).toBe('');
    expect(parsed.sections).toHaveLength(1);
  });
});

describe('validateTemplate', () => {
  function check(template: ParsedTemplate, body: string) {
    return validateTemplate(template, body, KNOWN).map((p) => p.message);
  }

  it('passes a valid template', () => {
    expect(check(parseTemplate(VALID), VALID)).toEqual([]);
  });

  it('rejects a prompt that is not a question', () => {
    const body = VALID.replace(
      'prompt: What decision, if any, is being sought from the board at this meeting?',
      'prompt: Describe the decision being sought.',
    );

    expect(check(parseTemplate(body), body)).toContainEqual(
      expect.stringContaining('must be a question'),
    );
  });

  it('rejects a missing why', () => {
    const body = VALID.replace(/why: >\n(  .*\n)+/, '');

    expect(check(parseTemplate(body), body)).toContainEqual(
      expect.stringContaining('why is required'),
    );
  });

  it('rejects a fact bound in a section but absent from facts_required', () => {
    const body = VALID.replace('facts: [btc_spot_aud, btc_realised_vol_90d]', 'facts: [btc_spot_gbp]');

    expect(check(parseTemplate(body), body)).toContainEqual(
      expect.stringContaining("binds fact 'btc_spot_gbp'"),
    );
  });

  it('rejects a facts_required key no source provides', () => {
    const body = VALID.replace('  - btc_realised_vol_90d', '  - au_dap_licensing_status');

    expect(check(parseTemplate(body), body)).toContainEqual(
      expect.stringContaining("names 'au_dap_licensing_status'"),
    );
  });

  it('rejects a duplicate section id, because responses would collide', () => {
    const body = VALID.replace('::section id=market-context', '::section id=purpose');

    expect(check(parseTemplate(body), body)).toContainEqual(
      expect.stringContaining('duplicate section id'),
    );
  });

  it.each(PROHIBITED_CONCLUSIONS)('rejects the prohibited phrase %s', (phrase) => {
    const body = VALID.replace('facts: []', `facts: []\nnote: ${phrase} something\n`);

    expect(check(parseTemplate(body), body)).toContainEqual(
      expect.stringContaining('prohibited conclusion'),
    );
  });

  it('catches a prohibited phrase whatever its case', () => {
    const body = VALID.replace('Boards read', 'We Recommend that boards read');

    expect(check(parseTemplate(body), body)).toContainEqual(
      expect.stringContaining('prohibited conclusion'),
    );
  });

  it('reports every problem at once rather than the first', () => {
    const body = `---
slug:
version:
title:
---
`;

    expect(check(parseTemplate(body), body).length).toBeGreaterThan(3);
  });
});
