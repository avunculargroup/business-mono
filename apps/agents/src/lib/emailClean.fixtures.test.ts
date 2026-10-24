import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { CLEAN_RULES } from './emailClean.js';
import { htmlToMarkdown, normaliseMarkdown } from './newsletterExtract.js';
import { SUBJECTS } from './emailClean.fixtures.subjects.js';

// Golden fixtures: one synthetic email per template family, with the markdown
// htmlToMarkdown must produce (test/fixtures/newsletters/README.md). Rebuild
// the .md files after a deliberate rule change with
//   UPDATE_NEWSLETTER_FIXTURES=1 pnpm --filter @platform/agents test emailClean
// and review the diff — it is the change.
const dir = new URL('../../test/fixtures/newsletters/', import.meta.url);
const update = process.env['UPDATE_NEWSLETTER_FIXTURES'] === '1';

const htmlFixtures = readdirSync(dir)
  .filter((f) => f.endsWith('.html'))
  .map((f) => f.replace(/\.html$/, ''));

function read(name: string, ext: string): string {
  return readFileSync(new URL(`${name}.${ext}`, dir), 'utf8');
}

describe('golden newsletter fixtures', () => {
  it('has a subject for every fixture', () => {
    expect(htmlFixtures.length).toBeGreaterThanOrEqual(5);
    for (const name of htmlFixtures) expect(SUBJECTS[name], name).toBeDefined();
  });

  it.each(htmlFixtures)('%s converts to its snapshot', (name) => {
    const md = `${htmlToMarkdown(read(name, 'html'), { subject: SUBJECTS[name] })}\n`;
    if (update) writeFileSync(new URL(`${name}.md`, dir), md);
    expect(md).toBe(read(name, 'md'));
  });

  it('plain-text converts to its snapshot', () => {
    const md = `${normaliseMarkdown(read('plain-text', 'txt'), { subject: SUBJECTS['plain-text'] })}\n`;
    if (update) writeFileSync(new URL('plain-text.md', dir), md);
    expect(md).toBe(read('plain-text', 'md'));
  });

  it.each(htmlFixtures)('%s leaves no tracking, spacer or empty-link residue', (name) => {
    const md = read(name, 'md');
    expect(md).not.toMatch(/[͏­​-‍⁠﻿]/);
    expect(md).not.toMatch(/\[\s*\]\(/);
    expect(md).not.toMatch(/hubspotlinks|list-manage|email-st\.seekingalpha|\/e\/c\/|sbstck|substack\.com\/redirect|\/r\/[0-9a-f]{8}/);
    expect(md).not.toMatch(/utm_|_hsenc|userid=|mailingid=|[?&]m=|[?&]r=|eyJ/);
    expect(md).not.toMatch(/unsubscribe/i);
  });

  // A suite that passes with a rule switched off is not testing that rule —
  // CLAUDE.md records a contract assertion that passed vacuously once.
  it.each(CLEAN_RULES)('turning off %s changes at least one fixture', (rule) => {
    const changed = htmlFixtures.filter(
      (name) => htmlToMarkdown(read(name, 'html'), { subject: SUBJECTS[name], disableRules: [rule] }) !== read(name, 'md').trimEnd(),
    );
    expect(changed, `no fixture depends on ${rule}`).not.toHaveLength(0);
  });
});
