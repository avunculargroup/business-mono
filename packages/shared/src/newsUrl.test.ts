import { describe, expect, it } from 'vitest';
import { isSubscriberScoped, isWrapperUrl, subscriberTokenParams } from './newsUrl.js';

// Every token, id and payload below is a placeholder. business-mono is public;
// never paste a real wrapper URL from news_items into a test.

describe('isSubscriberScoped', () => {
  it.each([
    ['Seeking Alpha click', 'https://email-st.seekingalpha.com/click/100.200/aHR0cHM6Ly9leGFtcGxlLmNvbS8=/abc123'],
    ['HubSpot', 'https://d1Abcd00.na1.hubspotlinks.com/Ctc/OT+113/d1Abcd00/VVNkPLACEHOLDER'],
    ['HubSpot preferences', 'https://hs-1.s.hubspotemail.net/hs/preferences-center/en/direct?data=PLACEHOLDER'],
    ['Substack sbstck', 'https://link.sbstck.com/redirect/00000000-0000-0000-0000-000000000000?j=PLACEHOLDER'],
    ['Substack redirect', 'https://substack.com/redirect/2/PLACEHOLDER'],
    ['Mailchimp short', 'https://us.list-manage.com/_abcDEF?e=0000000000&c2id=placeholder'],
    ['Mailchimp track', 'https://example.us6.list-manage.com/track/click?u=1&id=2&e=3'],
    ['Customer.io', 'https://email.example.com/e/c/eyJlbWFpbF9pZCI6IlBMQUNFSE9MREVSIn0/sig'],
    ['Ghost redirect', 'https://example.ghost.io/r/0a1b2c3d?m=00000000-0000-0000-0000-000000000000'],
    ['Ghost on a subpath', 'https://example.com/blog/r/0a1b2c3d?m=00000000-0000-0000-0000-000000000000'],
    ['Campaign Monitor', 'http://newsletter.example.gov.au/t/j-e-abcdef-ghijkl-k/'],
    ['SendGrid', 'https://elink1.newsletter.example.net/ls/click?upn=placeholder'],
    ['Pardot', 'https://go.example.com/e/1000/2026-10-20/abc/1000/h/placeholder'],
    ['beehiiv', 'https://email.beehiivstatus.com/0000/hclick'],
    ['Vuture', 'https://comms.example.com.au/link/id/zzzzPLACEHOLDERzzzz/page.html'],
  ])('flags a %s wrapper', (_label, url) => {
    expect(isWrapperUrl(url)).toBe(true);
    expect(isSubscriberScoped(url)).toBe(true);
  });

  it.each([
    ['HubSpot token', 'https://example.com/post?_hsenc=p2placeholder&_hsmi=1'],
    ['Mailchimp subscriber id', 'https://example.com/a?mc_eid=placeholder'],
    ['Marketo', 'https://example.com/a?mkt_tok=placeholder'],
    ['ConvertKit', 'https://example.com/a?ck_subscriber_id=1'],
    ['Seeking Alpha user', 'https://seekingalpha.com/news/1-headline?userid=1&lctg=placeholder'],
    ['Substack referral', 'https://substack.com/app-link/post?publication_id=1&post_id=2&r=abc12'],
    ['Mailchimp archive e=', 'https://mailchi.mp/example/issue-1?e=0000000000'],
    ['Ghost member uuid', 'https://example.ghost.io/members/feedback/abc/0/?uuid=placeholder&key=placeholder'],
    ['JWT under any name', 'https://example.com/a?anything=eyJ1IjoiUExBQ0VIT0xERVIifQ.c2lnbmF0dXJl'],
  ])('flags a clean host carrying a %s parameter', (_label, url) => {
    expect(isWrapperUrl(url)).toBe(false);
    expect(isSubscriberScoped(url)).toBe(true);
  });

  it.each([
    'https://seekingalpha.com/article/4600000-bitcoin-treasury',
    'https://www.reuters.com/markets/currencies/bitcoin-2026-10-20/',
    'https://open.substack.com/pub/example/p/a-post?utm_source=email',
    'https://example.com/report?id=42&page=2',
    // Generic parameter names that are tokens only on particular hosts.
    'https://example.com/search?r=1&e=2&m=3',
    'https://example.com/r/notahexid',
  ])('passes a clean article URL: %s', (url) => {
    expect(isSubscriberScoped(url)).toBe(false);
  });

  it('is false for anything that is not http(s)', () => {
    expect(isSubscriberScoped('mailto:a@example.com')).toBe(false);
    expect(isSubscriberScoped('email://source/abc')).toBe(false);
    expect(isSubscriberScoped('not a url')).toBe(false);
  });
});

describe('subscriberTokenParams', () => {
  it('names only the token parameters, preserving their case', () => {
    const u = new URL('https://example.com/a?id=1&_HSENC=x&utm_source=email&mc_eid=y');
    expect(subscriberTokenParams(u)).toEqual(['_HSENC', 'mc_eid']);
  });
});
