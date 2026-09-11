/**
 * The `/prepare` template format: parser, validator, and the blocklist.
 *
 * Lives in `@platform/shared` because three places need it and they are in
 * different packages: `@platform/data-supabase` parses a stored template into
 * `PrepareTemplate`, `apps/client` renders the parsed sections, and `apps/web`
 * validates on save before a founder can set a template active. One parser,
 * three consumers — a second implementation would eventually disagree with the
 * first about what a valid template is, and the disagreement would surface as a
 * template that saved and would not render.
 *
 * The format is markdown with YAML front matter and typed `::section` blocks,
 * chosen so Lex can review a template by reading it rather than by running it.
 *
 * Spec: `docs/features/client-app/prepare-feature-spec.md`.
 */

export interface ParsedSection {
  id: string;
  /** Always a question. `validateTemplate` rejects anything that is not. */
  prompt: string;
  /** Why a board or auditor asks this. The teaching layer. */
  why: string;
  facts: string[];
  optional: boolean;
  regulatoryReference?: string;
}

export interface ParsedTemplate {
  slug: string;
  version: string;
  title: string;
  artefactType: string;
  clientType: string;
  regulatoryReferences: string[];
  factsRequired: string[];
  sections: ParsedSection[];
}

export interface TemplateProblem {
  /** Section id, or `'front-matter'` for a problem above the first block. */
  where: string;
  message: string;
}

/**
 * Phrases a template may not contain.
 *
 * This is crude and it will produce false positives. That is the correct
 * direction for it to fail: a template that trips the list gets read by a human
 * before it can go active, and a template that slips past it was going to be
 * read by Lex anyway. It is a backstop for that review, never a substitute —
 * anyone maintaining this list should assume creative phrasings get through.
 *
 * Everything here states a conclusion, recommends an action, or asserts an
 * outcome. The product's whole position is that BTS supplies the questions and
 * the evidence, and the subscriber supplies the judgement.
 */
export const PROHIBITED_CONCLUSIONS: readonly string[] = Object.freeze([
  'we recommend',
  'we suggest',
  'we advise',
  'our recommendation',
  'you should',
  'trustees should',
  'the board should',
  'the appropriate allocation',
  'the optimal allocation',
  'a reasonable allocation',
  'we consider it appropriate',
  'in our view',
  'best practice is',
  'the right amount',
  'is a good investment',
  'is a sound investment',
  'will outperform',
  'is guaranteed',
]);

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const SECTION_BLOCK = /^::section\s+id=([A-Za-z0-9_-]+)\s*\r?\n([\s\S]*?)^::\s*$/gm;

/**
 * A deliberately small YAML reader.
 *
 * Handles exactly what the template format uses: scalars, `- ` lists, `[a, b]`
 * inline lists, and `>` folded blocks. Pulling in a YAML library for this would
 * add a dependency to a leaf package that imports nothing, and the format is
 * ours — if a template needs a YAML feature this cannot read, the answer is to
 * simplify the template.
 */
function parseYamlish(source: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const lines = source.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    index += 1;

    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;

    const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1]!;
    const inline = match[2]!.trim();

    if (inline === '>' || inline === '|') {
      const folded: string[] = [];
      while (index < lines.length && /^\s+\S/.test(lines[index]!)) {
        folded.push(lines[index]!.trim());
        index += 1;
      }
      out[key] = inline === '>' ? folded.join(' ') : folded.join('\n');
      continue;
    }

    if (inline.startsWith('[') && inline.endsWith(']')) {
      out[key] = inline
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      continue;
    }

    if (inline === '') {
      const items: string[] = [];
      while (index < lines.length && /^\s*-\s+/.test(lines[index]!)) {
        items.push(lines[index]!.replace(/^\s*-\s+/, '').trim());
        index += 1;
      }
      out[key] = items;
      continue;
    }

    out[key] = inline.replace(/^["']|["']$/g, '');
  }

  return out;
}

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(' ');
  return value ?? '';
}

function asList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

/**
 * Parses a template body. Structure only — `validateTemplate` judges it.
 *
 * Split that way so `apps/web` can show a founder a parsed preview of an
 * invalid template alongside its problems, rather than an error and nothing.
 */
