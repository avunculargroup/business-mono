/**
 * News metadata extraction.
 *
 * The structured-metadata step shared by every news ingestion path: given a
 * title + body, classify the article and pull a summary, key points, topic
 * tags, and the AU/Bitcoin relevance booleans. Distinct from the Rex relevance
 * rubric (newsRubric.ts) — this produces the structural news_items fields
 * (category, key_points, ...); the rubric produces the score and curator notes.
 *
 * Extracted from executeRoutineWorkflow so the RSS scan, the email research
 * listener, and unit tests can all reuse it without loading the whole workflow.
 */

import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { melbourneDate, stampKeyPointAsOf, type KeyPoint, type NewsCategory } from '@platform/shared';
import { dynamicModelFor, stepRequestContext } from '../config/model.js';
import { createLogger } from '../lib/logger.js';
import { splitRoundupSections, type RoundupSection } from '../lib/roundupSections.js';

const log = createLogger('news-ingest');

// Each point carries its role in the article, because a fresh article still
// restates old facts as context. The digest states only `new` points as news;
// classifying here, per point, is what lets code rather than a prompt make
// that cut. See KeyPoint in @platform/shared.
//
// asOf is a hint the model may give for background/opinion points only. It is
// never stored as given: stampKeyPointAsOf replaces it on `new` points with
// the publication date and nulls anything on the others that is not a valid
// YYYY[-MM[-DD]] no later than publication. The field stays a plain string
// here so one bad date costs that date, not a whole extraction retry.
const keyPointSchema = z.object({
  text: z.string()
    .describe('One short factual statement — a claim, number, name or date from the article. No marketing language.'),
  kind: z.enum(['new', 'background', 'opinion'])
    .describe('"new" = something this article makes public: an event, decision, release, data point, newly released minutes, a newly given explanation or reason, or a fresh reaction — even when the event it concerns is older. "background" = an earlier fact the article restates for context, such as a past rate decision or previously released data — even if stated in the present tense. "opinion" = the author\'s or a quoted person\'s view, forecast, expectation or argument.'),
  asOf: z.string().nullable().optional()
    .describe('Background and opinion points only: the date the fact refers to as YYYY-MM-DD, YYYY-MM or YYYY, and only when the article states it. Never later than the publication date. Leave empty for "new" points and whenever unsure — do not guess a year.'),
});

/** The headline instruction, shared by the schema, the prompt line and the backfill. */
export const HEADLINE_INSTRUCTION =
  "The article's own headline, or if none is evident a plain factual headline under 90 characters, sentence case, no source name, no hype.";

const headlineField = z.string().optional().describe(HEADLINE_INSTRUCTION);

export const newsExtractionSchema = z.object({
  category: z.enum(['regulatory', 'corporate', 'macro', 'international'])
    .describe('The single best-fit category: "regulatory" (ASIC/ATO/APRA/government policy), "corporate" (ASX/company treasury announcements), "macro" (RBA rates, AUD, inflation), or "international" (US/EU/global developments with AU implications).'),
  // Length is steered in the description rather than capped, matching the
  // summary in newsRubric.ts — which is the one actually stored (ingestNewsItem
  // prefers the rubric summary and keeps this only as a fallback). A hard cap
  // here rejected otherwise-good extractions a few characters over, costing the
  // article its key_points and topic_tags for nothing: news_items.summary is
  // TEXT with no length constraint.
  summary: z.string().min(40)
    .describe('A neutral 2–3 sentence summary of the article, up to about 500 characters. Use capital B for the Bitcoin protocol/network and lowercase b for the currency unit.'),
  key_points: z.array(keyPointSchema).min(2).max(7)
    .describe('2–7 key points capturing the main claims, numbers, names and dates, each classified as new, background or opinion.'),
  topic_tags: z.array(z.string()).min(2).max(8)
    .describe('2–8 lowercase, hyphenated topic tags. Examples: "etf", "rba", "asx-listed", "treasury-strategy", "mining", "regulation".'),
  australian_relevance: z.boolean()
    .describe('true only if the article is about Australia, Australian entities, or has clear direct implications for Australian regulation, markets, or businesses.'),
  bitcoin_relevance: z.boolean()
    .describe('true if the article meaningfully discusses Bitcoin, cryptocurrency, blockchain, digital assets, treasury strategy, or directly relevant macro/regulatory context. false for unrelated content (sports, entertainment, unrelated politics, etc.) even if a Bitcoin keyword appears in passing.'),
  // Asked for only when the page offered no usable title (needsHeadline), so
  // the fallback costs no extra call. See resolveHeadline in @platform/shared.
  headline: headlineField,
});

