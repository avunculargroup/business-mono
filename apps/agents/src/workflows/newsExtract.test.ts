import { describe, it, expect, vi, beforeEach } from 'vitest';

// extractNewsMetadata builds its Agent internally, so stub the class and
// capture the prompts it is handed across attempts.
const generateMock = vi.fn();

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    generate = generateMock;
  },
}));
vi.mock('../config/model.js', () => ({
  dynamicModelFor: vi.fn(() => vi.fn()),
  stepRequestContext: vi.fn((key: string) => ({ key })),
}));

const { newsExtractionSchema, extractNewsMetadata } = await import('./newsExtract.js');

// The summary from the Riot Platforms collateral article that failed extraction
// against the old max(500): a well-formed 2–3 sentence summary, 503 characters.
const REAL_503_CHAR_SUMMARY =
  'Riot Platforms pledged additional Bitcoin as collateral following a price drop earlier in the year, ' +
  'but a recent rally has pushed the loan-to-value ratio low enough that the company could potentially ' +
  'reclaim a significant portion of the pledged BTC, depending on the terms of its credit agreement. ' +
  "The mechanics of the loan demonstrate how a Bitcoin miner's treasury liquidity is directly affected " +
  "by the asset's price. The structure is also used on a larger scale by other miners like Marathon Digital.";

const validExtraction = (summary: string) => ({
  category: 'international' as const,
  summary,
  key_points: ['Riot had 5,821 BTC pledged against a $200 million loan.', 'The estimated LTV fell to 44.1%.'],
  topic_tags: ['bitcoin-mining', 'corporate-treasury'],
  australian_relevance: false,
  bitcoin_relevance: true,
});

describe('newsExtractionSchema summary', () => {
  it('accepts the 503-character summary the old max(500) rejected', () => {
    expect(REAL_503_CHAR_SUMMARY).toHaveLength(503);
    expect(newsExtractionSchema.safeParse(validExtraction(REAL_503_CHAR_SUMMARY)).success).toBe(true);
  });

  it('accepts a summary well past the old cap', () => {
    // 814 chars is the longest summary already stored in news_items.
    expect(newsExtractionSchema.safeParse(validExtraction('x'.repeat(814))).success).toBe(true);
  });

  it('still rejects a summary under the 40-character floor', () => {
    expect(newsExtractionSchema.safeParse(validExtraction('Too short.')).success).toBe(false);
  });
});

describe('extractNewsMetadata', () => {
  beforeEach(() => {
    generateMock.mockReset();
  });

  const input = { title: 'Riot pledges more BTC', source: 'CoinDesk', content: 'Article body.' };

  it('returns the object without retrying when the first attempt validates', async () => {
    generateMock.mockResolvedValueOnce({ object: validExtraction(REAL_503_CHAR_SUMMARY) });

    const result = await extractNewsMetadata(input);

    expect(result.data?.summary).toBe(REAL_503_CHAR_SUMMARY);
    expect(result.reason).toBeNull();
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('tells the model which constraint failed when it retries', async () => {
    const validationError = 'Structured output validation failed: - summary: String must contain at most 500 character(s)';
    generateMock.mockRejectedValueOnce(new Error(validationError));
    generateMock.mockResolvedValueOnce({ object: validExtraction(REAL_503_CHAR_SUMMARY) });

    const result = await extractNewsMetadata(input);

    expect(result.data).not.toBeNull();
    expect(generateMock).toHaveBeenCalledTimes(2);

    // The retry prompt must carry the specific failure, not a generic nudge —
    // otherwise the model reproduces the same invalid output.
    const retryPrompt = generateMock.mock.calls[1]?.[0][0].content as string;
    expect(retryPrompt).toContain(validationError);
  });

  it('reports the last error after both attempts fail', async () => {
    generateMock.mockRejectedValue(new Error('still wrong'));

    const result = await extractNewsMetadata(input);

    expect(result.data).toBeNull();
    expect(result.reason).toBe('still wrong');
    expect(generateMock).toHaveBeenCalledTimes(2);
  });
});
