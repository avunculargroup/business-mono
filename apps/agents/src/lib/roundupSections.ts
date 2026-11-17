/**
 * Splits a multi-story newsletter roundup (news_sources.multi_story) into its
 * stories, so key points are extracted per story. Extracted whole, a roundup's
 * lead story competes with five others for seven key points — Fear & Greed's
 * 17 Nov issue lost "RBA minutes reveal why three members dissented" that way,
 * keeping only the 3 Nov vote it restated as background.
 *
 * Boundaries are the two shapes roundups use once converted to markdown:
 *   - a `##`/`###` heading opens a group ("News in brief", "Q+A today");
 *   - a whole-line bold headline opens a story, within the current group.
 * Sections with almost no prose (podcast buttons, "SIGN UP") are dropped.
 * Pure — no I/O — so it is tested against the fixture directly.
 */

export interface RoundupSection {
  /** Headline, prefixed with its group when it has one. "Lead" for untitled opening text. */
  title: string;
  /** The section's markdown, headline included. */
  text: string;
}

// Below this a section is chrome, not a story: "**APPLE PODCASTS**", a lone link.
const MIN_SECTION_CHARS = 80;
// A newsletter with more sections than this is merged at the tail rather than
// fanning out into a call per blurb.
export const MAX_ROUNDUP_SECTIONS = 10;

const HEADING_RE = /^#{2,3}\s+(.+?)\s*#*\s*$/;
// A line that is nothing but bold text, short enough to be a headline.
const BOLD_HEADLINE_RE = /^\*\*([^*\n]{3,160})\*\*\s*$/;

export function splitRoundupSections(markdown: string): RoundupSection[] {
  const sections: RoundupSection[] = [];
  let group: string | null = null;
  let headline: string | null = null;
  let lines: string[] = [];

  const flush = () => {
    const prose = lines.join('\n').trim();
    if (prose.length >= MIN_SECTION_CHARS) {
      const title = headline ? (group ? `${group}: ${headline}` : headline) : (group ?? 'Lead');
      const text = headline ? `**${headline}**\n\n${prose}` : prose;
      sections.push({ title, text });
    }
    lines = [];
  };

  for (const line of markdown.split('\n')) {
    const heading = HEADING_RE.exec(line.trim());
    if (heading) {
      flush();
      group = heading[1]!.trim();
      headline = null;
      continue;
    }
    const bold = BOLD_HEADLINE_RE.exec(line.trim());
    if (bold) {
      flush();
      headline = bold[1]!.trim();
      continue;
    }
    lines.push(line);
  }
  flush();

  if (sections.length <= MAX_ROUNDUP_SECTIONS) return sections;
  const kept = sections.slice(0, MAX_ROUNDUP_SECTIONS - 1);
  const rest = sections.slice(MAX_ROUNDUP_SECTIONS - 1);
  kept.push({ title: rest[0]!.title, text: rest.map((s) => s.text).join('\n\n') });
  return kept;
}