export type NewsExtraction = z.infer<typeof newsExtractionSchema>;

// A roundup's stories: metadata comes from one whole-body call, key points
// from one call per section (see splitRoundupSections).
const newsMetadataSchema = newsExtractionSchema.omit({ key_points: true });
const sectionKeyPointsSchema = z.object({
  key_points: z.array(keyPointSchema).min(1).max(4)
    .describe('1–4 key points from THIS section only, each classified as new, background or opinion.'),
});

/**
 * An item published within this many hours of extraction is fresh and must
 * yield at least one `new` point. Wider than the 24h social-post and curation
 * lookbacks, so an item those windows can pick up is always checked.
 * A missing published_at counts as fresh: the item is being ingested now.
 */
export const FRESH_WINDOW_HOURS = 48;

/** Written to rex_metadata.extraction_flags by ingestNewsItem. */
export type ExtractionFlag = 'no_new_key_points' | 'lead_has_no_new_key_point';

let newsExtractorAgent: Agent | null = null;
function getNewsExtractor(): Agent {
  if (!newsExtractorAgent) {
    newsExtractorAgent = new Agent({
      id: 'newsExtractor',
      name: 'newsExtractor',
      instructions:
        'You extract structured metadata from news articles for a Bitcoin treasury research database. ' +
        'Be neutral and factual. Capital B = the Bitcoin protocol/network; lowercase b = the currency unit. ' +
        'Avoid marketing language. Topic tags must be lowercase and hyphenated. ' +
        'Classify every key point by its role in the article: a past decision or earlier data restated for context is "background", never "new", even when the article is published today — e.g. an article about rate expectations that mentions "the RBA raised the cash rate to 4.60% at its last meeting" is reporting that hike as background. ' +
        'Freshness is about when the information became public, not when the underlying event happened: newly released minutes, a newly given explanation or reason, a new data release or a fresh reaction is "new" even when the event it concerns is older. ' +
        'E.g. "Minutes released today show three members dissented because unemployment had risen to 4.7% and house prices were falling" is new; "The RBA raised the cash rate to 4.85% at its November meeting", restated alongside it, is background. ' +
        'When an article reports something new, it must appear as its own "new" key point — never only in the summary. ' +
        'Set bitcoin_relevance=false for any article that does not meaningfully touch Bitcoin, crypto, blockchain, digital assets, treasury strategy, or directly relevant macro/regulatory context — even if the article was returned by a Bitcoin-themed search query. ' +
        'Always return data shaped exactly to the requested schema — never refuse, never wrap output in prose or code fences.',
      model: dynamicModelFor('executeRoutine.news_extractor'),
      defaultOptions: { modelSettings: { maxOutputTokens: 8192 } },
    });
  }
  return newsExtractorAgent;
}

/**
 * One structured-output call, with a single retry that names the constraint
 * that failed. A bare "did not satisfy the schema" leaves the model guessing,
 * so it reproduces the same output — a summary three characters over its cap
 * comes back the same length — and the second call is wasted. lastError
 * carries Mastra's per-field message.
 */
async function generateValidated<S extends z.ZodTypeAny>(
  schema: S,
  basePrompt: string,
  scopeKey: string,
): Promise<{ data: z.infer<S> | null; reason: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\nYour previous response was rejected: ${lastError}\n` +
        `Correct exactly that problem and return ONLY a valid object matching the schema — no prose, no code fences.`;
    try {
      const response = await getNewsExtractor().generate(
        [{ role: 'user', content: prompt }],
        {
          structuredOutput: { schema, errorStrategy: 'strict' },
          requestContext: stepRequestContext(scopeKey),
        },
      );
      const obj = response.object as z.infer<S> | undefined;
      if (obj) return { data: obj, reason: null };
      lastError = 'no_object_returned';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { data: null, reason: lastError?.slice(0, 200) ?? 'unknown' };
}

export function isFresh(publishedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!publishedAt) return true;
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t <= FRESH_WINDOW_HOURS * 60 * 60 * 1000;
}

const hasNew = (points: ReadonlyArray<{ kind: string }>) => points.some((p) => p.kind === 'new');

/** The follow-up prompt when a fresh item came back with no `new` point. */
function gapPrompt(basePrompt: string, published: string | null, points: ReadonlyArray<{ kind: string; text: string }>): string {
  const listed = points.map((p) => `- [${p.kind}] ${p.text}`).join('\n');
  return `${basePrompt}\n\n` +
    `Your previous extraction returned no "new" key points, but this was published ${published ? `on ${published}` : 'today'} and is in today's news. ` +
    `The points you returned were:\n${listed}\n` +
    `Re-read it and find what it makes public for the first time — newly released minutes, an explanation or reason given, a data release, a reaction — ` +
    `and return that as a "new" key point, stating the specifics. Facts restated from before stay "background".`;
}