export function parseTemplate(body: string): ParsedTemplate {
  const frontMatch = FRONT_MATTER.exec(body);
  const front = frontMatch ? parseYamlish(frontMatch[1]!) : {};
  const rest = frontMatch ? body.slice(frontMatch[0].length) : body;

  const sections: ParsedSection[] = [];
  SECTION_BLOCK.lastIndex = 0;

  let block: RegExpExecArray | null;
  while ((block = SECTION_BLOCK.exec(rest)) !== null) {
    const id = block[1]!;
    const fields = parseYamlish(block[2]!);

    sections.push({
      id,
      prompt: asString(fields['prompt']),
      why: asString(fields['why']),
      facts: asList(fields['facts']),
      optional: asString(fields['optional']).toLowerCase() === 'true',
      ...(fields['regulatory_reference']
        ? { regulatoryReference: asString(fields['regulatory_reference']) }
        : {}),
    });
  }

  return {
    slug: asString(front['slug']),
    version: asString(front['version']),
    title: asString(front['title']),
    artefactType: asString(front['artefact_type']),
    clientType: asString(front['client_type']),
    regulatoryReferences: asList(front['regulatory_references']),
    factsRequired: asList(front['facts_required']),
    sections,
  };
}

/**
 * Every problem with a template, rather than the first.
 *
 * A founder fixing a template one error per save is a founder who stops fixing
 * templates.
 */
export function validateTemplate(
  parsed: ParsedTemplate,
  body: string,
  knownFactKeys: readonly string[],
): TemplateProblem[] {
  const problems: TemplateProblem[] = [];

  if (!parsed.slug) problems.push({ where: 'front-matter', message: 'slug is required' });
  if (!parsed.version) {
    problems.push({ where: 'front-matter', message: 'version is required' });
  }
  if (!parsed.title) problems.push({ where: 'front-matter', message: 'title is required' });
  if (parsed.sections.length === 0) {
    problems.push({ where: 'front-matter', message: 'a template needs at least one section' });
  }

  // A fact key the template declares but no source can serve would render as a
  // stated absence on every pack generated from it, for ever. Better caught on
  // save than discovered in a board paper.
  for (const key of parsed.factsRequired) {
    if (!knownFactKeys.includes(key)) {
      problems.push({
        where: 'front-matter',
        message: `facts_required names '${key}', which no fact source provides`,
      });
    }
  }

  const seen = new Set<string>();
  for (const section of parsed.sections) {
    if (seen.has(section.id)) {
      problems.push({
        where: section.id,
        // Responses key off the section id, so a duplicate would make two
        // questions share one answer and silently lose a subscriber's writing.
        message: 'duplicate section id — responses key off this and would collide',
      });
    }
    seen.add(section.id);

    if (!section.prompt) {
      problems.push({ where: section.id, message: 'prompt is required' });
    } else if (!section.prompt.trim().endsWith('?')) {
      problems.push({
        where: section.id,
        message: 'prompt must be a question — a statement in this position reads as a conclusion',
      });
    }

    if (!section.why) {
      problems.push({
        where: section.id,
        message: 'why is required — it is the teaching layer, and the reason the pack is worth more than a form',
      });
    }

    for (const key of section.facts) {
      if (!parsed.factsRequired.includes(key)) {
        problems.push({
          where: section.id,
          message: `binds fact '${key}', which is not in facts_required`,
        });
      }
    }
  }

  const lowered = body.toLowerCase();
  for (const phrase of PROHIBITED_CONCLUSIONS) {
    if (lowered.includes(phrase)) {
      problems.push({
        where: 'front-matter',
        message: `contains a prohibited conclusion: "${phrase}". The pack asks questions and states facts; it never states conclusions.`,
      });
    }
  }

  return problems;
}

/**
 * There is no `placeholder` key and there will not be one.
 *
 * A model answer is advice with extra steps, and the moment one exists nine
 * subscribers in ten submit it unchanged. Recorded as a constant so that
 * someone adding the feature has to delete this first.
 */
export const NO_PLACEHOLDER_KEY = true as const;
