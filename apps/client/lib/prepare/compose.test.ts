import { describe, expect, it } from 'vitest';
import type { Fact, PrepareTemplate } from '@platform/data';
import { composePack, packProgress, type ComposeInput } from './compose';
import type { StoredPack, StoredResponse } from './store';

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
    },
    {
      id: 'valuation',
      prompt: 'What valuation approach was adopted, and on what source?',
      why: 'The auditor will ask, and the answer has to be the trustee’s own.',
      facts: ['btc_spot_aud', 'au_dap_licensing_status'],
      optional: false,
      regulatoryReference: 'SIS Reg 8.02B',
    },
    {
      id: 'resolution',
      prompt: 'What was resolved?',
      why: 'The resolution is the operative part of the minute.',
      facts: [],
      optional: false,
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
      arNumber: 'AR-123456',
      licenceHolder: 'Example Licensee Pty Ltd',
      licenceNumber: '000000',
    },
    generalAdviceWarning: 'This document contains general information only.',
    factsFetchedAt: '2026-09-11T00:00:00Z',
    now: NOW,
    ...overrides,
  };
}

describe('front matter', () => {
  it('names the legal entity and its ABN, not the trading name', () => {
    // Every export is potentially a regulatory artefact, and the ABN is often
    // the only thing that makes the entity identifiable.
    const markdown = composePack(input());

    expect(markdown).toContain('prepared_by: Bitcoin Treasury Solutions Pty Ltd');
    expect(markdown).toContain('abn: 00 000 000 000');
    expect(markdown).toContain('authorised_representative_number: AR-123456');
  });

  it('carries the general advice warning verbatim', () => {
    expect(composePack(input())).toContain('This document contains general information only.');
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
