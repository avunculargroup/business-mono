import { describe, expect, it } from 'vitest';
import type { Fact, PrepareTemplate } from '@platform/data';
import { composePack, packProgress, type ComposeInput } from './compose';
import type { StoredCitation, StoredPack, StoredResponse } from './store';

const NOW = new Date('2026-09-11T00:00:00Z');

const TEMPLATE: PrepareTemplate = {
  id: 't1',
  slug: 'trustee-minute',
  version: '1.0',
  title: 'Trustee minute',
  artefactType: 'trustee_minute',
  clientType: 'smsf',
  regulatoryReferences: ['SIS Reg 4.09'],
  factsRequired: ['btc_spot_aud', 'au_dap_licensing_status'],
  sections: [
    {
      id: 'matter',
      prompt: 'What matter was considered at this meeting?',
      why: 'A minute that does not name the matter records nothing.',
      facts: [],
      optional: false,
      acceptsCitations: false,
    },
    {
      id: 'valuation',
      prompt: 'What valuation approach was adopted, and on what source?',
      why: 'The auditor will ask, and the answer has to be the trustee’s own.',
      facts: ['btc_spot_aud', 'au_dap_licensing_status'],
      optional: false,
      acceptsCitations: false,
      regulatoryReference: 'SIS Reg 8.02B',
    },
    {
      id: 'resolution',
      prompt: 'What was resolved?',
      why: 'The resolution is the operative part of the minute.',
      facts: [],
      optional: false,
      // The precedent section: where Cite in a pack lands.
      acceptsCitations: true,
    },
  ],
};

const PACK: StoredPack = {
  id: 'p1',
  templateSlug: 'trustee-minute',
  templateVersion: '1.0',
  artefactType: 'trustee_minute',
  title: 'Minute of meeting — 11 September 2026',
  status: 'in_progress',
  createdAt: '2026-09-11T00:00:00Z',
  updatedAt: '2026-09-11T00:00:00Z',
};

const FACT: Fact = {
  key: 'btc_spot_aud',
  label: 'Bitcoin spot price (AUD)',
  value: '168,343',
  unit: 'AUD',
  asAt: '2026-09-10',
  sourceName: 'Coin Metrics',
  sourceUrl: 'https://example.test/cm',
  basis: 'observed',
  complianceClass: 'valuation_adjacent',
  expectedCadenceDays: 1,
};

function response(sectionId: string, body: string, skipped = false): StoredResponse {
  return {
    id: `p1:${sectionId}`,
    packId: 'p1',
    sectionId,
    body,
    skipped,
    updatedAt: '2026-09-11T00:00:00Z',
  };
}

function input(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    pack: PACK,
    template: TEMPLATE,
    responses: new Map([
      ['matter', response('matter', 'The trustees considered whether to acquire bitcoin.')],
      ['valuation', response('valuation', 'The trustees adopted the closing price.')],
      ['resolution', response('resolution', 'Resolved: to acquire, per the strategy.')],
    ]),
    facts: [FACT],
    absent: [
      {
        key: 'au_dap_licensing_status',
        label: 'Australian DAP licensing status',
        reason: 'source_unavailable',
        asAt: '2026-09-11T00:00:00Z',
      },
    ],
    identity: {
      legalName: 'Bitcoin Treasury Solutions Pty Ltd',
      tradingName: 'Bitcoin Treasury Solutions',
      abn: '00 000 000 000',
      acn: '000 000 000',
    },
    informationNotice: 'This document contains factual information only. It is not financial advice.',
    factsFetchedAt: '2026-09-11T00:00:00Z',
    citations: [],
    now: NOW,
    ...overrides,
  };
}

