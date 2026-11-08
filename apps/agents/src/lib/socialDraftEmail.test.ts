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
    // copy-to-clipboard link for each draft (the email itself can't run JS)
    expect(html).toContain('https://hq.bts.example/content/ci-li/copy');
    expect(html).toContain('https://hq.bts.example/content/ci-x/copy');
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

  it('shows each post\'s own image crop at full card width, with its alt text', () => {
    const { html, text } = renderSocialDraftEmail({
      founderName: 'Chris',
      story: STORY,
      posts: [
        { ...LINKEDIN_POST, image: { url: 'https://signed.example/li.png?token=a&b=1', altText: 'A sketch of a "level" scale.' } },
        { ...X_THREAD, image: { url: 'https://signed.example/x.png', altText: 'A sketch of a scale.' } },
      ],
      company: COMPANY,
    });
    expect(html).toContain(
      '<img src="https://signed.example/li.png?token=a&amp;b=1" alt="A sketch of a &quot;level&quot; scale." width="100%" style="display:block;width:100%;height:auto;border-radius:8px;">',
    );
    expect(html).toContain('src="https://signed.example/x.png"');
    expect(text).toContain('Image: A sketch of a scale.');
  });

  it('says how many other image options wait in Review, under the image', () => {
    const { html, text } = renderSocialDraftEmail({
      founderName: 'Chris',
      story: STORY,
      posts: [
        { ...LINKEDIN_POST, image: { url: 'https://signed.example/li.png', altText: 'A pier.', moreOptions: 2 } },
        { ...X_THREAD, image: { url: 'https://signed.example/x.png', altText: 'A pier.', moreOptions: 1 } },
      ],
      company: COMPANY,
    });
    expect(html).toContain('2 more image options to choose from in Review');
    expect(html).toContain('1 more image option to choose from in Review');
    expect(text).toContain('(2 more image options to choose from in Review.)');
    expect(html.indexOf('li.png')).toBeLessThan(html.indexOf('2 more image options'));
  });

  it('adds no options line when the image is the only one', () => {
    const { html } = renderSocialDraftEmail({
      founderName: 'Chris',
      story: STORY,
      posts: [{ ...LINKEDIN_POST, image: { url: 'https://signed.example/li.png', altText: 'A pier.', moreOptions: 0 } }],
      company: COMPANY,
    });
    expect(html).not.toContain('more image option');
  });

  it('renders no image when the post has none, or the URL is not http(s)', () => {
    const { html } = renderSocialDraftEmail({
      founderName: 'Chris',
      story: STORY,
      posts: [LINKEDIN_POST, { ...X_THREAD, image: { url: 'javascript:alert(1)', altText: 'x' } }],
      company: COMPANY,
    });
    expect(html).not.toContain('<img');
  });
});
