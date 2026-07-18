import { describe, it, expect } from 'vitest';
import { buildEditorSelectionPrompt, buildSocialPostPrompt, type PlatformSpecLite } from './prompts.js';
import type { StoryCandidate } from './select.js';
import { SOCIAL_POST_FORMS, SOCIAL_POST_FORM_VALUES } from './forms.js';

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
  it('asks the editor to pick by founder voice and includes candidates + all forms', () => {
    const p = buildEditorSelectionPrompt([STORY], 'VOICE-BLOCK', 'Carri Crawford');
    expect(p).toContain('Carri Crawford');
    expect(p).toContain('VOICE-BLOCK');
    // every form in the vocabulary is offered
    for (const form of SOCIAL_POST_FORM_VALUES) expect(p).toContain(`**${form}**`);
    // candidate index + title rendered
    expect(p).toContain('0. RBA holds the cash rate');
    expect(p).toContain('AFR');
  });

  it('adds a rotation-bias line when recent forms are supplied', () => {
    const p = buildEditorSelectionPrompt([STORY], 'V', 'Chris', ['teach', 'share_with_context']);
    expect(p).toContain('Recently used forms');
    expect(p).toContain('teach, share_with_context');
    expect(p).toMatch(/bias away from these/i);
  });

  it('omits the rotation-bias line when there is no history', () => {
    const p = buildEditorSelectionPrompt([STORY], 'V', 'Chris');
    expect(p).not.toContain('Recently used forms');
  });

  it('adds the standing-feedback section when guidelines are supplied', () => {
    const p = buildEditorSelectionPrompt([STORY], 'V', 'Chris', [], ['Stop posting about ETF flows.']);
    expect(p).toContain('## Standing feedback from Chris');
    expect(p).toContain('- Stop posting about ETF flows.');
  });

  it('omits the standing-feedback section when there are no guidelines', () => {
    const p = buildEditorSelectionPrompt([STORY], 'V', 'Chris');
    expect(p).not.toContain('Standing feedback');
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

  it('forces a single X post when the account voice sets thread_style single-only', () => {
    const p = buildSocialPostPrompt({
      story: STORY,
      form: 'teach',
      platform: 'twitter_x',
      platformSpec: X_SPEC,
      voiceBlock: 'CARRI-VOICE',
      formatConfig: { thread_style: 'single-only' },
      founderName: 'Carri Crawford',
    });
    expect(p).toContain('SINGLE X (Twitter) post');
    expect(p).not.toContain('X THREAD');
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

  it('renders the generate instruction for every form in the vocabulary', () => {
    for (const form of SOCIAL_POST_FORM_VALUES) {
      const p = buildSocialPostPrompt({
        story: STORY,
        form,
        platform: 'linkedin',
        platformSpec: LINKEDIN_SPEC,
        voiceBlock: 'V',
        founderName: 'Chris',
      });
      expect(p).toContain(SOCIAL_POST_FORMS[form].generateInstruction);
    }
  });

  it('injects the anti-repetition block when recent openings are supplied', () => {
    const p = buildSocialPostPrompt({
      story: STORY,
      form: 'flat_observation',
      platform: 'linkedin',
      platformSpec: LINKEDIN_SPEC,
      voiceBlock: 'V',
      founderName: 'Chris',
      recentOpenings: ['The RBA held rates again.'],
    });
    expect(p).toContain('Do not repeat yourself');
    expect(p).toContain('- The RBA held rates again.');
  });

  it('injects the standing-feedback block when supplied and omits it otherwise', () => {
    const base = {
      story: STORY,
      form: 'flat_observation' as const,
      platform: 'linkedin' as const,
      platformSpec: LINKEDIN_SPEC,
      voiceBlock: 'V',
      founderName: 'Chris',
    };
    const withBlock = buildSocialPostPrompt({
      ...base,
      guidelinesBlock: '## Standing feedback from the founder\n- Skip hashtags.',
    });
    expect(withBlock).toContain('## Standing feedback from the founder');
    expect(withBlock).toContain('- Skip hashtags.');
    expect(buildSocialPostPrompt(base)).not.toContain('Standing feedback');
  });

  it('omits the anti-repetition block when there are no recent openings', () => {
    const p = buildSocialPostPrompt({
      story: STORY,
      form: 'flat_observation',
      platform: 'linkedin',
      platformSpec: LINKEDIN_SPEC,
      voiceBlock: 'V',
      founderName: 'Chris',
    });
    expect(p).not.toContain('Do not repeat yourself');
  });

  it('always includes the grounding requirement', () => {
    const p = buildSocialPostPrompt({
      story: STORY,
      form: 'share_with_context',
      platform: 'linkedin',
      platformSpec: LINKEDIN_SPEC,
      voiceBlock: 'V',
      founderName: 'Chris',
    });
    expect(p).toContain('Grounding (make it concrete)');
    expect(p).toMatch(/number, name, date, or figure/i);
  });

  it('renders a rewrite section only when a rewrite instruction is passed', () => {
    const withRewrite = buildSocialPostPrompt({
      story: STORY,
      form: 'teach',
      platform: 'linkedin',
      platformSpec: LINKEDIN_SPEC,
      voiceBlock: 'V',
      founderName: 'Chris',
      rewriteInstruction: '- Cut the em-dashes — restructure into plain sentences.',
    });
    expect(withRewrite).toContain('Rewrite — fix these AI-tells');
    expect(withRewrite).toContain('Cut the em-dashes');

    const without = buildSocialPostPrompt({
      story: STORY,
      form: 'teach',
      platform: 'linkedin',
      platformSpec: LINKEDIN_SPEC,
      voiceBlock: 'V',
      founderName: 'Chris',
    });
    expect(without).not.toContain('Rewrite — fix these AI-tells');
  });

  it('appends the cadence block after the voice block when supplied', () => {
    const p = buildSocialPostPrompt({
      story: STORY,
      form: 'numbers_first',
      platform: 'twitter_x',
      platformSpec: X_SPEC,
      voiceBlock: 'VOICE',
      founderName: 'Chris',
      cadenceBlock: '**How you tend to open and close — borrow the cadence, not the words:**\n- opener',
    });
    expect(p).toContain('borrow the cadence, not the words');
    expect(p.indexOf('VOICE')).toBeLessThan(p.indexOf('borrow the cadence'));
  });

  it('adds a brevity nudge for a short length target and none for standard', () => {
    const short = buildSocialPostPrompt({
      story: STORY,
      form: 'contrarian_take',
      platform: 'twitter_x',
      platformSpec: X_SPEC,
      voiceBlock: 'V',
      founderName: 'Chris',
      lengthTarget: 'short',
    });
    expect(short).toContain('lean SHORT');

    const standard = buildSocialPostPrompt({
      story: STORY,
      form: 'contrarian_take',
      platform: 'twitter_x',
      platformSpec: X_SPEC,
      voiceBlock: 'V',
      founderName: 'Chris',
      lengthTarget: 'standard',
    });
    expect(standard).not.toContain('lean SHORT');
    expect(standard).not.toContain('Length today');
  });
});
