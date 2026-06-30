import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

// Mock the heavy edges so the handler runs in isolation: the agents (which build
// memory/storage at import), the voice resolver, the email send, and the model
// request-context helper.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const editorGenerate = vi.fn();
const charlieGenerate = vi.fn();
const lexGenerate = vi.fn();
const sendSocialDraft = vi.fn();
const resolveVoiceContext = vi.fn();

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('@platform/voice', () => ({ resolveVoiceContext }));
vi.mock('../../agents/contentCreator/index.js', () => ({ charlie: { generate: charlieGenerate } }));
vi.mock('../../agents/editorial/index.js', () => ({ editor: { generate: editorGenerate } }));
vi.mock('../../agents/compliance/index.js', () => ({ lex: { generate: lexGenerate } }));
vi.mock('../../lib/sendSocialDraft.js', () => ({ sendSocialDraft }));
vi.mock('../../config/model.js', () => ({
  stepRequestContext: vi.fn(() => ({})),
  dynamicModelFor: vi.fn(() => 'mock-model'),
}));

const { runSocialPost } = await import('./index.js');

const FOUNDER_ID = 'tm-chris';

const ROUTINE = {
  id: 'r1',
  name: 'Social posts — Chris Pollard',
  action_type: 'social_post_from_news',
  action_config: { founder_team_member_id: FOUNDER_ID, platforms: ['linkedin', 'twitter_x'], lookback_hours: 24 },
  frequency: 'daily',
  time_of_day: '09:00',
  timezone: 'Australia/Melbourne',
};

function wireHappyPath() {
  fakeSupabase.__setResponse('team_members', { data: { id: FOUNDER_ID, full_name: 'Chris Pollard' }, error: null });
  fakeSupabase.__setResponse('social_accounts', {
    data: [
      { id: 'acc-li', platform: 'linkedin', display_name: 'Chris Pollard' },
      { id: 'acc-x', platform: 'twitter_x', display_name: 'Chris Pollard' },
    ],
    error: null,
  });
  fakeSupabase.__setResponse('platform_specs', {
    data: [
      { platform: 'linkedin', max_chars: 3000, max_thread_segments: null, hashtag_guidance: null },
      { platform: 'twitter_x', max_chars: 280, max_thread_segments: 25, hashtag_guidance: null },
    ],
    error: null,
  });
  fakeSupabase.__setResponse('compliance_snippets', {
    data: [{ id: 'snip-ga', key: 'general_advice_warning' }],
    error: null,
  });
  fakeSupabase.__setResponse('news_items', {
    data: [
      {
        id: 'news-0',
        title: 'RBA holds the cash rate',
        url: 'https://news.example.com/0',
        summary: 'Rates unchanged.',
        key_points: ['held at 4.35%'],
        source_name: 'AFR',
        category: 'macro',
        relevance_score: 0.82,
        topic_tags: ['rba'],
        published_at: '2026-06-26T03:00:00Z',
      },
    ],
    error: null,
  });
  // content_items insert .select('id').single()
  fakeSupabase.__setResponse('content_items', { data: { id: 'ci-new' }, error: null });
  fakeSupabase.__setResponse('thread_segments', { data: null, error: null });
  fakeSupabase.__setResponse('agent_activity', { data: null, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeSupabase.__responses.clear();
  resolveVoiceContext.mockResolvedValue({
    profile: {
      persona: 'P',
      tone_attributes: [],
      vocabulary_do: [],
      vocabulary_avoid: [],
      signature_devices: [],
      format_notes: '',
    },
    bitcoinCapitalisationRule: null,
    missionSummary: null,
    contentPolicy: {},
    snippets: [],
  });
  editorGenerate.mockResolvedValue({ object: { story_index: 0, form: 'teach', rationale: 'fits Chris' } });
  charlieGenerate.mockResolvedValue({
    object: { is_thread: false, title: 'Holding the line', body: 'The RBA held rates.', segments: [], charlie_note: '' },
  });
  lexGenerate.mockResolvedValue({
    object: { classification: 'educational', needs_disclaimer: false, disclaimer_key: null, rationale: 'edu' },
  });
  sendSocialDraft.mockResolvedValue(true);
});

describe('runSocialPost', () => {
  it('drafts a post per platform, persists them, and emails the founder', async () => {
    wireHappyPath();

    const outcome = await runSocialPost(ROUTINE);

    expect(outcome.status).toBe('success');
    const meta = outcome.result?.metadata as Record<string, unknown>;
    expect(meta['founder_name']).toBe('Chris Pollard');
    expect(meta['story_id']).toBe('news-0');
    expect(meta['form']).toBe('teach');
    const posts = meta['posts'] as Array<{ platform: string }>;
    expect(posts.map((p) => p.platform).sort()).toEqual(['linkedin', 'twitter_x']);
    expect(meta['emailed']).toBe(true);

    // Two content_items inserts (one per platform).
    expect(fakeSupabase.__buildersFor('content_items').length).toBe(2);
    expect(sendSocialDraft).toHaveBeenCalledTimes(1);
    // Editor selection ran once; Charlie + Lex ran once per platform.
    expect(editorGenerate).toHaveBeenCalledTimes(1);
    expect(charlieGenerate).toHaveBeenCalledTimes(2);
    expect(lexGenerate).toHaveBeenCalledTimes(2);
  });

  it('fails cleanly when the founder has no active social accounts', async () => {
    wireHappyPath();
    fakeSupabase.__setResponse('social_accounts', { data: [], error: null });

    const outcome = await runSocialPost(ROUTINE);

    expect(outcome.status).toBe('failed');
    expect(outcome.error).toMatch(/no active founder social_accounts/i);
    expect(sendSocialDraft).not.toHaveBeenCalled();
  });

  it('succeeds with no posts when there is no fresh news', async () => {
    wireHappyPath();
    fakeSupabase.__setResponse('news_items', { data: [], error: null });

    const outcome = await runSocialPost(ROUTINE);

    expect(outcome.status).toBe('success');
    expect(outcome.result?.summary).toMatch(/no fresh news/i);
    expect(charlieGenerate).not.toHaveBeenCalled();
    expect(sendSocialDraft).not.toHaveBeenCalled();
  });

  it('still emails the founder when only one platform drafts successfully', async () => {
    wireHappyPath();
    // First Charlie call (linkedin) throws, second (twitter_x) succeeds.
    charlieGenerate
      .mockRejectedValueOnce(new Error('model down'))
      .mockResolvedValueOnce({
        object: { is_thread: false, title: 'X take', body: 'Short take.', segments: [], charlie_note: '' },
      });

    const outcome = await runSocialPost(ROUTINE);

    expect(outcome.status).toBe('success');
    const posts = (outcome.result?.metadata as Record<string, unknown>)['posts'] as unknown[];
    expect(posts).toHaveLength(1);
    expect(sendSocialDraft).toHaveBeenCalledTimes(1);
  });
});