function headerLines(input: { title: string; source: string; publishedAt?: string | null }): string {
  const published = melbourneDate(input.publishedAt);
  return `Title: ${input.title}\n` +
    `Source: ${input.source}\n` +
    `Published: ${published ? `${published} (Australia/Melbourne)` : 'unknown'}\n`;
}

/** Appended to the prompt when the caller's title is a page template (needsHeadline). */
function headlineLine(needsHeadline: boolean | undefined): string {
  return needsHeadline
    ? `\n\nThe Title given above is a page template or site name, not this article's headline — do not reuse it. ` +
      `Also return headline: ${HEADLINE_INSTRUCTION}`
    : '';
}

const AS_OF_INSTRUCTION =
  'asOf only on background/opinion points, only when the article states the date, as YYYY-MM-DD, YYYY-MM or YYYY ' +
  'and never later than the publication date; leave it empty on "new" points';

export async function extractNewsMetadata(input: {
  title: string;
  source: string;
  // When provided, a category hint the caller already knows (keyword routine).
  // When omitted (source scan), the extractor classifies the article itself.
  category?: NewsCategory;
  content: string;
  /**
   * The item's published_at. Shown to the model, stamped onto `new` points as
   * their asOf, and the bound for any other asOf. Null = unknown but being
   * ingested now (still freshness-checked); omitted = no freshness check.
   */
  publishedAt?: string | null;
  /** news_sources.multi_story: extract key points per section of a roundup. */
  multiStory?: boolean;
  /**
   * The title is a page template (resolveHeadline found nothing usable): ask
   * the model for a `headline` in the same call, and tell it not to reuse the title.
   */
  needsHeadline?: boolean;
  /**
   * Model scope key for this call, so an ingestion path can be configured
   * separately in /settings/models. Defaults to the shared extractor scope.
   */
  scopeKey?: string;
}): Promise<{
  data: NewsExtraction | null;
  reason: string | null;
  /** Freshness problems that remain after the retry; empty when none. */
  flags: ExtractionFlag[];
}> {
  const scopeKey = input.scopeKey ?? 'executeRoutine.news_extractor';
  // Only callers that pass publishedAt get the freshness check; one-off
  // re-extraction scripts over old rows omit it and are unaffected.
  const fresh = input.publishedAt !== undefined && isFresh(input.publishedAt);
  const published = melbourneDate(input.publishedAt);

  if (input.multiStory) {
    const sections = splitRoundupSections(input.content);
    if (sections.length >= 2) {
      const result = await extractRoundup(input, sections, scopeKey, fresh, published);
      if (result) return result;
      log.warn({ title: input.title }, 'roundup extraction failed; falling back to whole-item');
    }
  }

  const categoryLine = input.category
    ? `Category hint: ${input.category}\n`
    : `Classify this article into one of: regulatory, corporate, macro, international.\n`;
  const basePrompt =
    categoryLine +
    headerLines(input) + `\n` +
    `Article:\n${input.content}\n\n` +
    `Extract: category (best-fit of the four values), summary (2–3 sentences, at least 40 characters, up to about 500), ` +
    `key_points (2–7 factual points, each with kind new/background/opinion; ${AS_OF_INSTRUCTION}), ` +
    `topic_tags (2–8 lowercase hyphenated tags), australian_relevance (boolean), ` +
    `bitcoin_relevance (boolean — be honest; false if the article is unrelated even if a Bitcoin keyword appears in passing).` +
    headlineLine(input.needsHeadline);

  const first = await generateValidated(newsExtractionSchema, basePrompt, scopeKey);
  if (!first.data) {
    log.warn({ title: input.title, reason: first.reason }, 'extraction failed after retry');
    return { data: null, reason: first.reason, flags: [] };
  }

  let data: NewsExtraction = first.data;
  const flags: ExtractionFlag[] = [];
  if (fresh && !hasNew(data.key_points)) {
    const retry = await generateValidated(newsExtractionSchema, gapPrompt(basePrompt, published, data.key_points), scopeKey);
    if (retry.data && hasNew(retry.data.key_points)) {
      data = retry.data;
    } else {
      flags.push('no_new_key_points');
      log.warn({ title: input.title }, 'fresh item has no new key point after retry');
    }
  }

  return {
    data: { ...data, key_points: stampKeyPointAsOf(data.key_points as KeyPoint[], input.publishedAt) },
    reason: null,
    flags,
  };
}

