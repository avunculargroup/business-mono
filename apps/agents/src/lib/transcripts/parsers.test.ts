import { describe, it, expect } from 'vitest';
import {
  parseVtt,
  parseSrt,
  parseJson,
  parseHtml,
  parsePlainText,
  timestampToSeconds,
} from './parsers.js';

describe('timestampToSeconds', () => {
  it('parses HH:MM:SS.mmm', () => {
    expect(timestampToSeconds('01:02:03.500')).toBeCloseTo(3723.5);
  });
  it('parses MM:SS', () => {
    expect(timestampToSeconds('02:05')).toBe(125);
  });
  it('accepts the SRT comma decimal', () => {
    expect(timestampToSeconds('00:00:04,250')).toBeCloseTo(4.25);
  });
  it('returns null on garbage', () => {
    expect(timestampToSeconds('not-a-time')).toBeNull();
  });
});

describe('parseVtt', () => {
  it('parses cues with timestamps and a voice-tag speaker', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:04.000',
      '<v Alice>Hello world',
      '',
      '00:00:04.000 --> 00:00:07.000',
      'Second line',
    ].join('\n');
    const out = parseVtt(vtt);
    expect(out.hasTimestamps).toBe(true);
    expect(out.segments).toHaveLength(2);
    expect(out.segments[0]).toMatchObject({ start: 1, end: 4, speaker: 'Alice', text: 'Hello world' });
    expect(out.segments[1]!.speaker).toBeNull();
    expect(out.text).toBe('Hello world\nSecond line');
  });

  it('ignores cue identifier lines', () => {
    const vtt = 'WEBVTT\n\ncue-1\n00:00:00.000 --> 00:00:02.000\nIntro';
    const out = parseVtt(vtt);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0]!.text).toBe('Intro');
  });
});

describe('parseSrt', () => {
  it('parses numbered blocks with comma decimals', () => {
    const srt = ['1', '00:00:01,000 --> 00:00:04,000', 'Hello', '', '2', '00:00:04,000 --> 00:00:06,000', 'World'].join('\n');
    const out = parseSrt(srt);
    expect(out.hasTimestamps).toBe(true);
    expect(out.segments).toHaveLength(2);
    expect(out.segments[0]).toMatchObject({ start: 1, end: 4, text: 'Hello' });
  });
});

describe('parseJson', () => {
  it('parses Podcasting 2.0 segments with speakers', () => {
    const json = JSON.stringify({
      version: '1.0.0',
      segments: [
        { startTime: 0, endTime: 3.5, speaker: 'Host', body: 'Welcome' },
        { startTime: 3.5, endTime: 6, speaker: 'Guest', body: 'Thanks' },
      ],
    });
    const out = parseJson(json);
    expect(out.hasTimestamps).toBe(true);
    expect(out.segments).toHaveLength(2);
    expect(out.segments[0]).toMatchObject({ start: 0, end: 3.5, speaker: 'Host', text: 'Welcome' });
    expect(out.text).toBe('Welcome\nThanks');
  });

  it('returns empty on invalid JSON', () => {
    expect(parseJson('{not json')).toEqual({ text: '', segments: [], hasTimestamps: false });
  });
});

describe('parseHtml', () => {
  it('strips tags and decodes entities, no timestamps', () => {
    const out = parseHtml('<p>Hello &amp; <b>welcome</b></p><p>Line two</p>');
    expect(out.hasTimestamps).toBe(false);
    expect(out.segments).toHaveLength(1);
    expect(out.text).toContain('Hello & welcome');
    expect(out.text).toContain('Line two');
  });
});

describe('parsePlainText', () => {
  it('passes through as a single untimed segment', () => {
    const out = parsePlainText('  just text  ');
    expect(out).toEqual({
      text: 'just text',
      segments: [{ start: null, end: null, speaker: null, text: 'just text' }],
      hasTimestamps: false,
    });
  });
  it('yields no segment for empty input', () => {
    expect(parsePlainText('   ').segments).toHaveLength(0);
  });
});
