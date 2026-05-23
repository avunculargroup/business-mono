import { describe, it, expect, vi } from 'vitest';

// The listener module bootstraps a Supabase Realtime client and imports the
// Charlie agent at top level. Stub both so importing the listener for its pure
// helpers doesn't trigger network or agent setup.
vi.mock('@platform/db', () => ({
  createRealtimeClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
  }),
}));
vi.mock('../agents/contentCreator/index.js', () => ({ charlie: {} }));
vi.mock('./lib/realtimeChannel.js', () => ({ subscribeWithReconnect: () => {} }));

const { inferContentType, parseContentOutput } = await import('./contentCreatorListener.js');

describe('inferContentType', () => {
  it.each([
    ['Draft me a newsletter about Bitcoin treasury', 'newsletter'],
    ['Write a LinkedIn post about ASX listed companies', 'linkedin'],
    ['Compose a tweet teaser', 'twitter_x'],
    ['Send a twitter thread on custody', 'twitter_x'],
    ['Draft a blog post on multisig', 'blog'],
    ['Draft an email reply to the CFO', 'email'],
  ])('classifies %s → %s', (msg, expected) => {
    expect(inferContentType(msg)).toBe(expected);
  });

  it('defaults to email when no keyword matches', () => {
    expect(inferContentType('Help me write something for a board update')).toBe('email');
  });

  it('matches the first keyword in the order defined', () => {
    // "newsletter" comes before "email" in CONTENT_TYPE_KEYWORDS
    expect(inferContentType('Write the newsletter as an email')).toBe('newsletter');
  });
});

describe('parseContentOutput', () => {
  it('extracts title and body from <content_output> tags', () => {
    const text = `Here's the draft:
<content_output>
<title>Bitcoin for Australian SMBs</title>
<body>Bitcoin is a digital asset...</body>
</content_output>
That's the post.`;
    expect(parseContentOutput(text)).toEqual({
      title: 'Bitcoin for Australian SMBs',
      body: 'Bitcoin is a digital asset...',
    });
  });

  it('treats an empty title as null', () => {
    const text = '<content_output><title></title><body>just the body</body></content_output>';
    expect(parseContentOutput(text)).toEqual({ title: null, body: 'just the body' });
  });

  it('handles multi-line body content', () => {
    const text = `<content_output><title>T</title><body>line one

line two</body></content_output>`;
    const out = parseContentOutput(text);
    expect(out.title).toBe('T');
    expect(out.body).toContain('line one');
    expect(out.body).toContain('line two');
  });

  it('returns title=null and body=raw text when tags are absent', () => {
    expect(parseContentOutput('no tags here')).toEqual({ title: null, body: 'no tags here' });
  });
});
