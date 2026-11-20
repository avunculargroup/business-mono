import { describe, it, expect } from 'vitest';
import {
  formatKeyPointsForPrompt,
  isValidAsOf,
  melbourneDate,
  newKeyPoints,
  normalizeAsOf,
  normalizeKeyPoints,
  stampKeyPointAsOf,
} from './news.js';

describe('normalizeKeyPoints', () => {
  it('reads legacy bare strings as new, so un-backfilled rows behave as before', () => {
    expect(normalizeKeyPoints(['a', 'b'])).toEqual([
      { text: 'a', kind: 'new' },
      { text: 'b', kind: 'new' },
    ]);
  });

  it('keeps structured points and their asOf', () => {
    expect(
      normalizeKeyPoints([
        { text: 'RBA raised to 4.60%', kind: 'background', asOf: '2026-09-30' },
        { text: 'Guidance inconsistent', kind: 'new' },
      ]),
    ).toEqual([
      { text: 'RBA raised to 4.60%', kind: 'background', asOf: '2026-09-30' },
      { text: 'Guidance inconsistent', kind: 'new' },
    ]);
  });

  it('drops entries it cannot classify rather than guessing', () => {
    expect(
      normalizeKeyPoints([null, '', '  ', 3, { text: 'x', kind: 'rumour' }, { kind: 'new' }, { text: 'ok', kind: 'opinion' }]),
    ).toEqual([{ text: 'ok', kind: 'opinion' }]);
  });

  it('returns [] for a non-array', () => {
    expect(normalizeKeyPoints(null)).toEqual([]);
    expect(normalizeKeyPoints({ text: 'a', kind: 'new' })).toEqual([]);
  });
});

describe('newKeyPoints', () => {
  it('keeps only the points the article itself reports', () => {
    const points = normalizeKeyPoints([
      { text: 'bg', kind: 'background' },
      { text: 'fresh', kind: 'new' },
      { text: 'view', kind: 'opinion' },
    ]);
    expect(newKeyPoints(points).map((p) => p.text)).toEqual(['fresh']);
  });
});

describe('formatKeyPointsForPrompt', () => {
  it('labels non-new points with their kind and date', () => {
    expect(
      formatKeyPointsForPrompt([
        { text: 'fresh', kind: 'new' },
        { text: 'bg', kind: 'background', asOf: '2026-09' },
        { text: 'view', kind: 'opinion' },
      ]),
    ).toEqual(['fresh', '[background, as of 2026-09] bg', '[opinion] view']);
  });
});

describe('key point asOf', () => {
  // 18:52Z on 17 Nov is 05:52 on 18 Nov in Melbourne (AEDT, UTC+11).
  const PUBLISHED = '2026-11-17T18:52:35Z';

  it('melbourneDate is the Melbourne calendar date, not the UTC one', () => {
    expect(melbourneDate(PUBLISHED)).toBe('2026-11-18');
    expect(melbourneDate('2026-07-01T10:00:00Z')).toBe('2026-07-01');
    expect(melbourneDate(null)).toBeNull();
    expect(melbourneDate('not a date')).toBeNull();
  });

  it('isValidAsOf accepts only real dates in the three precisions', () => {
    for (const ok of ['2026', '2026-11', '2026-11-03', '2024-02-29']) expect(isValidAsOf(ok)).toBe(true);
    for (const bad of ['', 'present', 'publication date', 'article date', '2026-13', '2026-02-30', '2025-02-29', '26-11-03', '2026/11/03', 'November 2026', null, 20261103]) {
      expect(isValidAsOf(bad)).toBe(false);
    }
  });

  it('normalizeAsOf nulls free text and anything later than publication, at the asOf\'s own precision', () => {
    expect(normalizeAsOf('present', PUBLISHED)).toBeNull();
    expect(normalizeAsOf('2026-11-03', PUBLISHED)).toBe('2026-11-03');
    expect(normalizeAsOf('2026-11-18', PUBLISHED)).toBe('2026-11-18');
    expect(normalizeAsOf('2026-11-19', PUBLISHED)).toBeNull();
    expect(normalizeAsOf('2026-11', PUBLISHED)).toBe('2026-11');
    expect(normalizeAsOf('2026-12', PUBLISHED)).toBeNull();
    expect(normalizeAsOf('2026', PUBLISHED)).toBe('2026');
    expect(normalizeAsOf('2027', PUBLISHED)).toBeNull();
    // Without a publication date only the format can be checked.
    expect(normalizeAsOf('2027-01-01', null)).toBe('2027-01-01');
  });

  it('stampKeyPointAsOf sets new points to the publication date and ignores what the model said', () => {
    const out = stampKeyPointAsOf(
      [
        { text: 'Minutes show three members dissented', kind: 'new', asOf: '2023-11-07' },
        { text: 'The RBA lifted the cash rate to 4.85%', kind: 'background', asOf: '2026-11-03' },
        { text: 'Rates may stay on hold', kind: 'opinion', asOf: 'present' },
      ],
      PUBLISHED,
    );
    expect(out.map((p) => p.asOf)).toEqual(['2026-11-18', '2026-11-03', null]);
  });

  it('stampKeyPointAsOf leaves new points null when the publication date is unknown', () => {
    expect(stampKeyPointAsOf([{ text: 'x', kind: 'new', asOf: '2026-01-01' }], null)[0]!.asOf).toBeNull();
  });

  it('normalizeKeyPoints validates asOf on read, and stamps it when given published_at', () => {
    const raw = [
      { text: 'a', kind: 'new', asOf: 'article date' },
      { text: 'b', kind: 'background', asOf: '2026' },
      { text: 'c', kind: 'opinion', asOf: '' },
      'legacy string',
    ];
    expect(normalizeKeyPoints(raw)).toEqual([
      { text: 'a', kind: 'new' },
      { text: 'b', kind: 'background', asOf: '2026' },
      { text: 'c', kind: 'opinion' },
      { text: 'legacy string', kind: 'new' },
    ]);
    expect(normalizeKeyPoints(raw, PUBLISHED)).toEqual([
      { text: 'a', kind: 'new', asOf: '2026-11-18' },
      { text: 'b', kind: 'background', asOf: '2026' },
      { text: 'c', kind: 'opinion' },
      { text: 'legacy string', kind: 'new', asOf: '2026-11-18' },
    ]);
  });
});