/**
 * Roundup path: metadata from the whole body, key points per section, merged
 * in newsletter order. The lead section (the first) gets its own gap retry, so
 * the lead story's news cannot go missing behind the other sections'.
 * Returns null when nothing usable came back, so the caller falls back to the
 * whole-item path.
 */
async function extractRoundup(
  input: { title: string; source: string; category?: NewsCategory; content: string; publishedAt?: string | null; needsHeadline?: boolean },
  sections: RoundupSection[],
  scopeKey: string,
  fresh: boolean,
  published: string | null,
): Promise<{ data: NewsExtraction; reason: null; flags: ExtractionFlag[] } | null> {
  const categoryLine = input.category
    ? `Category hint: ${input.category}\n`
    : `Classify this newsletter into one of: regulatory, corporate, macro, international, by its lead story.\n`;
  const metaPrompt =
    categoryLine +
    headerLines(input) + `\n` +
    `This is a newsletter roundup of several stories.\n\nNewsletter:\n${input.content}\n\n` +
    `Extract: category (best-fit of the four values, by the lead story), summary (2–3 sentences, at least 40 characters, up to about 500, leading with the lead story), ` +
    `topic_tags (2–8 lowercase hyphenated tags), australian_relevance (boolean), ` +
    `bitcoin_relevance (boolean — be honest; false if no story meaningfully touches Bitcoin or directly relevant macro/regulatory context).` +
    headlineLine(input.needsHeadline);

  const flags: ExtractionFlag[] = [];
  const [meta, ...perSection] = await Promise.all([
    generateValidated(newsMetadataSchema, metaPrompt, scopeKey),
    ...sections.map(async (section, i) => {
      const prompt =
        headerLines(input) + `\n` +
        `This is one section of a multi-story newsletter${i === 0 ? ' — its lead story' : ''}. Extract key points from this section only.\n` +
        `Section: ${section.title}\n\n${section.text}\n\n` +
        `Extract key_points (1–4 factual points, each with kind new/background/opinion; ${AS_OF_INSTRUCTION}).`;
      const first = await generateValidated(sectionKeyPointsSchema, prompt, scopeKey);
      if (i !== 0 || !fresh || (first.data && hasNew(first.data.key_points))) return first.data?.key_points ?? [];
      const retry = await generateValidated(sectionKeyPointsSchema, gapPrompt(prompt, published, first.data?.key_points ?? []), scopeKey);
      if (retry.data && hasNew(retry.data.key_points)) return retry.data.key_points;
      flags.push('lead_has_no_new_key_point');
      log.warn({ title: input.title, section: section.title }, 'lead section has no new key point after retry');
      return retry.data?.key_points ?? first.data?.key_points ?? [];
    }),
  ]);

  if (!meta?.data) return null;
  const points = (perSection as Array<z.infer<typeof keyPointSchema>[]>).flat();
  if (points.length === 0) return null;
  if (fresh && !hasNew(points)) flags.push('no_new_key_points');

  return {
    data: { ...(meta.data as z.infer<typeof newsMetadataSchema>), key_points: stampKeyPointAsOf(points as KeyPoint[], input.publishedAt) },
    reason: null,
    flags,
  };
}

const headlineOnlySchema = z.object({ headline: z.string().min(1).describe(HEADLINE_INSTRUCTION) });

/**
 * One small call for a headline alone, over a stored body. For the title
 * backfill, where nothing else is being extracted; ingest gets its headline
 * from extractNewsMetadata (needsHeadline) instead, at no extra cost.
 */
export async function generateHeadline(input: {
  title: string;
  source: string;
  content: string;
  scopeKey?: string;
}): Promise<string | null> {
  const prompt =
    `Title: ${input.title}\nSource: ${input.source}\n\nArticle:\n${input.content}\n\n` +
    `The Title above is a page template or site name, not this article's headline — do not reuse it. ` +
    `Return headline: ${HEADLINE_INSTRUCTION}`;
  const { data } = await generateValidated(headlineOnlySchema, prompt, input.scopeKey ?? 'executeRoutine.news_extractor');
  return data?.headline?.trim() || null;
}
