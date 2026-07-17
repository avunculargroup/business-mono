import { describe, it, expect } from 'vitest';
import { normalizePodcastItems, parseItunesDuration, extractYoutubeUrl, feedImageUrl } from './podcastFeed.js';

describe('parseItunesDuration', () => {
  it('parses HH:MM:SS, MM:SS, and raw seconds', () => {
    expect(parseItunesDuration('01:02:03')).toBe(3723);
    expect(parseItunesDuration('45:30')).toBe(2730);
    expect(parseItunesDuration('1830')).toBe(1830);
  });
  it('returns null on garbage or undefined', () => {
    expect(parseItunesDuration('abc')).toBeNull();
    expect(parseItunesDuration(undefined)).toBeNull();
  });
});

describe('extractYoutubeUrl', () => {
  it('finds a watch URL in show notes', () => {
    const notes = 'Watch on YouTube: https://www.youtube.com/watch?v=dQw4w9WgXcQ thanks';
    expect(extractYoutubeUrl(notes)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
  it('finds a youtu.be short link', () => {
    expect(extractYoutubeUrl('see https://youtu.be/dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ');
  });
  it('returns null when no youtube link present', () => {
    expect(extractYoutubeUrl('just text https://example.com')).toBeNull();
    expect(extractYoutubeUrl(null)).toBeNull();
  });
});

describe('feedImageUrl', () => {
  it('prefers the channel-level itunes:image in its attribute, object, and string shapes', () => {
    expect(feedImageUrl({ itunesImage: { $: { href: 'https://art/show.jpg' } } })).toBe('https://art/show.jpg');
    expect(feedImageUrl({ itunesImage: { href: 'https://art/show.jpg' } })).toBe('https://art/show.jpg');
    expect(feedImageUrl({ itunesImage: 'https://art/show.jpg' })).toBe('https://art/show.jpg');
  });

  it('falls back to the standard RSS <image><url>', () => {
    expect(feedImageUrl({ image: { url: 'https://art/rss.jpg' } })).toBe('https://art/rss.jpg');
    expect(feedImageUrl({ itunesImage: 'https://art/itunes.jpg', image: { url: 'https://art/rss.jpg' } })).toBe(
      'https://art/itunes.jpg',
    );
  });

  it('returns null when the feed carries no artwork', () => {
    expect(feedImageUrl({})).toBeNull();
    expect(feedImageUrl({ itunesImage: {}, image: {} })).toBeNull();
  });
});

describe('normalizePodcastItems', () => {
  const base = {
    title: 'Ep 1',
    link: 'https://pod/ep1',
    isoDate: '2026-06-01T00:00:00.000Z',
    enclosure: { url: 'https://pod/ep1.mp3', type: 'audio/mpeg' },
    guid: 'guid-1',
  };

  it('maps fields, duration, transcript tags and youtube link', () => {
    const items = [{
      ...base,
      content: 'Notes — https://youtu.be/dQw4w9WgXcQ',
      itunesDuration: '30:00',
      itunesSeason: '2',
      itunesEpisode: '5',
      podcastTranscripts: [{ $: { url: 'https://pod/ep1.json', type: 'application/json' } }],
    }];
    const [c] = normalizePodcastItems(items, { cutoffMs: 0, maxItems: 10 });
    expect(c).toMatchObject({
      guid: 'guid-1',
      title: 'Ep 1',
      audio_url: 'https://pod/ep1.mp3',
      audio_mime_type: 'audio/mpeg',
      duration_seconds: 1800,
      season: 2,
      episode_number: 5,
      youtube_url: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(c!.transcriptTags).toHaveLength(1);
  });

  it('falls back to the enclosure URL as guid when guid is absent', () => {
    const { guid: _g, ...noGuid } = base;
    const [c] = normalizePodcastItems([noGuid], { cutoffMs: 0, maxItems: 10 });
    expect(c!.guid).toBe('https://pod/ep1.mp3');
  });

  it('drops items older than the cutoff and caps to maxItems', () => {
    const old = { ...base, guid: 'old', isoDate: '2000-01-01T00:00:00.000Z' };
    const fresh = { ...base, guid: 'fresh' };
    const cutoff = new Date('2020-01-01T00:00:00.000Z').getTime();
    expect(normalizePodcastItems([old, fresh], { cutoffMs: cutoff, maxItems: 10 })).toHaveLength(1);
    expect(normalizePodcastItems([fresh, { ...base, guid: 'b' }], { cutoffMs: 0, maxItems: 1 })).toHaveLength(1);
  });
});