describe('front matter', () => {
  it('names the legal entity and its ABN, not the trading name', () => {
    // An export may be read by an auditor, and the ABN is often the only thing
    // that makes the entity identifiable.
    const markdown = composePack(input());

    expect(markdown).toContain('prepared_by: Bitcoin Treasury Solutions Pty Ltd');
    expect(markdown).toContain('abn: 00 000 000 000');
    expect(markdown).toContain('acn: 000 000 000');
  });

  it('claims no licence, because BTS holds none', () => {
    // An AFSL or AR number on an export would assert an authorisation BTS does
    // not have. There is no field for one, and this is the assertion that keeps
    // it that way if someone adds one back to CompanyIdentity.
    const markdown = composePack(input()).toLowerCase();

    for (const claim of ['afsl', 'licence', 'license', 'authorised representative']) {
      expect(markdown).not.toContain(claim);
    }
  });

  it('carries the information-only notice verbatim', () => {
    expect(composePack(input())).toContain(
      'This document contains factual information only. It is not financial advice.',
    );
  });

  it('heads the notice as information only, not as a general advice warning', () => {
    // "General advice warning" implies licensed general advice. Factual
    // information is a different thing, and the heading has to say which.
    const markdown = composePack(input());

    expect(markdown).toContain('> **Information only**');
    expect(markdown).not.toContain('General advice warning');
  });

  it('carries the template slug and version', () => {
    const markdown = composePack(input());

    expect(markdown).toContain('template: trustee-minute');
    expect(markdown).toContain('template_version: 1.0');
  });

  it('says so loudly when the company profile is not configured', () => {
    // An export with a plausible-looking wrong ABN is worse than one that
    // admits the gap, because the first one gets circulated.
    const markdown = composePack(input({ identity: null }));

    expect(markdown).toContain('NOT CONFIGURED');
    expect(markdown).toContain('not suitable for circulation');
  });
});

describe('facts', () => {
  it('renders a fact in its own labelled row, never inside a sentence', () => {
    const markdown = composePack(input());

    expect(markdown).toContain('| Bitcoin spot price (AUD) | 168,343 AUD | 2026-09-10 |');
  });

  it('binds a fact only to the section that declares it', () => {
    const markdown = composePack(input());
    const matterSection = markdown.slice(
      markdown.indexOf('## What matter was considered at this meeting'),
      markdown.indexOf('## What valuation approach was adopted'),
    );

    expect(matterSection).not.toContain('168,343');
  });

  it('lists a requested-but-unavailable fact as unavailable rather than omitting it', () => {
    const markdown = composePack(input());

    expect(markdown).toContain('| Australian DAP licensing status | not available |');
    expect(markdown).toContain('- Australian DAP licensing status — source unavailable');
  });
});

describe('skipped sections', () => {
  it('renders a skipped section as Not addressed rather than dropping it', () => {
    const responses = new Map([
      ['matter', response('matter', 'Considered.')],
      ['valuation', response('valuation', '', true)],
      ['resolution', response('resolution', 'Resolved.')],
    ]);

    const markdown = composePack(input({ responses }));

    // A minute with a visible gap tells the auditor exactly what to ask about,
    // which is the trustee's interest as well as everyone else's.
    expect(markdown).toContain('## What valuation approach was adopted');
    expect(markdown).toContain('*Not addressed.*');
  });

  it('treats an unanswered section the same as a skipped one', () => {
    const markdown = composePack(input({ responses: new Map() }));

    expect(markdown.match(/\*Not addressed\.\*/g)).toHaveLength(3);
  });
});

describe('the provenance appendix', () => {
  it('states every fact with its source, date and basis', () => {
    const markdown = composePack(input());
    const appendix = markdown.slice(markdown.indexOf('## Provenance appendix'));

    expect(appendix).toContain('Coin Metrics (https://example.test/cm)');
    expect(appendix).toContain('observed');
    expect(appendix).toContain('2026-09-10');
  });

  it('flags a fact that is past its expected cadence', () => {
    const stale: Fact = { ...FACT, asAt: '2026-08-01', expectedCadenceDays: 1 };
    const appendix = composePack(input({ facts: [stale] }));

    expect(appendix).toContain('past its expected cadence');
  });

  it('does not flag a fact within its cadence', () => {
    expect(composePack(input())).not.toContain('past its expected cadence');
  });

  it('says when no facts were served at all', () => {
    const markdown = composePack(input({ facts: [], absent: [] }));

    expect(markdown).toContain('No facts were served for this document.');
  });
});

