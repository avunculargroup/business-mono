import { describe, it, expect, vi, beforeEach } from 'vitest';
// executeRoutine declares a schedule, which auto-promotes it to Mastra's evented
// engine; that engine module must be loaded before the workflow is constructed.
import '@mastra/core/workflows/evented';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

// executeRoutineWorkflow pulls in @platform/db and the rex/charlie/editor agents
// (which build memory/storage) at module load. Mock the heavy edges so the
// curation handler can be exercised in isolation.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const editorGenerate = vi.fn();
const charlieGenerate = vi.fn();
const fetchOgImage = vi.fn();
const verifyMoodSummary = vi.fn();

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('../agents/researcher/index.js', () => ({ rex: { generate: vi.fn() } }));
vi.mock('../agents/contentCreator/index.js', () => ({ charlie: { generate: charlieGenerate } }));
vi.mock('../agents/editorial/index.js', () => ({ editor: { generate: editorGenerate } }));
vi.mock('../agents/researcher/tools.js', () => ({ fetchUrl: vi.fn() }));
vi.mock('./startNewsletterRun.js', () => ({ startNewsletterRun: vi.fn() }));
// resolveTranscript pulls in the Deepgram SDK (constructs a client at import,
// which throws without an API key). Stub the transcript edges — unused here.
vi.mock('../lib/transcripts/resolveTranscript.js', () => ({ resolveTranscript: vi.fn() }));
vi.mock('../lib/transcripts/store.js', () => ({
  insertEpisode: vi.fn(),
  updateEpisode: vi.fn(),
  fetchExistingGuids: vi.fn(),
  storeAvailableTranscript: vi.fn(),
}));
vi.mock('../lib/fetchOgImage.js', () => ({ fetchOgImage }));
vi.mock('./newsCurationVerify.js', () => ({ verifyMoodSummary }));
vi.mock('../config/model.js', () => ({
  stepRequestContext: vi.fn(() => ({})),
  dynamicModelFor: vi.fn(() => 'mock-model'),
}));

const { runNewsCuration } = await import('./executeRoutineWorkflow.js');

const ROUTINE = {
  id: 'r1',
  name: 'Daily news curation',
  agent_name: 'charlie',
  action_type: 'news_curation',
  action_config: {},
  frequency: 'daily',
  time_of_day: '08:00',
  timezone: 'Australia/Melbourne',
};

function newsItem(n: number) {
  return {
    id: `news-${n}`,
    title: `News ${n}`,
    url: `https://news.example.com/${n}`,
    summary: `Summary ${n}`,
    category: 'regulatory',
    source_name: `Source ${n}`,
    relevance_score: 0.9 - n * 0.1,
    published_at: '2026-06-15T06:00:00Z',
  };
}

function podcastEpisode(n: number) {
  return {
    id: `pod-${n}`,
    title: `Episode ${n}`,
    description: `Episode summary ${n}`,
    episode_url: `https://podcast.example.com/${n}`,
    youtube_url: null,
    audio_url: null,
    image_url: `https://art.example.com/${n}.jpg`,
    published_at: '2026-06-15T05:00:00Z',
    source: { name: `Show ${n}` },
  };
}

