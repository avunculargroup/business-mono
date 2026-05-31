import type { ReviewedStory } from './schemas.js';

// Deterministic newsletter assembly. Pure + side-effect free so the template,
// placeholder resolution, and word-count flagging are unit-testable. Company
// details ({{abn}}, {{website}}, etc.) are resolved from a map sourced from the
// existing company_records table (keys: legal_name, trading_name, abn, website,
// tagline, ...).

export type CompanyVars = Record<string, string>;

/** Count words in a markdown string (whitespace-delimited, tags stripped). */
export function countWords(text: string): number {
  const stripped = text.replace(/[#>*_`\-]/g, ' ').trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).length;
}

/**
 * Replace {{key}} placeholders from the supplied vars. Unknown placeholders are
 * removed (resolved to empty string) so no raw {{...}} leaks into the output.
 * Supports a few spec aliases ({{bts_abn}} → abn, {{public_website}} → website).
 */
export function resolvePlaceholders(template: string, vars: CompanyVars): string {
  const aliases: Record<string, string> = {
    bts_abn: 'abn',
    public_website: 'website',
  };
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = aliases[rawKey] ?? rawKey;
    return vars[key] ?? '';
  });
}

/** Story IDs whose word count exceeds the target by more than 30%. */
export function overLengthStoryIds(stories: ReviewedStory[], targetWordCount: number): string[] {
  const ceiling = targetWordCount * 1.3;
  return stories.filter((s) => s.word_count > ceiling).map((s) => s.story_id);
}

export interface AssembleArgs {
  title: string;
  date: Date;
  intro: string;
  outro: string;
  stories: ReviewedStory[]; // already in display order
  company: CompanyVars;
}

function companyName(company: CompanyVars): string {
  return company['trading_name'] || company['legal_name'] || 'Bitcoin Treasury Solutions';
}

/** Assemble the full newsletter markdown from its parts. */
export function assembleNewsletter(args: AssembleArgs): string {
  const { title, date, intro, outro, stories, company } = args;
  const formattedDate = date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const name = companyName(company);

  const storyBlocks = stories
    .map((s) => `## ${s.title}\n\n${s.body.trim()}`)
    .join('\n\n---\n\n');

  const footerTagline = company['tagline']
    ? `*${company['tagline']}*\n`
    : `*${name} helps Australian corporates navigate bitcoin treasury strategy.*\n`;
  const abn = company['abn'] ? `ABN ${company['abn']}` : '';
  const website = company['website'] ?? '';
  const footerMeta = [abn, website].filter(Boolean).join(' | ');

  return [
    `# ${title}`,
    `*${formattedDate} | ${name}*`,
    '',
    '---',
    '',
    '## From the team',
    '',
    intro.trim(),
    '',
    '---',
    '',
    storyBlocks,
    '',
    '---',
    '',
    "## That's it for this issue",
    '',
    outro.trim(),
    '',
    footerTagline + (footerMeta ? `*${footerMeta}*` : ''),
    '',
  ].join('\n');
}
