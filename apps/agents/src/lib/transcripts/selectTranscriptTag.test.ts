import { describe, it, expect } from 'vitest';
import { normalizeTranscriptTags, selectBestTranscriptTag } from './selectTranscriptTag.js';

describe('normalizeTranscriptTags', () => {
  it('reads url/type/language from rss-parser $ attributes', () => {
    const raw = [
      { $: { url: 'https://x/t.json', type: 'application/json', language: 'en' } },
      { $: { url: 'https://x/t.vtt', type: 'text/vtt' } },
    ];
    const out = normalizeTranscriptTags(raw);
    expect(out).toEqual([
      { url: 'https://x/t.json', mimeType: 'application/json', language: 'en' },
      { url: 'https://x/t.vtt', mimeType: 'text/vtt', language: null },
    ]);
  });

  it('coerces a single (non-array) tag and skips entries missing url/type', () => {
    expect(normalizeTranscriptTags({ $: { url: 'https://x/a.srt', type: 'application/srt' } })).toHaveLength(1);
    expect(normalizeTranscriptTags({ $: { type: 'application/json' } })).toHaveLength(0);
    expect(normalizeTranscriptTags(undefined)).toHaveLength(0);
  });
});

describe('selectBestTranscriptTag', () => {
  it('prefers JSON over timestamped over html over text', () => {
    const cands = [
      { url: 'p.txt', mimeType: 'text/plain' },
      { url: 'h.html', mimeType: 'text/html' },
      { url: 's.srt', mimeType: 'application/srt' },
      { url: 'j.json', mimeType: 'application/json' },
    ];
    expect(selectBestTranscriptTag(cands, 'en')).toMatchObject({ url: 'j.json', format: 'json' });
  });

  it('prefers the configured language over format richness', () => {
    const cands = [
      { url: 'j.json', mimeType: 'application/json', language: 'fr' },
      { url: 'v.vtt', mimeType: 'text/vtt', language: 'en' },
    ];
    // English VTT beats French JSON because language scores first.
    expect(selectBestTranscriptTag(cands, 'en')).toMatchObject({ url: 'v.vtt', format: 'vtt' });
  });

  it('returns null when no candidate has a parseable format', () => {
    expect(selectBestTranscriptTag([{ url: 'x', mimeType: 'application/pdf' }], 'en')).toBeNull();
  });
});