describe('the composed document as a whole', () => {
  it('contains no recommendation, in any generated line', () => {
    // The generated scaffolding must never state a conclusion. The
    // subscriber's own prose is their business; everything around it is ours.
    const markdown = composePack(input({ responses: new Map() }));

    for (const phrase of ['we recommend', 'you should', 'the appropriate allocation']) {
      expect(markdown.toLowerCase()).not.toContain(phrase);
    }
  });

  it('keeps every section heading from the template, in order', () => {
    const markdown = composePack(input());
    const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

    expect(headings).toEqual([
      'What matter was considered at this meeting',
      'What valuation approach was adopted, and on what source',
      'What was resolved',
      'Provenance appendix',
    ]);
  });

  it('renders a section regulatory reference inline', () => {
    expect(composePack(input())).toContain('*SIS Reg 8.02B*');
  });
});

describe('cited precedent', () => {
  const CITATION: StoredCitation = {
    id: 'p1:register:an-entity:0',
    packId: 'p1',
    entitySlug: 'an-entity',
    entityName: 'An Entity Ltd',
    fact: {
      key: 'register:an-entity:0',
      label: 'Custody',
      value: 'Third-party qualified custodian',
      asAt: '2026-06-30',
      sourceName: 'Annual report 2026',
      basis: 'reported',
      complianceClass: 'neutral',
    },
    citedAt: '2026-09-01T00:00:00Z',
  };

  it('lands only in the section that accepts citations', () => {
    const markdown = composePack(input({ citations: [CITATION] }));

    const beforeResolution = markdown.slice(0, markdown.indexOf('## What was resolved'));
    expect(beforeResolution).not.toContain('An Entity Ltd');
    expect(markdown).toContain('An Entity Ltd');
  });

  it('carries the entity, the value, the date and the source', () => {
    const markdown = composePack(input({ citations: [CITATION] }));

    expect(markdown).toContain(
      '| An Entity Ltd | Custody | Third-party qualified custodian | 2026-06-30 | Annual report 2026 |',
    );
  });

  it('says the precedent is implementation, never outcome', () => {
    // The pack has to carry the distinction, not just the register page. A
    // reader of the exported document never saw the interface.
    const markdown = composePack(input({ citations: [CITATION] }));

    expect(markdown).toContain('never how it went for them');
  });

  it('lists cited facts apart from bound ones in the appendix', () => {
    const markdown = composePack(input({ citations: [CITATION] }));
    const appendix = markdown.slice(markdown.indexOf('## Provenance appendix'));

    expect(appendix).toContain('### Cited from the register');
    // A reader checking the argument should be able to tell which evidence the
    // author selected and which the template supplied.
    expect(appendix).toContain('selected by the author');
  });

  it('records the citation date as well as the as-at date', () => {
    // The open question made visible: refresh surfaces a changed value, and
    // nothing detects that the sentence written against the old one no longer
    // follows. The dates are what lets a reader notice.
    const appendix = composePack(input({ citations: [CITATION] }));

    expect(appendix).toContain('| 2026-06-30 |');
    expect(appendix).toContain('| 2026-09-01 |');
    expect(appendix).toContain('written against the value as at the citation');
  });

  it('adds no precedent block at all when nothing is cited', () => {
    const markdown = composePack(input({ citations: [] }));

    expect(markdown).not.toContain('Precedent, cited from the register');
    expect(markdown).not.toContain('### Cited from the register');
  });
});

describe('packProgress', () => {
  it('counts answered and skipped separately', () => {
    const responses = new Map([
      ['matter', response('matter', 'Considered.')],
      ['valuation', response('valuation', '', true)],
    ]);

    expect(packProgress(TEMPLATE, responses)).toEqual({ answered: 1, skipped: 1, total: 3 });
  });

  it('does not count whitespace as an answer', () => {
    const responses = new Map([['matter', response('matter', '   \n  ')]]);

    expect(packProgress(TEMPLATE, responses)).toEqual({ answered: 0, skipped: 0, total: 3 });
  });
});
