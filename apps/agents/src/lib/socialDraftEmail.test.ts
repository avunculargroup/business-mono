import { describe, it, expect } from 'vitest';
import { renderSocialDraftEmail, type SocialDraftPost } from './socialDraftEmail.js';

const COMPANY = { name: 'Bitcoin Treasury Solutions', abn: '82683088173', website: 'https://www.bts.example' };
const STORY = { title: 'RBA holds the cash rate', url: 'https://news.example.com/rba', source_name: 'AFR' };

const LINKEDIN_POST: SocialDraftPost = {
  contentItemId: 'ci-li',
  platform: 'linkedin',
  accountName: 'Chris Pollard',
  title: 'Holding the line',
  body: 'The RBA held rates. Here is what it means for your treasury horizon.',
  segments: [],
  isThread: false,
  classification: 'educational',
  needsDisclaimer: false,
};

const X_THREAD: SocialDraftPost = {
  contentItemId: 'ci-x',
  platform: 'twitter_x',
  accountName: 'Carri Crawford',
  title: '',
  body: 'A short thread',
  segments: ['First point about rates.', 'Second point <with> "markup".'],
  isThread: true,
  classification: 'general_advice',
  needsDisclaimer: true,
};

describe('renderSocialDraftEmail', () => {
  it('addresses the founder and names both platforms in the subject', () => {
    const { subject } = renderSocialDraftEmail({
      founderName: 'Chris Pollard',
      story: STORY,
      posts: [LINKEDIN_POST, X_THREAD],
      webAppUrl: 'https://hq.bts.example',
      company: COMPANY,
    });
    expect(subject).toContain('Chris');
    expect(subject).toContain('LinkedIn and X');
  });

  it('renders a platform-mimic card per post with review CTAs', () => {
    const { html } = renderSocialDraftEmail({
      founderName: 'Chris Pollard',
      story: STORY,
      posts: [LINKEDIN_POST, X_THREAD],
      webAppUrl: 'https://hq.bts.example',
      company: COMPANY,
    });
    // platform labels + account names
    expect(html).toContain('LinkedIn · draft');
    expect(html).toContain('X · draft');
    expect(html).toContain('Chris Pollard');
    expect(html).toContain('Carri Crawford');
    // single-post body and numbered thread segments
    expect(html).toContain('The RBA held rates.');
    expect(html).toContain('1/</span> First point about rates.');
    expect(html).toContain('2/</span>');
    // CTA links to the content editor for each draft
    expect(html).toContain('https://hq.bts.example/content/ci-li');
    expect(html).toContain('https://hq.bts.example/content/ci-x');
    // disclaimer note only on the general-advice post
    expect(html).toContain('Disclaimer to be attached by Lex.');
    // story line linked
    expect(html).toContain('https://news.example.com/rba');
  });

  it('escapes HTML in segment bodies', () => {
    const { html } = renderSocialDraftEmail({
      founderName: 'Carri',
      story: STORY,
      posts: [X_THREAD],
      webAppUrl: 'https://hq.bts.example',
      company: COMPANY,
    });
    expect(html).toContain('Second point &lt;with&gt; &quot;markup&quot;.');
    expect(html).not.toContain('Second point <with>');
  });

  it('omits the CTA when no web app URL is configured', () => {
    const { html, text } = renderSocialDraftEmail({
      founderName: 'Chris',
      story: STORY,
      posts: [LINKEDIN_POST],
      company: COMPANY,
    });
    expect(html).not.toContain('Review &amp; approve on the web');
    expect(text).not.toContain('Review:');
  });

  it('includes each post in the plain-text alternative', () => {
    const { text } = renderSocialDraftEmail({
      founderName: 'Chris Pollard',
      story: STORY,
      posts: [LINKEDIN_POST, X_THREAD],
      webAppUrl: 'https://hq.bts.example',
      company: COMPANY,
    });
    expect(text).toContain('— LinkedIn —');
    expect(text).toContain('— X —');
    expect(text).toContain('1/ First point about rates.');
    expect(text).toContain('https://hq.bts.example/content/ci-li');
  });
});
