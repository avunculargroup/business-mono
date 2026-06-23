// Pure parsers for the transcript formats the waterfall encounters. Each returns
// a normalised shape: the full plain text (for display + FTS), an ordered list
// of timed segments (for timestamp-preserving chunking), and whether timestamps
// were present at all. html/text have no timestamps → a single untimed segment.

export interface TimedSegment {
  start: number | null;
  end: number | null;
  speaker: string | null;
  text: string;
}

export interface ParsedTranscript {
  text: string;
  segments: TimedSegment[];
  hasTimestamps: boolean;
}

// Parse "HH:MM:SS.mmm", "MM:SS.mmm" or the SRT comma variant into seconds.
// Returns null on anything unparseable.
export function timestampToSeconds(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n))) return null;
  if (nums.length === 3) return nums[0]! * 3600 + nums[1]! * 60 + nums[2]!;
  return nums[0]! * 60 + nums[1]!;
}

function joinText(segments: TimedSegment[]): string {
  return segments.map((s) => s.text).join('\n').trim();
}

// Strip simple inline VTT tags (<v Speaker>, <c>, <00:00:00.000>) from cue text
// and try to pull a speaker name out of a leading <v Name> voice tag.
function extractVttSpeaker(line: string): { speaker: string | null; text: string } {
  const voice = line.match(/^<v\s+([^>]+)>/i);
  const speaker = voice?.[1]?.trim() ?? null;
  const text = line.replace(/<[^>]+>/g, '').trim();
  return { speaker, text };
}

const TIMING_RE =
  /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}|\d{1,2}:\d{2}(?::\d{2})?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}|\d{1,2}:\d{2}(?::\d{2})?)/;

// Shared cue-block parser for VTT and SRT — they differ only in the decimal
// separator (handled by timestampToSeconds) and the optional WEBVTT header /
// numeric index line, both of which we skip by keying off the timing line.
function parseCueBlocks(raw: string): ParsedTranscript {
  const blocks = raw.replace(/^﻿/, '').split(/\r?\n\r?\n/);
  const segments: TimedSegment[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const timingIdx = lines.findIndex((l) => TIMING_RE.test(l));
    if (timingIdx === -1) continue;

    const m = lines[timingIdx]!.match(TIMING_RE)!;
    const start = timestampToSeconds(m[1]!);
    const end = timestampToSeconds(m[2]!);

    const textLines = lines.slice(timingIdx + 1);
    if (textLines.length === 0) continue;

    let speaker: string | null = null;
    const cleaned = textLines.map((line, i) => {
      const { speaker: s, text } = extractVttSpeaker(line);
      if (i === 0 && s) speaker = s;
      return text;
    });

    segments.push({ start, end, speaker, text: cleaned.join(' ').trim() });
  }

  return { text: joinText(segments), segments, hasTimestamps: segments.length > 0 };
}

export function parseVtt(raw: string): ParsedTranscript {
  return parseCueBlocks(raw);
}

export function parseSrt(raw: string): ParsedTranscript {
  return parseCueBlocks(raw);
}

// Podcasting 2.0 JSON transcript: { version, segments: [{ startTime, endTime,
// speaker, body }] }. The richest format — carries speaker labels + timestamps.
export function parseJson(raw: string): ParsedTranscript {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return { text: '', segments: [], hasTimestamps: false };
  }

  const rawSegments = (doc as { segments?: unknown }).segments;
  if (!Array.isArray(rawSegments)) {
    return { text: '', segments: [], hasTimestamps: false };
  }

  const segments: TimedSegment[] = [];
  for (const s of rawSegments) {
    const seg = s as Record<string, unknown>;
    const body = typeof seg['body'] === 'string' ? seg['body'].trim() : '';
    if (!body) continue;
    const start = typeof seg['startTime'] === 'number' ? seg['startTime'] : null;
    const end = typeof seg['endTime'] === 'number' ? seg['endTime'] : null;
    const speaker = typeof seg['speaker'] === 'string' ? seg['speaker'] : null;
    segments.push({ start, end, speaker, text: body });
  }

  const hasTimestamps = segments.some((s) => s.start !== null);
  return { text: joinText(segments), segments, hasTimestamps };
}

// Decode the small set of HTML entities feed transcripts and YouTube captions
// emit. &amp; is decoded first so double-encoded forms (&amp;#39;) resolve too.
export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

// Hard ceiling on the input to the regex chain below. parseHtml runs ~10 chained
// global .replace() passes, each allocating a fresh full-size string; on the
// memory-constrained agents host (heap ~256 MB, near its ceiling at baseline) a
// multi-MB input spikes enough transient garbage to OOM mid-replace. The feed-tag
// byte cap is the first line of defence; this guards every other caller too (the
// fetch byte count can undercount a multibyte-decoded body, and ad-hoc/future
// callers are uncapped). An honest transcript is a few hundred KB, so 2M chars is
// far above any real one; truncating a pathological body mid-markup is fine for
// best-effort plain text.
const MAX_HTML_PARSE_CHARS = 2_000_000;

// Strip tags/entities to plain text. No timestamps → a single untimed segment.
export function parseHtml(raw: string): ParsedTranscript {
  const input = raw.length > MAX_HTML_PARSE_CHARS ? raw.slice(0, MAX_HTML_PARSE_CHARS) : raw;
  const text = decodeEntities(
    input
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>(?=\S)/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    text,
    segments: text ? [{ start: null, end: null, speaker: null, text }] : [],
    hasTimestamps: false,
  };
}

export function parsePlainText(raw: string): ParsedTranscript {
  const text = raw.trim();
  return {
    text,
    segments: text ? [{ start: null, end: null, speaker: null, text }] : [],
    hasTimestamps: false,
  };
}
