import type {
  AbsentFact,
  CompanyIdentity,
  Fact,
  PrepareTemplate,
  TemplateSection,
} from '@platform/data';
import type { StoredPack, StoredResponse } from './store';

/**
 * Composing a pack into markdown.
 *
 * Pure, and deliberately so: it takes the template, the facts and the
 * subscriber's prose and returns a string. It performs no I/O, which is what
 * lets it be tested exhaustively and what makes it obvious by inspection that
 * composed prose never leaves the device.
 *
 * Three rules from the spec are enforced here rather than trusted:
 *
 *   1. A fact renders in its own labelled block, never inside a sentence. The
 *      template cannot interpolate one, because there is no interpolation step.
 *   2. A skipped section renders as "Not addressed" rather than vanishing. A
 *      board paper with a visible gap is more useful than one that conceals it.
 *   3. Every export carries front matter and a provenance appendix, generated
 *      rather than authored.
 */

export interface ComposeInput {
  pack: StoredPack;
  template: PrepareTemplate;
  responses: Map<string, StoredResponse>;
  facts: Fact[];
  absent: AbsentFact[];
  identity: CompanyIdentity | null;
  generalAdviceWarning: string;
  factsFetchedAt: string;
  now: Date;
}

function isoDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? 'not stated' : date.toISOString().slice(0, 10);
}

/**
 * The identity block.
 *
 * Legal name and ABN, not the trading name: every export is potentially a
 * regulatory artefact, and an acronym in front of a regulator is a small
 * unforced error while the ABN is often the only thing that makes the entity
 * identifiable. See `references/naming.md` on the three registers.
 *
 * When `company_profile` is empty the block says so rather than inventing a
 * name. An export with a plausible-looking wrong ABN is worse than one that
 * admits the gap.
 */
function identityLines(identity: CompanyIdentity | null): string[] {
  if (!identity) {
    return [
      'prepared_by: NOT CONFIGURED — the company profile has not been completed.',
      '  This export is not suitable for circulation until it has.',
    ];
  }

  const lines = [`prepared_by: ${identity.legalName}`];
  if (identity.abn) lines.push(`abn: ${identity.abn}`);
  if (identity.arNumber) lines.push(`authorised_representative_number: ${identity.arNumber}`);
  if (identity.licenceHolder) lines.push(`licensee: ${identity.licenceHolder}`);
  if (identity.licenceNumber) lines.push(`afsl: ${identity.licenceNumber}`);
  return lines;
}

function frontMatter(input: ComposeInput): string {
  const { pack, template, identity, generalAdviceWarning, now } = input;

  return [
    '---',
    `title: ${pack.title}`,
    `artefact_type: ${template.artefactType}`,
    `prepared: ${isoDate(now)}`,
    `template: ${template.slug}`,
    `template_version: ${template.version}`,
    ...identityLines(identity),
    ...(template.regulatoryReferences.length > 0
      ? [
          'regulatory_references:',
          ...template.regulatoryReferences.map((reference) => `  - ${reference}`),
        ]
      : []),
    '---',
    '',
    `# ${pack.title}`,
    '',
    '> **General advice warning**',
    ...generalAdviceWarning
      .split('\n')
      .map((line) => `> ${line.trim()}`)
      .filter((line) => line !== '>' || true),
    '',
    '> Facts in this document are stated as at their individual dates, which are listed in',
    '> full in the provenance appendix.',
    '',
  ].join('\n');
}

/**
 * A fact block. Labelled, dated, sourced, and never inside a sentence.
 *
 * The rule matters more than it looks. A sentence characterises what it
 * contains — "bitcoin has risen sharply" is a view about a number, where a
 * labelled row carrying the number, its date and its source is not. If the
 * subscriber wants to characterise it, they can, in their own prose, which is
 * exactly what the two-layer split is for.
 */
