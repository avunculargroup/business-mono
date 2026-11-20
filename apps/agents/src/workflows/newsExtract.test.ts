import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  key_points: [
    { text: 'Riot had 5,821 BTC pledged against a $200 million loan.', kind: 'new' as const },
    { text: 'The estimated LTV fell to 44.1%.', kind: 'new' as const, asOf: '2026-06' },
  ],
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

describe('newsExtractionSchema key_points', () => {
  const summary = 'x'.repeat(100);

  it('requires each point to carry a kind', () => {
    const legacy = { ...validExtraction(summary), key_points: ['a bare string', 'another'] };
    expect(newsExtractionSchema.safeParse(legacy).success).toBe(false);
  });

  it('accepts background and opinion points, with asOf optional', () => {
    const parsed = newsExtractionSchema.safeParse({
      ...validExtraction(summary),
      key_points: [
        { text: 'The RBA raised the cash rate by 25 basis points to 4.60% in its last meeting.', kind: 'background', asOf: '2026-09-30' },
        { text: 'A further hike is likely.', kind: 'opinion' },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a kind outside new/background/opinion', () => {
    const bad = { ...validExtraction(summary), key_points: [{ text: 'a', kind: 'rumour' }, { text: 'b', kind: 'new' }] };
    expect(newsExtractionSchema.safeParse(bad).success).toBe(false);
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

// ── Freshness: asOf in code, a 'new' point on every fresh item, roundups ─────

const PUBLISHED = '2026-11-17T18:52:35Z'; // 2026-11-18 in Melbourne
const NOW = new Date('2026-11-17T19:40:00Z');

const promptOf = (callIndex: number) => generateMock.mock.calls[callIndex]?.[0][0].content as string;

describe('extractNewsMetadata — asOf and freshness', () => {
  beforeEach(() => {
    generateMock.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const input = { title: 'RBA split over rates', source: 'Newsletter', content: 'Body.', publishedAt: PUBLISHED };
  const withPoints = (key_points: unknown[]) => ({ object: { ...validExtraction(REAL_503_CHAR_SUMMARY), key_points } });

  it('shows the model the Melbourne publication date', async () => {
    generateMock.mockResolvedValueOnce(withPoints([{ text: 'a', kind: 'new' }, { text: 'b', kind: 'new' }]));
    await extractNewsMetadata(input);
    expect(promptOf(0)).toContain('Published: 2026-11-18 (Australia/Melbourne)');
  });

  it('stamps new points with the publication date and validates the rest', async () => {
    generateMock.mockResolvedValueOnce(withPoints([
      { text: 'Minutes show three members dissented', kind: 'new', asOf: '2023-11-07' },
      { text: 'The vote was 6–3', kind: 'background', asOf: '2026-11-03' },
      { text: 'Unemployment is 4.7%', kind: 'background', asOf: 'present' },
      { text: 'Rates will stay on hold into 2027', kind: 'opinion', asOf: '2027' },
    ]));
    const { data, flags } = await extractNewsMetadata(input);
    expect(data!.key_points.map((p) => p.asOf)).toEqual(['2026-11-18', '2026-11-03', null, null]);
    expect(flags).toEqual([]);
  });

  it('retries once, naming the gap, when a fresh item has no new point', async () => {
    generateMock.mockResolvedValueOnce(withPoints([
      { text: 'The RBA lifted the cash rate to 4.85% in a 6–3 vote', kind: 'background' },
      { text: 'Rates may stay on hold', kind: 'opinion' },
    ]));
    generateMock.mockResolvedValueOnce(withPoints([
      { text: 'Minutes show three members dissented over rising unemployment', kind: 'new' },
      { text: 'The RBA lifted the cash rate to 4.85% in a 6–3 vote', kind: 'background' },
    ]));
    const { data, flags } = await extractNewsMetadata(input);
    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(promptOf(1)).toContain('returned no "new" key points');
    expect(promptOf(1)).toContain('[background] The RBA lifted the cash rate');
    expect(data!.key_points[0]).toMatchObject({ kind: 'new', asOf: '2026-11-18' });
    expect(flags).toEqual([]);
  });

  it('flags the item when the retry still finds nothing new', async () => {
    const allBackground = withPoints([{ text: 'a', kind: 'background' }, { text: 'b', kind: 'opinion' }]);
    generateMock.mockResolvedValue(allBackground);
    const { data, flags } = await extractNewsMetadata(input);
    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(data).not.toBeNull();
    expect(flags).toEqual(['no_new_key_points']);
  });

  it('does not chase a new point on an item outside the freshness window', async () => {
    generateMock.mockResolvedValue(withPoints([{ text: 'a', kind: 'background' }, { text: 'b', kind: 'opinion' }]));
    const { flags } = await extractNewsMetadata({ ...input, publishedAt: '2026-11-01T00:00:00Z' });
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(flags).toEqual([]);
  });

  it('skips the freshness check when the caller passes no publishedAt (re-extraction scripts)', async () => {
    generateMock.mockResolvedValue(withPoints([{ text: 'a', kind: 'background' }, { text: 'b', kind: 'opinion' }]));
    const { publishedAt: _omit, ...noDate } = input;
    const { flags } = await extractNewsMetadata(noDate);
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(flags).toEqual([]);
  });
});

describe('extractNewsMetadata — rba-minutes-roundup regression', () => {
  const fixture = readFileSync(
    resolve(__dirname, '../../test/fixtures/roundups/rba-minutes-roundup.md'),
    'utf-8',
  );
  const META = {
    category: 'macro',
    summary: 'RBA minutes show three board members opposed the November rise over unemployment and falling house prices.',
    topic_tags: ['rba', 'interest-rates'],
    australian_relevance: true,
    bitcoin_relevance: false,
  };

  beforeEach(() => {
    generateMock.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  // Replays the 17 Nov failure: the lead section first comes back as only the
  // restated vote, with the model's invented 2023 date on everything.
  let leadCalls = 0;
  function routeByPrompt() {
    leadCalls = 0;
    generateMock.mockImplementation(async (messages: Array<{ content: string }>) => {
      const prompt = messages[0]!.content;
      if (prompt.includes('Newsletter:\n')) return { object: META };
      if (prompt.includes('Section: Rate split deepens on the RBA board')) {
        leadCalls += 1;
        return leadCalls === 1
          ? { object: { key_points: [
              { text: 'The RBA lifted the cash rate to 4.85% in a 6–3 vote.', kind: 'background', asOf: '2023-11-07' },
            ] } }
          : { object: { key_points: [
              { text: 'Minutes show the three dissenters feared a sharp downturn, citing 4.7% unemployment and falling house prices.', kind: 'new', asOf: '2023-11-07' },
              { text: 'The RBA lifted the cash rate to 4.85% in a 6–3 vote.', kind: 'background', asOf: '2026-11-03' },
            ] } };
      }
      return { object: { key_points: [{ text: 'A story from a later section.', kind: 'new', asOf: '2023-11-07' }] } };
    });
  }

  it('extracts a new point about the minutes and the dissenters\' reasons, with every asOf valid and none in 2023', async () => {
    routeByPrompt();
    const { data, flags } = await extractNewsMetadata({
      title: 'Rate split deepens',
      source: 'Roundup',
      content: fixture,
      publishedAt: PUBLISHED,
      multiStory: true,
    });

    expect(data).not.toBeNull();
    const points = data!.key_points;

    // The lead story leads, and its news is a new point.
    expect(points[0]).toMatchObject({ kind: 'new' });
    expect(points[0]!.text).toMatch(/minutes/i);
    expect(points[0]!.text).toMatch(/dissent/i);
    expect(points[0]!.text).toMatch(/unemployment|house prices/i);
    // The vote it restates stays background.
    expect(points.find((p) => p.text.includes('6–3'))?.kind).toBe('background');

    for (const p of points) {
      expect(p.asOf === null || (typeof p.asOf === 'string' && p.asOf <= '2026-11-18'), p.text).toBe(true);
      expect(p.asOf ?? '').not.toMatch(/^2023/);
    }
    expect(flags).toEqual([]);
  });

  it('extracts per section — one call each, plus one for metadata — and retries only the lead', async () => {
    routeByPrompt();
    await extractNewsMetadata({ title: 'Rate split deepens', source: 'Roundup', content: fixture, publishedAt: PUBLISHED, multiStory: true });
    // 7 sections + metadata + one gap retry on the lead.
    expect(generateMock).toHaveBeenCalledTimes(9);
    const retry = generateMock.mock.calls.map((c) => c[0][0].content as string).find((p) => p.includes('returned no "new" key points'));
    expect(retry).toContain('Section: Rate split deepens on the RBA board');
  });

  it('flags a lead section that still has no new point', async () => {
    generateMock.mockImplementation(async (messages: Array<{ content: string }>) => {
      const prompt = messages[0]!.content;
      if (prompt.includes('Newsletter:\n')) return { object: META };
      if (prompt.includes('Section: Rate split deepens')) {
        return { object: { key_points: [{ text: 'The vote was 6–3.', kind: 'background' }] } };
      }
      return { object: { key_points: [{ text: 'Later story.', kind: 'new' }] } };
    });
    const { flags } = await extractNewsMetadata({ title: 'T', source: 'S', content: fixture, publishedAt: PUBLISHED, multiStory: true });
    expect(flags).toEqual(['lead_has_no_new_key_point']);
  });

  it('runs the whole-item path for a multi-story source whose email does not split', async () => {
    generateMock.mockResolvedValueOnce({ object: validExtraction(REAL_503_CHAR_SUMMARY) });
    await extractNewsMetadata({ title: 'T', source: 'S', content: 'Just one story, no sections at all, long enough to count.', publishedAt: PUBLISHED, multiStory: true });
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(promptOf(0)).toContain('Article:\n');
  });
});
