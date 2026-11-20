import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_ROUNDUP_SECTIONS, splitRoundupSections } from './roundupSections.js';

const fixture = readFileSync(
  resolve(__dirname, '../../test/fixtures/roundups/rba-minutes-roundup.md'),
  'utf-8',
);

describe('splitRoundupSections — rba-minutes-roundup fixture', () => {
  const sections = splitRoundupSections(fixture);

  it('isolates the lead story, with the minutes and the dissenters\' reasons, as the first section', () => {
    const lead = sections[0]!;
    expect(lead.title).toBe('Rate split deepens on the RBA board');
    expect(lead.text).toContain('Minutes of the Melbourne Cup Day meeting');
    expect(lead.text).toContain('4.7 per cent');
    expect(lead.text).toContain('house prices are still falling');
    // Nothing from the stories after it.
    expect(lead.text).not.toContain('largest company');
    expect(lead.text).not.toContain('ransom');
  });

  it('gives every story its own section, titled with its group', () => {
    expect(sections.map((s) => s.title)).toEqual([
      'Rate split deepens on the RBA board',
      'Market mover: The big bank takes back the top spot',
      'Q+A today',
      'Briefly: Shares slide with global tech',
      'Briefly: Treasurer flags simpler tax rules',
      'Briefly: Department store collapse leaves large debts',
      'Sentiment watch: Buyers turn gloomy on house prices',
    ]);
  });

  it('drops chrome sections with no prose', () => {
    const all = sections.map((s) => s.text).join('\n');
    expect(all).not.toContain('PODCAST LINK');
    expect(all).not.toContain('LISTEN TO THE INTERVIEW');
    expect(all).not.toContain('**SUBSCRIBE**');
  });
});

describe('splitRoundupSections', () => {
  it('returns one section for a single-story article', () => {
    const body = 'A single article with one story and enough prose to count as a section on its own.\n\nMore of it.';
    expect(splitRoundupSections(body)).toEqual([{ title: 'Lead', text: body }]);
  });

  it('merges stories past the cap into the last section rather than dropping them', () => {
    const story = (n: number) => `**Story ${n}**\n\n${`Story ${n} body text. `.repeat(6)}`;
    const body = Array.from({ length: MAX_ROUNDUP_SECTIONS + 3 }, (_, i) => story(i + 1)).join('\n\n');
    const sections = splitRoundupSections(body);
    expect(sections).toHaveLength(MAX_ROUNDUP_SECTIONS);
    expect(sections.at(-1)!.text).toContain(`Story ${MAX_ROUNDUP_SECTIONS + 3} body`);
  });
});
