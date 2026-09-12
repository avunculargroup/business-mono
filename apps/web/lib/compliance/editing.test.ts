import { describe, expect, it } from 'vitest';
import {
  checkTemplateBody,
  frozenReason,
  isBodyEditable,
  isValidVersion,
  suggestNextVersion,
  withVersion,
} from './editing';

const FACT_KEYS = ['btc_spot_aud', 'au_cash_rate'];

const VALID = `---
slug: a-template
version: 1.0
artefact_type: board_paper
client_type: corporate
title: A template
facts_required:
  - btc_spot_aud
---

::section id=purpose
prompt: What decision is being sought?
why: A paper that does not name the decision invites the reader to infer one.
facts: [btc_spot_aud]
::
`;

describe('isBodyEditable', () => {
  it.each(['draft', 'under_review', 'lex_review', 'approved'])('allows %s', (status) => {
    expect(isBodyEditable(status)).toBe(true);
  });

  it.each(['active', 'published', 'superseded', 'archived'])('freezes %s', (status) => {
    expect(isBodyEditable(status)).toBe(false);
  });

  it('covers both tables, which spell the live state differently', () => {
    expect(isBodyEditable('active')).toBe(false);
    expect(isBodyEditable('published')).toBe(false);
  });
});

describe('frozenReason', () => {
  it('says nothing about an editable row', () => {
    expect(frozenReason('draft')).toBeNull();
  });

  it('points a live row at a new version', () => {
    expect(frozenReason('active')).toMatch(/new version/);
  });

  it('does not offer a new version for a retired one', () => {
    // There is no reason to edit an archived statement and every reason not to.
    expect(frozenReason('archived')).not.toMatch(/new version/);
    expect(frozenReason('archived')).toMatch(/evidence/);
  });
});

describe('suggestNextVersion', () => {
  it('bumps the minor component', () => {
    expect(suggestNextVersion('0.1')).toBe('0.2');
    expect(suggestNextVersion('1.0')).toBe('1.1');
    expect(suggestNextVersion('2.9')).toBe('2.10');
  });

  it('tolerates surrounding whitespace', () => {
    expect(suggestNextVersion(' 1.0 ')).toBe('1.1');
  });

  it('declines to guess at a scheme it does not recognise', () => {
    // Guessing at "2026-Q3-final" produces something worse than a prompt.
    expect(suggestNextVersion('2026-Q3')).toBeNull();
    expect(suggestNextVersion('1.0.0')).toBeNull();
    expect(suggestNextVersion('')).toBeNull();
  });
});

describe('isValidVersion', () => {
  it('accepts what the seeds use', () => {
    expect(isValidVersion('0.1')).toBe(true);
    expect(isValidVersion('2026-06')).toBe(true);
    expect(isValidVersion('1.0-draft')).toBe(true);
  });

  it('rejects empty and whitespace-only', () => {
    expect(isValidVersion('')).toBe(false);
    expect(isValidVersion('   ')).toBe(false);
  });

  it('rejects a sentence, because it renders next to a title', () => {
    expect(isValidVersion('the one we sent in June, probably')).toBe(false);
    expect(isValidVersion('1.0\n2.0')).toBe(false);
  });
});

describe('checkTemplateBody', () => {
  it('passes a valid body', () => {
    const { ok, problems } = checkTemplateBody(VALID, FACT_KEYS);

    expect(ok).toBe(true);
    expect(problems).toEqual([]);
  });

  it('hands back the parse, so the save path does not parse a second time', () => {
    // Two parses would be two chances for facts_required and the body to
    // disagree about what the body says, and the adapter reads the column.
    const { parsed } = checkTemplateBody(VALID, FACT_KEYS);

    expect(parsed.factsRequired).toEqual(['btc_spot_aud']);
    expect(parsed.sections.map((section) => section.id)).toEqual(['purpose']);
  });

  it('catches a prompt that is not a question', () => {
    const body = VALID.replace(
      'prompt: What decision is being sought?',
      'prompt: State the decision being sought.',
    );

    const { ok, problems } = checkTemplateBody(body, FACT_KEYS);

    expect(ok).toBe(false);
    expect(problems[0]?.message).toMatch(/must be a question/);
  });

  it('catches a fact key no source provides', () => {
    const body = VALID.replace('- btc_spot_aud', '- btc_unrealised_gain').replace(
      'facts: [btc_spot_aud]',
      'facts: [btc_unrealised_gain]',
    );

    const { problems } = checkTemplateBody(body, FACT_KEYS);

    expect(problems.some((p) => p.message.includes('btc_unrealised_gain'))).toBe(true);
  });

  it('catches a prohibited conclusion', () => {
    const body = VALID.replace('why: A paper', 'why: We recommend it. A paper');

    const { ok, problems } = checkTemplateBody(body, FACT_KEYS);

    expect(ok).toBe(false);
    expect(problems.some((p) => p.message.includes('prohibited conclusion'))).toBe(true);
  });

  it('reports every problem, not only the first', () => {
    const body = VALID.replace('prompt: What decision is being sought?', 'prompt: Do it.').replace(
      'why: A paper that does not name the decision invites the reader to infer one.',
      'why:',
    );

    const { problems } = checkTemplateBody(body, FACT_KEYS);

    expect(problems.length).toBeGreaterThan(1);
  });

  it('does not throw on a body that is not a template at all', () => {
    // Someone will paste prose into the box. It must come back as problems, not
    // as a crash on the save path.
    const { ok, problems } = checkTemplateBody('just some text', FACT_KEYS);

    expect(ok).toBe(false);
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe('withVersion', () => {
  it('rewrites the front-matter version', () => {
    expect(withVersion(VALID, '1.1')).toContain('version: 1.1');
    expect(withVersion(VALID, '1.1')).not.toContain('version: 1.0');
  });

  it('leaves the rest of the body alone', () => {
    const rewritten = withVersion(VALID, '1.1');

    expect(rewritten).toContain('::section id=purpose');
    expect(rewritten).toContain('slug: a-template');
  });

  it('does not touch a version-looking line outside the front matter', () => {
    // The front matter is the part the parser reads. A section that happens to
    // mention a version is prose.
    const body = `${VALID}\n::section id=other\nprompt: Which version applies?\nwhy: version: 9.9 in prose.\nfacts: []\n::\n`;
    const rewritten = withVersion(body, '1.1');

    expect(rewritten).toContain('version: 9.9 in prose');
  });

  it('leaves a body with no front matter untouched', () => {
    expect(withVersion('no front matter here', '1.1')).toBe('no front matter here');
  });
});
