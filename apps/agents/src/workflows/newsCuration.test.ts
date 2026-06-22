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
    expect(stories.map((s) => s.id)).toEqual(['pod-3', 'news-0']);
    expect(stories[0].kind).toBe('podcast');
    expect(meta['mood_summary']).toBe('Quiet markets, steady accumulation.');
    expect(meta['more_news_url']).toBe('/news');
    expect(outcome.result?.sources?.map((s) => s.url)).toEqual([
      'https://podcast.example.com/3',
      'https://news.example.com/0',
    ]);
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