function factBlock(facts: Fact[], absent: AbsentFact[]): string {
  if (facts.length === 0 && absent.length === 0) return '';

  const rows = [
    ...facts.map(
      (fact) =>
        `| ${fact.label} | ${fact.value}${fact.unit ? ` ${fact.unit}` : ''} | ${fact.asAt} | ${fact.sourceName} | ${fact.basis} |`,
    ),
    // Requested-but-unavailable facts are listed as unavailable rather than
    // omitted. Absence is a fact, and a reader who cannot see that a figure was
    // sought and not found will assume it was never sought.
    ...absent.map(
      (fact) => `| ${fact.label} | not available | — | — | ${fact.reason.replace(/_/g, ' ')} |`,
    ),
  ];

  return [
    '',
    '| Fact | Value | As at | Source | Basis |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function sectionBody(
  section: TemplateSection,
  response: StoredResponse | undefined,
  facts: Fact[],
  absent: AbsentFact[],
): string {
  const bound = facts.filter((fact) => section.facts.includes(fact.key));
  const boundAbsent = absent.filter((fact) => section.facts.includes(fact.key));

  const parts = [
    `## ${section.prompt.replace(/\?$/, '')}`,
    '',
    ...(section.regulatoryReference ? [`*${section.regulatoryReference}*`, ''] : []),
    factBlock(bound, boundAbsent),
  ];

  if (response?.skipped) {
    // Visible, not silent. A trustee minute with a visible gap tells an auditor
    // exactly what to ask about, which is — unintuitively — the trustee's
    // interest as well as everyone else's.
    parts.push('*Not addressed.*', '');
  } else if (response?.body?.trim()) {
    parts.push(response.body.trim(), '');
  } else {
    parts.push('*Not addressed.*', '');
  }

  return parts.join('\n');
}

function provenanceAppendix(input: ComposeInput): string {
  const { facts, absent, factsFetchedAt, now } = input;

  const lines = [
    '---',
    '',
    '## Provenance appendix',
    '',
    `Facts in this document were retrieved on ${isoDate(factsFetchedAt)} and are stated as at`,
    'the individual dates below.',
    '',
  ];

  if (facts.length === 0) {
    lines.push('No facts were served for this document.', '');
  } else {
    lines.push(
      '| Fact | Value | As at | Age at export | Source | Basis |',
      '|---|---|---|---|---|---|',
    );

    for (const fact of facts) {
      const observed = new Date(fact.asAt);
      const days = Number.isNaN(observed.getTime())
        ? null
        : Math.floor((now.getTime() - observed.getTime()) / 86_400_000);

      // A pack exported with stale facts says so, here, where a reader
      // checking the figures will look.
      const age =
        days === null
          ? 'undated'
          : fact.expectedCadenceDays !== undefined && days > fact.expectedCadenceDays
            ? `${days} days — past its expected cadence of ${fact.expectedCadenceDays}`
            : `${days} days`;

      const source = fact.sourceUrl ? `${fact.sourceName} (${fact.sourceUrl})` : fact.sourceName;
      lines.push(
        `| ${fact.label} | ${fact.value}${fact.unit ? ` ${fact.unit}` : ''} | ${fact.asAt} | ${age} | ${source} | ${fact.basis} |`,
      );
    }
    lines.push('');
  }

  if (absent.length > 0) {
    lines.push(
      '### Requested and unavailable',
      '',
      ...absent.map((fact) => `- ${fact.label} — ${fact.reason.replace(/_/g, ' ')}`),
      '',
    );
  }

  return lines.join('\n');
}

/** The whole pack, as markdown. */
export function composePack(input: ComposeInput): string {
  const { template, responses, facts, absent } = input;

  return [
    frontMatter(input),
    ...template.sections.map((section) =>
      sectionBody(section, responses.get(section.id), facts, absent),
    ),
    provenanceAppendix(input),
  ].join('\n');
}

/**
 * How far through a pack is, as counts.
 *
 * Sections and completions, never a percentage. A percentage implies the
 * document is a task to be finished rather than a piece of thinking to be done,
 * and the difference is the whole product.
 */
export function packProgress(
  template: PrepareTemplate,
  responses: Map<string, StoredResponse>,
): { answered: number; skipped: number; total: number } {
  let answered = 0;
  let skipped = 0;

  for (const section of template.sections) {
    const response = responses.get(section.id);
    if (response?.skipped) skipped += 1;
    else if (response?.body?.trim()) answered += 1;
  }

  return { answered, skipped, total: template.sections.length };
}
