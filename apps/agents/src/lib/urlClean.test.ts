import { describe, it, expect, vi } from 'vitest';
import { unwrapOffline, stripTrackingParams, dedupKey, resolveRedirect, cleanUrl, DENY_ANCHOR_RE } from './urlClean.js';

// Placeholders throughout — business-mono is public. Payloads are built here
// rather than pasted, so no real recipient id can slip into a fixture.
const b64 = (s: string) => Buffer.from(s).toString('base64');
const b64url = (s: string) => Buffer.from(s).toString('base64url');

describe('unwrapOffline', () => {
  it('decodes a Seeking Alpha click path', () => {
    const dest = 'https://seekingalpha.com/news/1000-a-headline?mailingid=1&userid=2';
    const url = `https://email-st.seekingalpha.com/click/100.200/${b64(dest)}/sigplaceholder`;
    expect(unwrapOffline(url)).toBe(dest);
  });

  it('decodes a Seeking Alpha payload that uses base64url characters', () => {
    const dest = 'https://seekingalpha.com/article/1-x?a=>>>&b=???';
    const url = `https://email-st.seekingalpha.com/click/1.2/${b64url(dest)}/sig`;
    expect(unwrapOffline(url)).toBe(dest);
  });

  it('decodes a Customer.io /e/c/ JSON payload', () => {
    const payload = b64url(JSON.stringify({ email_id: 'placeholder', href: 'https://glassnode.com/insights/week-1', position: 3 }));
    expect(unwrapOffline(`https://email.example.com/e/c/${payload}/sig`)).toBe('https://glassnode.com/insights/week-1');
  });

  it.each([
    ['SA payload that is not base64 text', 'https://email-st.seekingalpha.com/click/1.2/%FF%FE%00/sig'],
    ['SA payload that is not a URL', `https://email-st.seekingalpha.com/click/1.2/${b64('not a url')}/sig`],
    ['SA path without a payload', 'https://email-st.seekingalpha.com/click/1.2'],
    ['Customer.io payload that is not JSON', `https://email.example.com/e/c/${b64url('{not json, but long enough')}/s`],
    ['Customer.io JSON without an href', `https://email.example.com/e/c/${b64url(JSON.stringify({ email_id: 'placeholder-long' }))}/s`],
    ['Customer.io href that is javascript:', `https://email.example.com/e/c/${b64url(JSON.stringify({ href: 'javascript:alert(1)//pad' }))}/s`],
  ])('returns null for a malformed payload: %s', (_label, url) => {
    expect(unwrapOffline(url)).toBeNull();
  });

  it('returns null for an opaque wrapper', () => {
    expect(unwrapOffline('https://d1.na1.hubspotlinks.com/Ctc/OT+113/placeholder')).toBeNull();
    expect(unwrapOffline('https://example.ghost.io/r/0a1b2c3d?m=placeholder')).toBeNull();
  });

  it('returns a non-wrapper unchanged, and null for a non-URL', () => {
    expect(unwrapOffline('https://afr.com/story?id=1')).toBe('https://afr.com/story?id=1');
    expect(unwrapOffline('mailto:a@example.com')).toBeNull();
  });
});

describe('stripTrackingParams', () => {
  it('strips campaign params and subscriber tokens but keeps meaningful ones', () => {
    expect(
      stripTrackingParams('https://afr.com/story?utm_source=nl&utm_medium=email&mc_eid=a&id=7&fbclid=z&_hsenc=x&_hsmi=1&page=2'),
    ).toBe('https://afr.com/story?id=7&page=2');
  });

  it('strips Seeking Alpha per-send ids and its parameter fragment', () => {
    expect(
      stripTrackingParams(
        'https://seekingalpha.com/news/1000-x?mailingid=1&serial=1.2&userid=3&source=email&messageid=wsb&lctg=p#source=section%3Amain',
      ),
    ).toBe('https://seekingalpha.com/news/1000-x');
  });

  it('strips Substack app nags and the referral code, only on Substack', () => {
    expect(
      stripTrackingParams('https://open.substack.com/pub/x/p/a-post?utm_source=email&redirect=app-store-no-desktop&inbox=true&r=abc12'),
    ).toBe('https://open.substack.com/pub/x/p/a-post');
    expect(stripTrackingParams('https://example.com/a?redirect=/b&r=1')).toBe('https://example.com/a?redirect=/b&r=1');
  });

  it('keeps a real anchor fragment', () => {
    expect(stripTrackingParams('https://example.com/a#section-2')).toBe('https://example.com/a#section-2');
  });

  it('strips a JWT whatever its parameter is called', () => {
    expect(stripTrackingParams('https://example.com/a?id=1&t=eyJ1IjoiUExBQ0VIT0xERVIifQ.c2ln')).toBe('https://example.com/a?id=1');
  });

  it('leaves a non-URL alone', () => {
    expect(stripTrackingParams('not a url')).toBe('not a url');
  });
});