function setPool(news: unknown[], podcasts: unknown[]) {
  fakeSupabase.__setResponse('news_items', { data: news, error: null });
  fakeSupabase.__setResponse('podcast_episodes', { data: podcasts, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeSupabase.__responses.clear();
  charlieGenerate.mockResolvedValue({ object: { mood_summary: 'Quiet markets, steady accumulation.' } });
  fetchOgImage.mockResolvedValue('https://og.example.com/headline.jpg');
  // Default: the intro passes verification unchanged.
  verifyMoodSummary.mockImplementation(async ({ draft }: { draft: string }) => ({ summary: draft, status: 'ok' }));
});

describe('runNewsCuration', () => {
  it('curates a ranked set from the merged news + podcast pool', async () => {
    setPool([newsItem(0), newsItem(1), newsItem(2)], [podcastEpisode(3)]);
    // index 3 is the podcast (news first, then podcasts); pick podcast then a news item.
    editorGenerate.mockResolvedValue({ object: { selected: [{ index: 3 }, { index: 0 }] } });

    const outcome = await runNewsCuration(ROUTINE);

    expect(outcome.status).toBe('success');
    const meta = outcome.result?.metadata as Record<string, unknown>;
    const stories = meta['stories'] as Array<{ kind: string; id: string }>;
    // The editor's picks lead in its own order; the two remaining candidates are
    // topped up behind them, since a digest short of max_stories is the signature
    // of an unusable selection rather than a deliberately tiny one.
    expect(stories.map((s) => s.id)).toEqual(['pod-3', 'news-0', 'news-1', 'news-2']);
    expect(stories[0].kind).toBe('podcast');
    expect(meta['mood_summary']).toBe('Quiet markets, steady accumulation.');
    expect(meta['more_news_url']).toBe('/news');
    expect(outcome.result?.sources?.slice(0, 2).map((s) => s.url)).toEqual([
      'https://podcast.example.com/3',
      'https://news.example.com/0',
    ]);
  });

  it('replaces the intro with the verifier rewrite when the draft is unfaithful', async () => {
    setPool([newsItem(0), newsItem(1)], []);
    editorGenerate.mockResolvedValue({ object: { selected: [{ index: 0 }, { index: 1 }] } });
    verifyMoodSummary.mockResolvedValue({ summary: 'Corrected, fact-checked intro.', status: 'revised' });

    const outcome = await runNewsCuration(ROUTINE);

    // The verifier saw the drafted intro and the curated stories' facts.
    expect(verifyMoodSummary).toHaveBeenCalledWith(
      expect.objectContaining({ draft: 'Quiet markets, steady accumulation.' }),
    );
    const meta = outcome.result?.metadata as Record<string, unknown>;
    expect(meta['mood_summary']).toBe('Corrected, fact-checked intro.');
    expect(outcome.result?.summary).toBe('Corrected, fact-checked intro.');
  });

  it('uses the podcast feed artwork when the headline is a podcast (no og fetch)', async () => {
    setPool([newsItem(0)], [podcastEpisode(1)]);
    editorGenerate.mockResolvedValue({ object: { selected: [{ index: 1 }] } });

    const outcome = await runNewsCuration(ROUTINE);

    const meta = outcome.result?.metadata as Record<string, unknown>;
    expect(meta['headline_image_url']).toBe('https://art.example.com/1.jpg');
    expect(fetchOgImage).not.toHaveBeenCalled();
  });

  it('fetches an og:image when the headline is a news article', async () => {
    setPool([newsItem(0), newsItem(1)], []);
    editorGenerate.mockResolvedValue({ object: { selected: [{ index: 0 }] } });

    const outcome = await runNewsCuration(ROUTINE);

    const meta = outcome.result?.metadata as Record<string, unknown>;
    expect(fetchOgImage).toHaveBeenCalledWith('https://news.example.com/0');
    expect(meta['headline_image_url']).toBe('https://og.example.com/headline.jpg');
  });

  it('falls back to the next story image when the headline has no og:image', async () => {
    setPool([newsItem(0), newsItem(1)], []);
    editorGenerate.mockResolvedValue({ object: { selected: [{ index: 0 }, { index: 1 }] } });
    // First story yields no image, second one does.
    fetchOgImage
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('https://og.example.com/second.jpg');

    const outcome = await runNewsCuration(ROUTINE);

    const meta = outcome.result?.metadata as Record<string, unknown>;
    expect(fetchOgImage).toHaveBeenNthCalledWith(1, 'https://news.example.com/0');
    expect(fetchOgImage).toHaveBeenNthCalledWith(2, 'https://news.example.com/1');
    expect(meta['headline_image_url']).toBe('https://og.example.com/second.jpg');
  });

  it('leaves the headline image undefined when no story resolves one', async () => {
    setPool([newsItem(0), newsItem(1)], []);
    editorGenerate.mockResolvedValue({ object: { selected: [{ index: 0 }, { index: 1 }] } });
    fetchOgImage.mockResolvedValue(null);

    const outcome = await runNewsCuration(ROUTINE);

    const meta = outcome.result?.metadata as Record<string, unknown>;
    expect(meta['headline_image_url']).toBeUndefined();
  });

  it('returns an empty curated set when there is no fresh content', async () => {
    setPool([], []);

    const outcome = await runNewsCuration(ROUTINE);

    expect(outcome.status).toBe('success');
    expect(outcome.result?.summary).toBe('No fresh news to curate today.');
    expect((outcome.result?.metadata as Record<string, unknown>)['stories']).toEqual([]);
    expect(editorGenerate).not.toHaveBeenCalled();
  });

  it('falls back to the top relevance-ranked items when the editor selects nothing', async () => {
    setPool([newsItem(0), newsItem(1), newsItem(2)], []);
    editorGenerate.mockResolvedValue({ object: { selected: [] } });

    const outcome = await runNewsCuration(ROUTINE);

    const stories = (outcome.result?.metadata as Record<string, unknown>)['stories'] as unknown[];
    expect(stories).toHaveLength(3);
  });

  // Regression: coerceToSchema rewrites a non-numeric index to 0, so a pick list
  // in the wrong shape used to become [0,0,0,…], dedup down to a single index and
  // ship a one-headline digest — while still reporting success. Malformed entries
  // must be dropped and the shortfall topped up from the ranked pool instead.
  it.each([
    ['string indices', [{ index: '1' }, { index: '2' }, { index: '3' }]],
    ['a renamed key', [{ candidate_index: 1 }, { candidate_index: 2 }]],
    ['null entries', [null, null, null]],
  ])('does not ship a single headline when the editor returns %s', async (_label, selected) => {
    const news = Array.from({ length: 8 }, (_, i) => newsItem(i));
    setPool(news, []);
    editorGenerate.mockResolvedValue({ object: { selected } });

    const outcome = await runNewsCuration(ROUTINE);

    const stories = (outcome.result?.metadata as Record<string, unknown>)['stories'] as Array<{ id: string }>;
    expect(stories).toHaveLength(6);
    // Topped up from the top of the relevance-ranked pool, not collapsed to news-0 alone.
    expect(stories.map((s) => s.id)).toEqual([
      'news-0', 'news-1', 'news-2', 'news-3', 'news-4', 'news-5',
    ]);
    expect(outcome.news_curation_result).toEqual({ candidates: 8, editor_picked: 0, stories: 6 });
  });

  it('accepts bare numeric indices as well as { index } objects', async () => {
    const news = Array.from({ length: 8 }, (_, i) => newsItem(i));
    setPool(news, []);
    editorGenerate.mockResolvedValue({ object: { selected: [4, 2, 6] } });

    const outcome = await runNewsCuration(ROUTINE);

    const stories = (outcome.result?.metadata as Record<string, unknown>)['stories'] as Array<{ id: string }>;
    // The editor's own ordering leads; the rest is topped up to six.
    expect(stories.slice(0, 3).map((s) => s.id)).toEqual(['news-4', 'news-2', 'news-6']);
    expect(stories).toHaveLength(6);
    expect(outcome.news_curation_result).toEqual({ candidates: 8, editor_picked: 3, stories: 6 });
  });

  it('keeps the editor picks first and tops up a short selection', async () => {
    const news = Array.from({ length: 8 }, (_, i) => newsItem(i));
    setPool(news, []);
    editorGenerate.mockResolvedValue({ object: { selected: [{ index: 5 }] } });

    const outcome = await runNewsCuration(ROUTINE);

    const stories = (outcome.result?.metadata as Record<string, unknown>)['stories'] as Array<{ id: string }>;
    expect(stories.map((s) => s.id)).toEqual([
      'news-5', 'news-0', 'news-1', 'news-2', 'news-3', 'news-4',
    ]);
    expect(outcome.news_curation_result).toEqual({ candidates: 8, editor_picked: 1, stories: 6 });
  });

  it('drops out-of-range and duplicate indices without shrinking the digest', async () => {
    const news = Array.from({ length: 8 }, (_, i) => newsItem(i));
    setPool(news, []);
    editorGenerate.mockResolvedValue({
      object: { selected: [{ index: 2 }, { index: 2 }, { index: 99 }, { index: -1 }] },
    });

    const outcome = await runNewsCuration(ROUTINE);

    const stories = (outcome.result?.metadata as Record<string, unknown>)['stories'] as Array<{ id: string }>;
    expect(stories[0].id).toBe('news-2');
    expect(stories).toHaveLength(6);
    expect(new Set(stories.map((s) => s.id)).size).toBe(6);
    expect(outcome.news_curation_result?.editor_picked).toBe(1);
  });

  it('tops up only to the pool size when the pool is smaller than max_stories', async () => {
    setPool([newsItem(0), newsItem(1)], []);
    editorGenerate.mockResolvedValue({ object: { selected: [{ index: '0' }] } });

    const outcome = await runNewsCuration(ROUTINE);

    const stories = (outcome.result?.metadata as Record<string, unknown>)['stories'] as unknown[];
    expect(stories).toHaveLength(2);
    expect(outcome.news_curation_result).toEqual({ candidates: 2, editor_picked: 0, stories: 2 });
  });

  it('reports selection stats on a clean run', async () => {
    const news = Array.from({ length: 8 }, (_, i) => newsItem(i));
    setPool(news, []);
    editorGenerate.mockResolvedValue({
      object: { selected: [0, 1, 2, 3, 4, 5].map((index) => ({ index })) },
    });

    const outcome = await runNewsCuration(ROUTINE);

    expect(outcome.news_curation_result).toEqual({ candidates: 8, editor_picked: 6, stories: 6 });
  });

  it('hard-caps the curated set at six items even if configured higher', async () => {
    const news = Array.from({ length: 8 }, (_, i) => newsItem(i));
    setPool(news, []);
    editorGenerate.mockResolvedValue({ object: { selected: [] } }); // force fallback over the full pool

    const outcome = await runNewsCuration({
      ...ROUTINE,
      action_config: { max_stories: 10 },
    });

    const stories = (outcome.result?.metadata as Record<string, unknown>)['stories'] as unknown[];
    expect(stories).toHaveLength(6);
  });

  it('reports a failure when the news_items query errors', async () => {
    fakeSupabase.__setResponse('news_items', { data: null, error: { message: 'boom' } });
    fakeSupabase.__setResponse('podcast_episodes', { data: [], error: null });

    const outcome = await runNewsCuration(ROUTINE);

    expect(outcome.status).toBe('failed');
    expect(outcome.error).toContain('news_items query failed');
  });
});
