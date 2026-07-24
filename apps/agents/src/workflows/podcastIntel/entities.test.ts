import { describe, it, expect } from 'vitest';
import { extractMentionedCompanies } from './entities.js';
import type { MentionedCompany } from '@platform/shared';

const co = (id: string, name: string, slug = id): MentionedCompany => ({ id, slug, name });

describe('extractMentionedCompanies', () => {
  it('matches a company named in the transcript, case-insensitively', () => {
    const companies = [co('c-1', 'MicroStrategy'), co('c-2', 'Acme Corp')];
    const result = extractMentionedCompanies('The host discussed microstrategy at length.', companies);
    expect(result).toEqual([{ id: 'c-1', slug: 'c-1', name: 'MicroStrategy' }]);
  });

  it('requires a whole-token match, so "Block" does not match "Blockchain"', () => {
    const result = extractMentionedCompanies('We talked about blockchain scaling.', [co('c-1', 'Block')]);
    expect(result).toEqual([]);
  });

  it('matches a name bounded by punctuation', () => {
    const result = extractMentionedCompanies('Guest from (Block) joined.', [co('c-1', 'Block')]);
    expect(result).toHaveLength(1);
  });

  it('tolerates punctuation inside the stored name', () => {
    const result = extractMentionedCompanies('Earnings from Block, Inc. were strong.', [co('c-1', 'Block, Inc.')]);
    expect(result).toHaveLength(1);
  });

  it('skips names shorter than the minimum length (false-positive guard)', () => {
    const result = extractMentionedCompanies('The BT network expanded.', [co('c-1', 'BT')]);
    expect(result).toEqual([]);
  });

  it('de-dupes by id and preserves gazetteer order', () => {
    const companies = [co('c-1', 'Alpha'), co('c-2', 'Beta'), co('c-1', 'Alpha')];
    const result = extractMentionedCompanies('alpha and beta and alpha again', companies);
    expect(result.map((c) => c.id)).toEqual(['c-1', 'c-2']);
  });

  it('returns nothing for an empty or missing transcript', () => {
    expect(extractMentionedCompanies('', [co('c-1', 'Alpha')])).toEqual([]);
    expect(extractMentionedCompanies(null, [co('c-1', 'Alpha')])).toEqual([]);
    expect(extractMentionedCompanies('alpha', [])).toEqual([]);
  });
});
