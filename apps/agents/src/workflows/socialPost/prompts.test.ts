import { describe, it, expect } from 'vitest';
import { buildEditorSelectionPrompt, buildSocialPostPrompt, type PlatformSpecLite } from './prompts.js';
import type { StoryCandidate } from './select.js';

const STORY: StoryCandidate = {
  id: 'n1',
  title: 'RBA holds the cash rate',
  url: 'https://news.example.com/rba',
  summary: 'The RBA left rates unchanged, citing sticky services inflation.',
  source_name: 'AFR',
  category: 'macro',
  key_points: ['Rate held at 4.35%', 'Services inflation sticky'],
  topic_tags: ['monetary-policy', 'rba'],
  relevance_score: 0.82,
  published_at: '2026-06-26T03:00:00Z',
};

const LINKEDIN_SPEC: PlatformSpecLite = { platform: 'linkedin', max_chars: 3000 };
const X_SPEC: PlatformSpecLite = { platform: 'twitter_x', max_chars: 280, max_thread_segments: 25 };

describe('buildEditorSelectionPrompt', () => {
  it('asks the editor to pick by founder voice and includes candidates + forms', () => {
    const p = buildEditorSelectionPrompt([STORY], 'VOICE-BLOCK', 'Carri Crawford');
    expect(p).toContain('Carri Crawford');
    expect(p).toContain('VOICE-BLOCK');
    expect(p).toContain('share_with_context');
    expect(p).toContain('teach');
    // candidate index + title rendered
    expect(p).toContain('0. RBA holds the cash rate');
    expect(p).toContain('AFR');
  });
});

describe('buildSocialPostPrompt', () => {
  it('renders the share-with-context form for LinkedIn with the char ceiling and voice', () => {
    const p = buildSocialPostPrompt({
      story: STORY,
      form: 'share_with_context',
      platform: 'linkedin',
      platformSpec: LINKEDIN_SPEC,
      voiceBlock: 'CHRIS-VOICE',
      founderName: 'Chris Pollard',
    });
    expect(p).toContain('LinkedIn post for Chris Pollard');
    expect(p).toContain('SHARE WITH CONTEXT');
    expect(p).toContain('3000 characters');
    expect(p).toContain('CHRIS-VOICE');
    expect(p).toContain('https://news.example.com/rba');
    // LinkedIn is single-post only
    expect(p).toContain('SINGLE LinkedIn post');
  });

  it('renders the teach form for X and allows a thread', () => {
    const p = buildSocialPostPrompt({
      story: STORY,
      form: 'teach',
      platform: 'twitter_x',
      platformSpec: X_SPEC,
      voiceBlock: 'CARRI-VOICE',
      founderName: 'Carri Crawford',
    });
    expect(p).toContain('X (Twitter) post for Carri Crawford');
    expect(p).toContain('TEACH');
    expect(p).toContain('X THREAD');
    expect(p).toContain('280 characters');
    expect(p).toContain('max 25 segments');
  });

  it('includes the story key points when present', () => {
    const p = buildSocialPostPrompt({
      story: STORY,
      form: 'teach',
      platform: 'linkedin',
      platformSpec: LINKEDIN_SPEC,
      voiceBlock: 'V',
      founderName: 'Chris',
    });
    expect(p).toContain('Rate held at 4.35%');
  });
});