describe('dedupKey', () => {
  it('ignores www, case, trailing slash and query', () => {
    expect(dedupKey('https://www.AFR.com/Story/?utm_source=x')).toBe('afr.com/story');
    expect(dedupKey('ftp://afr.com/x')).toBeNull();
  });
});

describe('DENY_ANCHOR_RE', () => {
  it.each(['Unsubscribe', 'View in browser', 'View this email in your browser', 'Manage subscriptions', 'Update your preferences', 'Refer a friend'])(
    'matches chrome: %s',
    (text) => expect(DENY_ANCHOR_RE.test(text)).toBe(true),
  );
  it('does not match a headline', () => {
    expect(DENY_ANCHOR_RE.test('RBA holds rates as inflation eases')).toBe(false);
  });
});

describe('resolveRedirect', () => {
  function redirect(location: string, status = 302): Response {
    return new Response(null, { status, headers: { location } });
  }

  it('follows wrapper hops and stops at the first non-wrapper host', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirect('https://link.sbstck.com/redirect/placeholder'))
      .mockResolvedValueOnce(redirect('https://afr.com/story?utm_source=x'));
    const url = await resolveRedirect('https://d1.na1.hubspotlinks.com/Ctc/placeholder', fetchImpl);
    expect(url).toBe('https://afr.com/story?utm_source=x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({ method: 'GET', redirect: 'manual' });
    }
  });

  it('resolves a relative Location against the current hop', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(redirect('/redirect/2/next')).mockResolvedValueOnce(redirect('https://afr.com/a'));
    expect(await resolveRedirect('https://substack.com/redirect/1/start', fetchImpl)).toBe('https://afr.com/a');
  });

  it('decodes an encodable wrapper met mid-chain instead of requesting it', async () => {
    const sa = `https://email-st.seekingalpha.com/click/1.2/${b64('https://seekingalpha.com/article/1-x')}/sig`;
    const fetchImpl = vi.fn().mockResolvedValueOnce(redirect(sa));
    expect(await resolveRedirect('https://d1.na1.hubspotlinks.com/Ctc/p', fetchImpl)).toBe('https://seekingalpha.com/article/1-x');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after 3 hops that are all wrappers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(redirect('https://d1.na1.hubspotlinks.com/Ctc/again'));
    expect(await resolveRedirect('https://d1.na1.hubspotlinks.com/Ctc/p', fetchImpl)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('returns null when the wrapper answers with a page instead of a redirect', async () => {
    const res = new Response('<html>tracking page</html>', { status: 200 });
    const text = vi.spyOn(res, 'text');
    const fetchImpl = vi.fn().mockResolvedValue(res);
    expect(await resolveRedirect('https://d1.na1.hubspotlinks.com/Ctc/p', fetchImpl)).toBeNull();
    expect(text).not.toHaveBeenCalled();
  });

  it('never reads a redirect body', async () => {
    const res = redirect('https://afr.com/a');
    const text = vi.spyOn(res, 'text');
    const json = vi.spyOn(res, 'json');
    await resolveRedirect('https://d1.na1.hubspotlinks.com/Ctc/p', vi.fn().mockResolvedValue(res));
    expect(text).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it('returns null on a network error', async () => {
    expect(await resolveRedirect('https://d1.na1.hubspotlinks.com/Ctc/p', vi.fn().mockRejectedValue(new Error('reset')))).toBeNull();
  });

  it('honours the 5-second total timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        });
      });
      const pending = resolveRedirect('https://d1.na1.hubspotlinks.com/Ctc/p', fetchImpl as unknown as typeof fetch);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cleanUrl', () => {
  it('cleans a plain URL without a request', async () => {
    const fetchImpl = vi.fn();
    expect(await cleanUrl('https://afr.com/a?utm_source=x', fetchImpl)).toBe('https://afr.com/a');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves an opaque wrapper, then de-tracks it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://afr.com/a?_hsenc=t' } }));
    expect(await cleanUrl('https://d1.na1.hubspotlinks.com/Ctc/p', fetchImpl)).toBe('https://afr.com/a');
  });

  it('is null when the wrapper cannot be resolved', async () => {
    expect(await cleanUrl('https://d1.na1.hubspotlinks.com/Ctc/p', vi.fn().mockRejectedValue(new Error('x')))).toBeNull();
  });
});
