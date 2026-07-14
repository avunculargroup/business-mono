/**
 * Generic routine execution workflow.
 *
 * Polled hourly by `routineListener`. On each tick, fetches any active
 * routines whose `next_run_at` has passed, dispatches each to the configured
 * agent for its `action_type`, persists the result, and reschedules
 * `next_run_at` based on the routine's frequency.
 *
 * Supersedes the older `monitorResearchWorkflow` (research_monitors only).
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { supabase } from '@platform/db';
import type { Database, Json } from '@platform/db';
import OpenAI from 'openai';
import type {
  ResearchBrief,
  ResearchResult,
  ResearchSource,
  RoutineActionType,
  RoutineFrequency,
  RoutineResult,
  NewsIngestionConfig,
  NewsCategory,
  NewsIngestResult,
  NewsSourceScanConfig,
  NewsSourceScanResult,
  PodcastIngestConfig,
  PodcastIngestResult,
  NewsCurationConfig,
  NewsCurationStory,
  IndicatorPollResult,
  OnchainPollResult,
  MarketReportResult,
} from '@platform/shared';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, defaultRelevanceFilter } from '@platform/shared';
import { runIndicatorPoll } from '../lib/indicators/runIndicatorPoll.js';
import { runOnchainPoll } from '../lib/onchain/runOnchainPoll.js';
import { runMarketReport } from '../lib/report/runMarketReport.js';
import { runSocialPost } from './socialPost/index.js';
import { rex } from '../agents/researcher/index.js';
import { charlie } from '../agents/contentCreator/index.js';
import { editor } from '../agents/editorial/index.js';
import { fetchUrl } from '../agents/researcher/tools.js';
import { coerceToSchema } from './newsletter/coerce.js';
import { startNewsletterRun } from './startNewsletterRun.js';
import { shouldDropForRelevance } from './newsRelevance.js';
import { extractNewsMetadata } from './newsExtract.js';
import { normalizeNewsUrl, dedupeShortlistIndices } from './newsDedup.js';
import { fetchOgImage } from '../lib/fetchOgImage.js';
import { deliverNewsDigest } from '../lib/sendNewsDigest.js';
import { computeNextRunAt } from '../lib/computeNextRunAt.js';
import { cosineSimilarity } from '../lib/cosineSimilarity.js';
import { normalizeFeedItems } from '../lib/newsFeed.js';
import { fetchFeed, fetchPodcastFeed } from '../lib/fetchFeed.js';
import { normalizePodcastItems } from '../lib/podcastFeed.js';
import { resolveTranscript } from '../lib/transcripts/resolveTranscript.js';
import {
  insertEpisodeIfNew,
  updateEpisode,
  fetchExistingGuids,
  storeAvailableTranscript,
} from '../lib/transcripts/store.js';
import { dynamicModelFor, stepRequestContext } from '../config/model.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('routine-workflow');
const curationLog = createLogger('news-curation');
const ingestLog = createLogger('news-ingest');
const scanLog = createLogger('news-source-scan');
const podcastLog = createLogger('podcast-ingest');

// ── Step 1: Fetch due routines ───────────────────────────────────────────────

const routineSchema = z.object({
  id: z.string(),
  name: z.string(),
  agent_name: z.string(),
  action_type: z.string(),
  action_config: z.record(z.unknown()),
  frequency: z.string(),
  time_of_day: z.string(),
  timezone: z.string(),
});

const newsJudgeSchema = z.object({
  shortlist: z
    .array(
      z.object({
        index: z.number().int().nonnegative()
          .describe('The verbatim candidate index from the input list.'),
      }),
    )
    .min(1)
    .max(20),
});

const curationSelectSchema = z.object({
  selected: z
    .array(
      z.object({
        index: z.number().int().nonnegative()
          .describe('The verbatim candidate index from the input list.'),
      }),
    )
    .min(1)
    .max(6)
    .describe('The chosen items, ordered from most to least important.'),
});

const curationMoodSchema = z.object({
  mood_summary: z.string().min(1).max(420)
    .describe(
      'Two sentences (no exclamation marks) grounded in specifics from the stories — name the companies, figures, decisions, or events. No vague, sweeping generalities.',
    ),
});

/**
 * Selects every due routine and atomically claims each before returning it.
 *
 * The claim is essential: this workflow's schedule fires every 5 minutes and,
 * because it declares a `schedule`, runs on Mastra's evented engine where ticks
 * can overlap. A routine stays selectable (`next_run_at <= now`) for the whole
 * duration of the batch — `next_run_at` isn't advanced until the final
 * persist step, after every routine in the batch has run. So a batch that takes
 * longer than 5 minutes lets the next tick re-select the same routine and run
 * it again (for `news_curation` that means emailing the team the digest a
 * second and third time). To prevent this, we advance `next_run_at` to the
 * routine's next slot up front, gated on the row still being due. Two concurrent
 * ticks serialise on the row: the first commits the future `next_run_at`, the
 * second's `next_run_at <= now` predicate no longer matches, so it claims
 * nothing and skips the routine. Each due routine therefore runs at most once
 * per slot regardless of overlap.
 */
export async function selectAndClaimDueRoutines(): Promise<Array<z.infer<typeof routineSchema>>> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('routines')
    .select('id, name, agent_name, action_type, action_config, frequency, time_of_day, timezone')
    .eq('is_active', true)
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(10);

  if (error) {
    const msg = (error as { message: string }).message;
    if (msg.includes('routines')) {
      log.warn('routines table not found — migration pending, skipping');
      return [];
    }
    throw new Error(`Failed to fetch routines: ${msg}`);
  }

  const claimed: Array<z.infer<typeof routineSchema>> = [];
  for (const r of data ?? []) {
    const nextRunAt = computeNextRunAt({
      frequency: r.frequency as RoutineFrequency,
      timeOfDay: r.time_of_day as string,
      timezone: r.timezone as string,
    });
    // Atomic claim: advance next_run_at only while the row is still due. An empty
    // result means a concurrent tick already claimed it — skip so we don't re-run.
    const { data: won, error: claimError } = await supabase
      .from('routines')
      .update({ next_run_at: nextRunAt.toISOString() })
      .eq('id', r.id as string)
      .lte('next_run_at', nowIso)
      .select('id');
    if (claimError) {
      log.warn({ id: r.id, error: claimError.message }, 'claim failed — skipping routine this tick');
      continue;
    }
    if (!won || won.length === 0) continue;
    claimed.push({
      id: r.id as string,
      name: r.name as string,
      agent_name: r.agent_name as string,
      action_type: r.action_type as string,
      action_config: (r.action_config as Record<string, unknown>) ?? {},
      frequency: r.frequency as string,
      time_of_day: r.time_of_day as string,
      timezone: r.timezone as string,
    });
  }

  return claimed;
}

const fetchDueRoutines = createStep({
  id: 'fetch_due_routines',
  inputSchema: z.object({
    triggered_at: z.string(),
  }),
  outputSchema: z.object({
    routines: z.array(routineSchema),
  }),
  execute: async () => {
    return { routines: await selectAndClaimDueRoutines() };
  },
});

// ── Step 2: Run each routine ─────────────────────────────────────────────────

export interface RoutineOutcome {
  routine_id: string;
  name: string;
  action_type: RoutineActionType;
  frequency: RoutineFrequency;
  time_of_day: string;
  timezone: string;
  status: 'success' | 'failed';
  result: RoutineResult | null;
  error: string | null;
  // Surfaced for monitor_change side-effects in step 3:
  has_changed?: boolean;
  change_summary?: string | null;
  notify_signal?: boolean;
  notify_agent?: string | null;
  // Source URLs to archive (populated when archive_sources is set):
  archive_urls?: string[];
  // news_ingest result counts:
  news_ingest_result?: NewsIngestResult;
  // podcast_ingest result counts:
  podcast_ingest_result?: PodcastIngestResult;
  // indicator_poll result counts:
  indicator_poll_result?: IndicatorPollResult;
  // onchain_poll result counts:
  onchain_poll_result?: OnchainPollResult;
  // market_report assembled sections + delivery flag:
  market_report_result?: MarketReportResult;
}

const runRoutine = createStep({
  id: 'run_routine',
  inputSchema: z.object({
    routines: z.array(routineSchema),
  }),
  outputSchema: z.object({
    outcomes: z.array(z.any()),
  }),
  execute: async (params) => {
    const inputData = params.inputData as {
      routines: Array<z.infer<typeof routineSchema>>;
    };
    const outcomes: RoutineOutcome[] = [];

    for (const routine of inputData.routines) {
      try {
        if (routine.action_type === 'research_digest') {
          outcomes.push(await runResearchDigest(routine));
        } else if (routine.action_type === 'monitor_change') {
          outcomes.push(await runMonitorChange(routine));
        } else if (routine.action_type === 'news_ingest') {
          outcomes.push(await runNewsIngest(routine));
        } else if (routine.action_type === 'news_source_scan') {
          outcomes.push(await runNewsSourceScan(routine));
        } else if (routine.action_type === 'newsletter') {
          outcomes.push(await runNewsletter(routine));
        } else if (routine.action_type === 'podcast_ingest') {
          outcomes.push(await runPodcastIngest(routine));
        } else if (routine.action_type === 'news_curation') {
          outcomes.push(await runNewsCuration(routine));
        } else if (routine.action_type === 'indicator_poll') {
          outcomes.push(await runIndicatorPoll(routine));
        } else if (routine.action_type === 'onchain_poll') {
          outcomes.push(await runOnchainPoll(routine));
        } else if (routine.action_type === 'social_post_from_news') {
          outcomes.push(await runSocialPost(routine));
        } else if (routine.action_type === 'market_report') {
          outcomes.push(await runMarketReport(routine));
        } else {
          outcomes.push({
            routine_id: routine.id,
            name: routine.name,
            action_type: routine.action_type as RoutineActionType,
            frequency: routine.frequency as RoutineFrequency,
            time_of_day: routine.time_of_day,
            timezone: routine.timezone,
            status: 'failed',
            result: null,
            error: `Unknown action_type: ${routine.action_type}`,
          });
        }
      } catch (err) {
        log.error({ err, routineId: routine.id }, 'error running routine');
        outcomes.push({
          routine_id: routine.id,
          name: routine.name,
          action_type: routine.action_type as RoutineActionType,
          frequency: routine.frequency as RoutineFrequency,
          time_of_day: routine.time_of_day,
          timezone: routine.timezone,
          status: 'failed',
          result: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { outcomes };
  },
});

async function runResearchDigest(
  routine: z.infer<typeof routineSchema>,
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as {
    subject?: string;
    context?: string;
    search_queries?: string[];
    archive_sources?: boolean;
    max_sources?: number;
  };

  const subject = cfg.subject ?? routine.name;
  const searchQueries = cfg.search_queries ?? [];
  const maxSources = cfg.max_sources ?? 10;

  const brief: ResearchBrief = {
    purpose: 'summarise',
    requester: 'simon',
    subject,
    context: [
      cfg.context ?? '',
      searchQueries.length ? `Search queries to run: ${searchQueries.join('; ')}` : '',
      `Return up to ${maxSources} distinct high-quality sources.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    urgency: 'async',
  };

  const response = await rex.generate(
    [{ role: 'user', content: JSON.stringify(brief) }],
    { requestContext: stepRequestContext('executeRoutine.research_digest') },
  );

  const parsed = extractResearchResult(response.text);
  const summary = parsed?.summary;
  const sources: ResearchSource[] = summary?.sources ?? [];

  const result: RoutineResult = {
    summary: summary ? [summary.headline, summary.body].filter(Boolean).join('\n\n') : response.text.slice(0, 2000),
    sources: sources.slice(0, maxSources),
    metadata: parsed?.metadata as Record<string, unknown> | undefined,
  };

  return {
    routine_id: routine.id,
    name: routine.name,
    action_type: 'research_digest',
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
    status: 'success',
    result,
    error: null,
    archive_urls: cfg.archive_sources ? result.sources.map((s) => s.url).filter(Boolean) : [],
  };
}

/** One normalized item in the curation candidate pool. */
interface CurationCandidate extends NewsCurationStory {
  summary: string;
  published_at: string | null;
}

/**
 * Curates the day's best stories across BOTH the news_items feed and ingested
 * podcast_episodes into a dashboard tile. The editor selects and ranks ≤6 items;
 * Charlie writes a two-sentence, fact-grounded summary; the headline item's image (podcast
 * feed artwork, or a best-effort og:image for news) is surfaced on the tile.
 */
export async function runNewsCuration(
  routine: z.infer<typeof routineSchema>,
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as NewsCurationConfig;
  const maxStories = Math.min(cfg.max_stories ?? 6, 6);
  const lookbackHours = cfg.lookback_hours ?? 24;
  const moreNewsUrl = cfg.more_news_url ?? '/news';
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const base: Omit<RoutineOutcome, 'status' | 'result' | 'error'> = {
    routine_id: routine.id,
    name: routine.name,
    action_type: 'news_curation',
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
  };

  // ── Build a unified candidate pool: news articles + podcast episodes ─────────
  const [newsRes, podcastRes] = await Promise.all([
    supabase
      .from('news_items')
      .select('id, title, url, summary, category, source_name, relevance_score, published_at')
      .gte('fetched_at', since)
      .neq('status', 'archived')
      .order('relevance_score', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(60),
    supabase
      .from('podcast_episodes')
      .select('id, title, description, episode_url, youtube_url, audio_url, image_url, published_at, source:news_sources(name)')
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(20),
  ]);

  if (newsRes.error) {
    return { ...base, status: 'failed', result: null, error: `news_items query failed: ${newsRes.error.message}` };
  }
  if (podcastRes.error) {
    return { ...base, status: 'failed', result: null, error: `podcast_episodes query failed: ${podcastRes.error.message}` };
  }

  const newsCandidates: CurationCandidate[] = (newsRes.data ?? []).map((r) => ({
    kind: 'news',
    id: r.id as string,
    title: r.title as string,
    url: r.url as string,
    source_name: (r.source_name as string) ?? 'News',
    category: (r.category as string) ?? 'news',
    summary: (r.summary as string | null) ?? '',
    published_at: (r.published_at as string | null) ?? null,
  }));

  const podcastCandidates: CurationCandidate[] = (podcastRes.data ?? []).map((r) => {
    const rawSource = (r as { source?: unknown }).source;
    const src = Array.isArray(rawSource) ? rawSource[0] : rawSource;
    const sourceName = (src as { name?: string } | null)?.name ?? 'Podcast';
    return {
      kind: 'podcast',
      id: r.id as string,
      title: r.title as string,
      url: (r.episode_url as string | null) ?? (r.youtube_url as string | null) ?? (r.audio_url as string | null) ?? '',
      source_name: sourceName,
      category: 'podcast',
      image_url: (r.image_url as string | null) ?? undefined,
      summary: (r.description as string | null) ?? '',
      published_at: (r.published_at as string | null) ?? null,
    };
  });

  // News first, then podcasts — indices below address this merged list.
  const candidates = [...newsCandidates, ...podcastCandidates];

  if (candidates.length === 0) {
    return {
      ...base,
      status: 'success',
      error: null,
      result: {
        summary: 'No fresh news to curate today.',
        sources: [],
        metadata: { mood_summary: '', stories: [], more_news_url: moreNewsUrl },
      },
    };
  }

  // ── Editor selects + ranks the best ≤maxStories ──────────────────────────────
  const candidateLines = candidates
    .map(
      (c, i) =>
        `${i}. [${c.kind}] ${c.title}\n   source: ${c.source_name} | category: ${c.category} | published: ${c.published_at ?? 'unknown'}\n   summary: ${c.summary.slice(0, 300)}`,
    )
    .join('\n\n');

  const selectPrompt = `You are curating today's best Bitcoin and treasury news for the BTS home dashboard. From the candidates below (news articles and podcast episodes), pick the ${maxStories} most relevant, newsworthy, and distinct items — weighting Australian relevance, treasury and balance-sheet implications, and genuine novelty. Avoid near-duplicates and aim for a mix of formats and topics. Order them from most to least important. Return ONLY the candidate indices verbatim in the schema shape.

Candidates:
${candidateLines}`;

  let selected: CurationCandidate[] = [];
  try {
    const resp = await editor.generate([{ role: 'user', content: selectPrompt }], {
      requestContext: stepRequestContext('executeRoutine.news_curation_select'),
      structuredOutput: {
        schema: curationSelectSchema,
        errorStrategy: 'fallback',
        fallbackValue: { selected: [] },
      },
    });
    const picked = coerceToSchema(curationSelectSchema, resp.object ?? { selected: [] });
    const seen = new Set<number>();
    selected = picked.selected
      .map((s) => s.index)
      .filter((i) => Number.isInteger(i) && i >= 0 && i < candidates.length && !seen.has(i) && seen.add(i))
      .map((i) => candidates[i])
      .slice(0, maxStories);
  } catch (err) {
    curationLog.warn({ err }, 'editor selection failed');
  }

  // Fallback: if the editor produced nothing usable, take the top ranked candidates.
  if (selected.length === 0) selected = candidates.slice(0, maxStories);

  const stories: NewsCurationStory[] = selected.map((c) => ({
    kind: c.kind,
    id: c.id,
    title: c.title,
    url: c.url,
    source_name: c.source_name,
    category: c.category,
    image_url: c.image_url,
  }));

  // ── Charlie writes the two-sentence, fact-grounded intro summary ─────────────
  const moodPrompt = `Write a TWO-sentence intro (max 400 characters, no exclamation marks, BTS brand voice) for today's news digest. Ground it in the specific facts of the stories below — name the companies, figures, decisions, jurisdictions, or events that actually appear. A reader should learn the concrete substance from your two sentences. Do NOT write vague, sweeping generalities like "treasury desks lean in" or "the market is buzzing". "Bitcoin" (capital B) = network/protocol; "bitcoin" (lowercase b) = the currency.

${selected.map((c, i) => `${i + 1}. ${c.title} (${c.source_name})\n   ${c.summary.slice(0, 400)}`).join('\n\n')}

${NEWS_CURATION_NO_TOOL_INSTRUCTION}`;

  let moodSummary = '';
  try {
    const resp = await charlie.generate([{ role: 'user', content: moodPrompt }], {
      requestContext: stepRequestContext('executeRoutine.news_curation_summary'),
      structuredOutput: {
        schema: curationMoodSchema,
        errorStrategy: 'fallback',
        fallbackValue: { mood_summary: '' },
      },
    });
    moodSummary = coerceToSchema(curationMoodSchema, resp.object ?? { mood_summary: '' }).mood_summary;
  } catch (err) {
    curationLog.warn({ err }, 'Charlie mood summary failed');
  }

  // ── Headline image: walk the ranked stories and use the first that resolves ──
  // (podcast feed artwork, else best-effort og:image). Falling through to the
  // second/third story means a single missing og:image no longer leaves the
  // digest — email and dashboard tile — without any image.
  let headlineImageUrl: string | undefined;
  for (const story of stories) {
    if (story.kind === 'podcast') {
      if (story.image_url) {
        headlineImageUrl = story.image_url;
        break;
      }
    } else if (story.url) {
      const og = await fetchOgImage(story.url);
      if (og) {
        headlineImageUrl = og;
        break;
      }
    }
  }

  const retrievedAt = new Date().toISOString();
  const result: RoutineResult = {
    summary: moodSummary || `Curated ${stories.length} ${stories.length === 1 ? 'story' : 'stories'}.`,
    // Reuse sources[] so the existing tile lists the items with zero extra work.
    sources: stories.map((s) => ({
      url: s.url,
      title: s.title,
      source: s.source_name,
      excerpt: '',
      retrieved_at: retrievedAt,
    })),
    metadata: {
      mood_summary: moodSummary,
      stories,
      more_news_url: moreNewsUrl,
      headline_image_url: headlineImageUrl,
    },
  };

  // Email the curated digest to the team. Best-effort: deliverNewsDigest never
  // throws, so a delivery problem can't fail the routine.
  await deliverNewsDigest({ id: routine.id, title: routine.name }, result);

  return { ...base, status: 'success', result, error: null };
}

const NEWS_CURATION_NO_TOOL_INSTRUCTION =
  'Return ONLY the structured object. Do not call any tool (no persist_content_draft, no supabase tools).';

/** True when `date` is the first Monday of its month. */
function isFirstMondayOfMonth(date: Date): boolean {
  return date.getDay() === 1 && date.getDate() <= 7;
}

/**
 * Launches the newsletter workflow. This handler does NOT run the newsletter
 * inline — the newsletter is its own suspendable workflow with two human gates.
 * startNewsletterRun creates the run, starts it (resolving at gate 1), and
 * records the newsletter_runs row; the routine outcome just notes that the run
 * was launched. The monthly_guard flag gates a weekly-firing routine down to a
 * single run on the first Monday of each calendar month.
 */
async function runNewsletter(
  routine: z.infer<typeof routineSchema>,
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as {
    time_range?: 'week' | 'fortnight' | 'month';
    story_count?: number;
    target_word_count?: number;
    audience_context?: string;
    monthly_guard?: boolean;
    one_off?: boolean;
  };

  const base: Omit<RoutineOutcome, 'status' | 'result' | 'error'> = {
    routine_id: routine.id,
    name: routine.name,
    action_type: 'newsletter',
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
  };

  if (cfg.monthly_guard) {
    const now = new Date();
    if (!isFirstMondayOfMonth(now)) {
      return { ...base, status: 'success', result: { summary: 'Skipped — not the first Monday of the month.', sources: [] }, error: null };
    }
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as unknown as { from: (t: string) => any };
    const { data: existing } = await db
      .from('newsletter_runs')
      .select('id')
      .gte('started_at', monthStart)
      .not('status', 'in', '("failed","cancelled")')
      .limit(1);
    if (existing && existing.length > 0) {
      return { ...base, status: 'success', result: { summary: 'Skipped — a newsletter run already exists this month.', sources: [] }, error: null };
    }
  }

  // One-shot web triggers deactivate the reusable routine after launching so it
  // fires exactly once per click (the web action re-arms it next time). Done
  // before launching so a crash mid-run can't leave it firing weekly.
  if (cfg.one_off) {
    await supabase.from('routines').update({ is_active: false }).eq('id', routine.id);
  }

  const { runId, status } = await startNewsletterRun({
    timeRange: cfg.time_range ?? 'month',
    storyCount: cfg.story_count ?? 5,
    targetWordCount: cfg.target_word_count ?? 250,
    audienceContext: cfg.audience_context,
    triggerSource: cfg.one_off ? 'web' : 'schedule',
  });

  return {
    ...base,
    status: 'success',
    result: { summary: `Newsletter run launched (${runId}, status: ${status}).`, sources: [], metadata: { run_id: runId, run_status: status } },
    error: null,
  };
}

async function runMonitorChange(
  routine: z.infer<typeof routineSchema>,
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as {
    subject?: string;
    context?: string;
    search_queries?: string[];
    notify_signal?: boolean;
    notify_agent?: string | null;
    last_digest?: string | null;
  };

  const subject = cfg.subject ?? routine.name;

  const brief: ResearchBrief = {
    purpose: 'monitor',
    requester: 'simon',
    subject,
    context: [
      cfg.context ?? '',
      cfg.search_queries?.length
        ? `Search queries to run: ${cfg.search_queries.join('; ')}`
        : '',
      cfg.last_digest
        ? `Prior digest (compare against this): ${cfg.last_digest}`
        : 'No prior digest — this is the first run for this routine.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    urgency: 'async',
  };

  const response = await rex.generate(
    [{ role: 'user', content: JSON.stringify(brief) }],
    { requestContext: stepRequestContext('executeRoutine.monitor_change') },
  );

  const parsed = extractResearchResult(response.text);
  const monitor = parsed?.monitor;
  const currentDigest = monitor?.current_digest ?? response.text.slice(0, 500);
  const sources: ResearchSource[] = monitor?.sources ?? [];

  const result: RoutineResult = {
    digest: currentDigest,
    summary: monitor?.change_summary ?? undefined,
    sources,
  };

  return {
    routine_id: routine.id,
    name: routine.name,
    action_type: 'monitor_change',
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
    status: 'success',
    result,
    error: null,
    has_changed: monitor?.has_changed ?? false,
    change_summary: monitor?.change_summary ?? null,
    notify_signal: cfg.notify_signal ?? false,
    notify_agent: cfg.notify_agent ?? null,
  };
}

let newsJudgeAgent: Agent | null = null;
function getNewsJudge(): Agent {
  if (!newsJudgeAgent) {
    newsJudgeAgent = new Agent({
      id: 'newsJudge',
      name: 'newsJudge',
      instructions:
        'You curate news for Bitcoin Treasury Solutions (BTS) — a Melbourne-based consultancy that helps Australian businesses adopt Bitcoin as a treasury asset. ' +
        'You receive a list of candidate articles for a single category and must return a shortlist of the most relevant stories.\n\n' +
        'Weigh: Australian relevance (AU regulators, AU companies, AU economy) HIGH; direct treasury or balance-sheet implications HIGH; binding regulatory action, court rulings, or tax positions MEDIUM-HIGH; novelty (genuine new information) MEDIUM. ' +
        'Penalise: PR fluff, opinion columns without new facts, repackaged announcements, price-prediction clickbait.\n\n' +
        'Capital B = the Bitcoin protocol/network; lowercase b = the currency unit. Be neutral.\n\n' +
        'Order entries from most to least relevant. Use the candidate indices verbatim. Return at most the requested number of entries. ' +
        'Output ONLY the indices in the schema-defined shape — no prose, no reasoning, no code fences.',
      model: dynamicModelFor('executeRoutine.news_judge'),
      defaultOptions: { modelSettings: { maxOutputTokens: 8192 } },
    });
  }
  return newsJudgeAgent;
}

interface JudgeCandidate {
  index: number;
  title: string;
  source: string;
  summary: string;
  score: number;
  published_at: string | null;
}

async function rankNewsCandidates(input: {
  category: NewsCategory;
  candidates: JudgeCandidate[];
  max: number;
}): Promise<{
  data: z.infer<typeof newsJudgeSchema> | null;
  reason: string | null;
}> {
  const lines = input.candidates.map((c) =>
    `${c.index}. ${c.title}\n   source: ${c.source} | published: ${c.published_at ?? 'unknown'} | tavily_score: ${c.score.toFixed(2)}\n   snippet: ${c.summary.slice(0, 400)}`,
  ).join('\n\n');

  const basePrompt =
    `Category: ${input.category}\n` +
    `Pick the top ${input.max} most relevant candidates from the list below. ` +
    `Each shortlist entry must use the index verbatim from the list.\n\n` +
    `Candidates:\n${lines}`;

  // Two attempts: a corrective nudge on the second, mirroring the extractor.
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\nYour previous response did not satisfy the schema. ` +
        `Return ONLY a valid object matching the schema now — an array of objects with an "index" field, no prose, no code fences.`;
    try {
      const response = await getNewsJudge().generate(
        [{ role: 'user', content: prompt }],
        {
          structuredOutput: {
            schema: newsJudgeSchema,
            errorStrategy: 'strict',
          },
          requestContext: stepRequestContext('executeRoutine.news_judge'),
        },
      );
      const obj = response.object as z.infer<typeof newsJudgeSchema> | undefined;
      if (obj) return { data: obj, reason: null };
      lastError = 'no_object_returned';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  ingestLog.warn(
    { category: input.category, candidate_count: input.candidates.length, reason: lastError },
    'judge failed after retry',
  );
  return { data: null, reason: lastError?.slice(0, 200) ?? 'unknown' };
}

// Cosine-similarity threshold above which two news candidates are treated as
// the same underlying story (cross-source duplicate). Applied against both the
// database and other candidates within the same ingest run.
const NEWS_DEDUP_THRESHOLD = 0.88;

async function runNewsIngest(
  routine: z.infer<typeof routineSchema>,
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as unknown as NewsIngestionConfig;
  const category = cfg.category;
  const queries = cfg.queries ?? [];
  const maxPerQuery = cfg.max_results_per_query ?? 15;
  const maxCurated = cfg.max_curated ?? 6;
  const relevanceFilter = cfg.relevance_filter ?? defaultRelevanceFilter(category);

  const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

  // ── Phase 1: gather + dedup ────────────────────────────────────────────────
  // Cast a wide Tavily net, then strip URL + DB + semantic duplicates so the
  // ranker only sees genuinely fresh candidates.

  const seen = new Set<string>();
  const tavilyCandidates: Array<{
    url: string;
    title: string;
    summary: string;
    source: string;
    published_at: string | null;
    score: number;
  }> = [];

  for (const query of queries) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env['TAVILY_API_KEY'],
          query,
          max_results: maxPerQuery,
          topic: 'news',
          days: 2,
          include_answer: false,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json() as { results?: Array<{ url: string; title: string; content: string; score: number; published_date?: string; source?: string }> };
      for (const r of data.results ?? []) {
        const url = normalizeNewsUrl(r.url);
        if (!seen.has(url)) {
          seen.add(url);
          tavilyCandidates.push({
            url,
            title: r.title,
            summary: r.content?.slice(0, 500) ?? '',
            source: (r.source ?? new URL(r.url).hostname).replace(/^www\./, ''),
            published_at: r.published_date ?? null,
            score: r.score ?? 0,
          });
        }
      }
    } catch {
      // skip failed query, continue
    }
  }

  ingestLog.info({ count: tavilyCandidates.length, category }, 'tavily returned unique candidates');

  if (tavilyCandidates.length === 0) {
    const result: RoutineResult = { summary: 'No new articles found.', sources: [] };
    return {
      routine_id: routine.id, name: routine.name,
      action_type: 'news_ingest', frequency: routine.frequency as RoutineFrequency,
      time_of_day: routine.time_of_day, timezone: routine.timezone,
      status: 'success', result, error: null,
      news_ingest_result: { category, items_found: 0, items_stored: 0, items_skipped_duplicate: 0, items_filtered_irrelevant: 0 },
    };
  }

  // URL dedup against the database.
  const { data: existing } = await supabase
    .from('news_items')
    .select('url')
    .in('url', tavilyCandidates.map((c) => c.url));
  const existingUrls = new Set((existing ?? []).map((r) => r.url as string));
  const urlFreshCandidates = tavilyCandidates.filter((c) => !existingUrls.has(c.url));
  let itemsSkippedDuplicate = tavilyCandidates.length - urlFreshCandidates.length;

  // Per-candidate semantic dedup (cheap snippet embedding).
  type FreshCandidate = (typeof urlFreshCandidates)[number] & { dedupEmbedding: number[] | null };
  const fresh: FreshCandidate[] = [];
  for (const item of urlFreshCandidates) {
    try {
      const dedupEmbRes = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: `${item.title} ${item.summary}`.trim(),
        dimensions: EMBEDDING_DIMENSIONS,
      });
      const dedupEmbedding = dedupEmbRes.data[0]?.embedding ?? null;
      if (dedupEmbedding) {
        // Duplicate of a story already stored in the database.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // Compare across all categories, not just this routine's — the same
        // story is often surfaced by two category routines (e.g. a Forbes
        // article landing in both "corporate" and "regulatory").
        const { data: near } = await (supabase.rpc as any)('vector_search_news', {
          query_embedding: dedupEmbedding,
          match_threshold: NEWS_DEDUP_THRESHOLD,
          match_count: 1,
          filter_category: null,
          filter_days: 3,
        });
        if (near && near.length > 0) {
          itemsSkippedDuplicate += 1;
          continue;
        }

        // Duplicate of a candidate already accepted earlier in this same run —
        // neither is in the DB yet, so the check above can't catch it.
        const isBatchDuplicate = fresh.some(
          (f) => f.dedupEmbedding !== null &&
            cosineSimilarity(dedupEmbedding, f.dedupEmbedding) >= NEWS_DEDUP_THRESHOLD,
        );
        if (isBatchDuplicate) {
          itemsSkippedDuplicate += 1;
          continue;
        }
      }
      fresh.push({ ...item, dedupEmbedding });
    } catch (err) {
      ingestLog.warn({ err, url: item.url, title: item.title }, 'dedup failed — skipping candidate');
    }
  }

  ingestLog.info({ count: fresh.length }, 'fresh after dedup');

  // ── Phase 2: rank with the LLM judge ──────────────────────────────────────
  // If the pool already fits the cap, skip the judge call.

  let shortlist: FreshCandidate[];
  let judgeFailed = false;
  let judgeFailureReason: string | null = null;
  if (fresh.length === 0) {
    shortlist = [];
  } else if (fresh.length <= maxCurated) {
    shortlist = fresh;
  } else {
    const { data: ranked, reason: rankReason } = await rankNewsCandidates({
      category,
      candidates: fresh.map((c, i) => ({
        index: i,
        title: c.title,
        source: c.source,
        summary: c.summary,
        score: c.score,
        published_at: c.published_at,
      })),
      max: maxCurated,
    });

    if (ranked && ranked.shortlist.length > 0) {
      shortlist = dedupeShortlistIndices(ranked.shortlist)
        .slice(0, maxCurated)
        .map((s) => fresh[s.index])
        .filter((c): c is FreshCandidate => Boolean(c));
      ingestLog.info({ selected: shortlist.length, of: fresh.length }, 'judge selected');
    } else {
      shortlist = [];
      judgeFailed = true;
      judgeFailureReason = rankReason ?? 'unknown';
      ingestLog.warn(
        { fresh_pool: fresh.length, reason: judgeFailureReason },
        'judge returned nothing usable — skipping run, no stories curated',
      );
    }
  }

  // ── Phase 3: enrich + insert (only the shortlist) ─────────────────────────

  let itemsStored = 0;
  let extractionFailures = 0;
  let itemsFilteredIrrelevant = 0;
  const failedUrls: string[] = [];
  const storedSources: NonNullable<RoutineResult['sources']> = [];

  for (const item of shortlist) {
    try {
      // Fetch full article body via Jina Reader.
      let bodyMarkdown: string | null = null;
      try {
        const fetched = await fetchUrl.execute!({ url: item.url } as never, {} as never) as
          | { title?: string; markdown?: string }
          | undefined;
        const md = fetched?.markdown?.trim();
        if (md && md.length > 200) bodyMarkdown = md;
      } catch {
        // body fetch failed; carry on with snippet-only enrichment
      }

      // Structured extraction (summary, key_points, topic_tags, AU relevance).
      const extractionInput = bodyMarkdown ?? item.summary;
      const truncated = extractionInput.slice(0, 12000);
      const { data: extracted, reason: extractionReason } = await extractNewsMetadata({
        title: item.title,
        source: item.source,
        category,
        content: truncated,
      });
      const extractionOk = extracted !== null;
      if (!extractionOk) {
        extractionFailures += 1;
        failedUrls.push(item.url);
        ingestLog.warn(
          { title: item.title, url: item.url, reason: extractionReason },
          'extraction failed — inserting with extraction_failed status',
        );
      }

      // Drop stories that fail the routine's relevance filter. Default keeps a
      // story if it passes on either the Bitcoin or AU axis; 'none' (e.g. macro)
      // keeps everything the judge curated.
      if (extracted && shouldDropForRelevance(relevanceFilter, extracted)) {
        itemsFilteredIrrelevant += 1;
        ingestLog.warn({ url: item.url, title: item.title }, 'filtered as irrelevant');
        continue;
      }

      // Final embedding on title + curated summary for higher-quality search.
      const finalSummary = extracted?.summary ?? item.summary;
      const finalEmbRes = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: `${item.title}\n${finalSummary}`.trim(),
        dimensions: EMBEDDING_DIMENSIONS,
      });
      const finalEmbedding = finalEmbRes.data[0]?.embedding ?? item.dedupEmbedding;

      const { error: insertError } = await supabase.from('news_items').insert({
        title: item.title,
        url: item.url,
        source_name: item.source,
        published_at: item.published_at,
        body_markdown: bodyMarkdown,
        summary: finalSummary,
        key_points: extracted?.key_points ?? [],
        topic_tags: extracted?.topic_tags ?? [],
        australian_relevance: extracted?.australian_relevance ?? true,
        category: category as NewsCategory,
        relevance_score: Math.min(1, item.score),
        embedding: finalEmbedding as unknown as string,
        status: extractionOk ? 'new' : 'extraction_failed',
        routine_id: routine.id,
        ingested_by: 'rex',
      });
      // A failed insert (e.g. a UNIQUE(url) collision from a late-detected
      // duplicate) must not be counted as stored or surfaced in the dashboard
      // sources — otherwise the same article appears twice in the tile.
      if (insertError) {
        if (insertError.code === '23505') itemsSkippedDuplicate += 1;
        ingestLog.warn({ url: item.url, title: item.title, error: insertError.message }, 'insert skipped');
        continue;
      }
      itemsStored += 1;
      if (extractionOk) {
        storedSources.push({
          url: item.url,
          title: item.title,
          excerpt: finalSummary,
          retrieved_at: new Date().toISOString(),
          source: item.source,
        });
      }
    } catch (err) {
      ingestLog.warn({ err, url: item.url, title: item.title }, 'item failed — skipping');
    }
  }

  ingestLog.info(
    { category, stored: itemsStored, shortlist: shortlist.length, extraction_failures: extractionFailures, filtered: itemsFilteredIrrelevant },
    'ingest complete',
  );

  const ingestResult: NewsIngestResult = {
    category,
    items_found: tavilyCandidates.length,
    items_stored: itemsStored,
    items_skipped_duplicate: itemsSkippedDuplicate,
    items_filtered_irrelevant: itemsFilteredIrrelevant,
    extraction_failures: extractionFailures,
    failed_urls: failedUrls,
    judge_failed: judgeFailed,
    judge_failure_reason: judgeFailureReason ?? undefined,
  };

  const judgeFailSuffix = judgeFailureReason ? ` (${judgeFailureReason})` : '';
  const summaryLine = judgeFailed
    ? `No ${category} stories curated this run — the ranking judge failed${judgeFailSuffix}; ${fresh.length} fresh candidates left unranked from a pool of ${tavilyCandidates.length}.`
    : extractionFailures > 0
      ? `Stored ${itemsStored} new ${category} articles (${extractionFailures} with failed extraction, ${itemsFilteredIrrelevant} filtered as irrelevant, ${itemsSkippedDuplicate} skipped as duplicates from a pool of ${tavilyCandidates.length}).`
      : `Stored ${itemsStored} new ${category} articles (${itemsFilteredIrrelevant} filtered as irrelevant, ${itemsSkippedDuplicate} skipped as duplicates from a pool of ${tavilyCandidates.length}).`;

  const result: RoutineResult = {
    summary: summaryLine,
    sources: storedSources.slice(0, 5),
  };

  return {
    routine_id: routine.id, name: routine.name,
    action_type: 'news_ingest', frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day, timezone: routine.timezone,
    status: 'success', result, error: null,
    news_ingest_result: ingestResult,
  };
}

async function runNewsSourceScan(
  routine: z.infer<typeof routineSchema>,
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as unknown as NewsSourceScanConfig;
  const maxPerSource = cfg.max_items_per_source ?? 10;
  const lookbackDays = cfg.lookback_days ?? 3;
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

  const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

  const baseOutcome = {
    routine_id: routine.id,
    name: routine.name,
    action_type: 'news_source_scan' as RoutineActionType,
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
  };

  // ── Load active sources ────────────────────────────────────────────────────
  // Filter to article feeds only — podcast/youtube sources live in the same
  // table but are handled by runPodcastIngest. (source_type isn't in the
  // generated types until post-migration regen, hence the boundary cast.)
  const { data: sources, error: sourcesError } = await (supabase
    .from('news_sources')
    .select('id, name, feed_url')
    .eq('is_active', true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('source_type' as any, 'rss') as any);

  if (sourcesError) {
    return {
      ...baseOutcome,
      status: 'failed',
      result: null,
      error: `Failed to load news_sources: ${sourcesError.message}`,
    };
  }

  const activeSources = sources ?? [];
  if (activeSources.length === 0) {
    const result: RoutineResult = { summary: 'No active news sources configured.', sources: [] };
    return {
      ...baseOutcome,
      status: 'success',
      result,
      error: null,
    };
  }

  // ── Phase 1: gather feed items + record per-source scan status ──────────────
  const seen = new Set<string>();
  const candidates: Array<{
    url: string;
    title: string;
    summary: string;
    source: string;
    published_at: string | null;
  }> = [];
  const failedSources: string[] = [];

  for (const src of activeSources) {
    const sourceId = src.id as string;
    const sourceName = src.name as string;
    const feedUrl = src.feed_url as string;
    try {
      const feed = await fetchFeed(feedUrl);
      const normalized = normalizeFeedItems(feed.items ?? [], {
        sourceName,
        cutoffMs: cutoff,
        maxItems: maxPerSource,
      });
      for (const cand of normalized) {
        if (seen.has(cand.url)) continue;
        seen.add(cand.url);
        candidates.push(cand);
      }

      await supabase
        .from('news_sources')
        .update({ last_scanned_at: new Date().toISOString(), last_status: 'success', last_error: null })
        .eq('id', sourceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failedSources.push(sourceName);
      scanLog.warn({ source: sourceName, feed_url: feedUrl, error: message }, 'feed failed');
      await supabase
        .from('news_sources')
        .update({ last_scanned_at: new Date().toISOString(), last_status: 'failed', last_error: message.slice(0, 500) })
        .eq('id', sourceId);
    }
  }

  scanLog.info({ candidates: candidates.length, sources: activeSources.length }, 'gathered candidates from sources');

  // ── Dedup (URL + semantic), mirroring runNewsIngest phase 1 ─────────────────
  let itemsSkippedDuplicate = 0;
  type FreshCandidate = (typeof candidates)[number] & { dedupEmbedding: number[] | null };
  const fresh: FreshCandidate[] = [];

  if (candidates.length > 0) {
    const { data: existing } = await supabase
      .from('news_items')
      .select('url')
      .in('url', candidates.map((c) => c.url));
    const existingUrls = new Set((existing ?? []).map((r) => r.url as string));
    const urlFresh = candidates.filter((c) => !existingUrls.has(c.url));
    itemsSkippedDuplicate += candidates.length - urlFresh.length;

    for (const item of urlFresh) {
      try {
        const dedupEmbRes = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: `${item.title} ${item.summary}`.trim(),
          dimensions: EMBEDDING_DIMENSIONS,
        });
        const dedupEmbedding = dedupEmbRes.data[0]?.embedding ?? null;
        if (dedupEmbedding) {
          // Category unknown until extraction, so dedup across all categories.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: near } = await (supabase.rpc as any)('vector_search_news', {
            query_embedding: dedupEmbedding,
            match_threshold: NEWS_DEDUP_THRESHOLD,
            match_count: 1,
            filter_category: null,
            filter_days: 3,
          });
          if (near && near.length > 0) {
            itemsSkippedDuplicate += 1;
            continue;
          }
          const isBatchDuplicate = fresh.some(
            (f) => f.dedupEmbedding !== null &&
              cosineSimilarity(dedupEmbedding, f.dedupEmbedding) >= NEWS_DEDUP_THRESHOLD,
          );
          if (isBatchDuplicate) {
            itemsSkippedDuplicate += 1;
            continue;
          }
        }
        fresh.push({ ...item, dedupEmbedding });
      } catch (err) {
        scanLog.warn({ err, url: item.url }, 'dedup failed — skipping candidate');
      }
    }
  }

  scanLog.info({ count: fresh.length }, 'fresh after dedup');

  // ── Enrich + insert (no LLM judge, no relevance drop — trust the source) ────
  let itemsStored = 0;
  let extractionFailures = 0;
  const storedSources: NonNullable<RoutineResult['sources']> = [];

  for (const item of fresh) {
    try {
      let bodyMarkdown: string | null = null;
      try {
        const fetched = await fetchUrl.execute!({ url: item.url } as never, {} as never) as
          | { title?: string; markdown?: string }
          | undefined;
        const md = fetched?.markdown?.trim();
        if (md && md.length > 200) bodyMarkdown = md;
      } catch {
        // body fetch failed; carry on with snippet-only enrichment
      }

      const extractionInput = (bodyMarkdown ?? item.summary).slice(0, 12000);
      const { data: extracted, reason: extractionReason } = await extractNewsMetadata({
        title: item.title,
        source: item.source,
        content: extractionInput,
        // category omitted — the extractor classifies the article itself.
      });
      const extractionOk = extracted !== null;
      if (!extractionOk) {
        extractionFailures += 1;
        scanLog.warn(
          { title: item.title, url: item.url, reason: extractionReason },
          'extraction failed — inserting with extraction_failed status',
        );
      }

      const finalSummary = extracted?.summary ?? item.summary;
      const finalEmbRes = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: `${item.title}\n${finalSummary}`.trim(),
        dimensions: EMBEDDING_DIMENSIONS,
      });
      const finalEmbedding = finalEmbRes.data[0]?.embedding ?? item.dedupEmbedding;

      await supabase.from('news_items').insert({
        title: item.title,
        url: item.url,
        source_name: item.source,
        published_at: item.published_at,
        body_markdown: bodyMarkdown,
        summary: finalSummary,
        key_points: extracted?.key_points ?? [],
        topic_tags: extracted?.topic_tags ?? [],
        australian_relevance: extracted?.australian_relevance ?? false,
        category: (extracted?.category ?? 'international') as NewsCategory,
        relevance_score: null,
        embedding: finalEmbedding as unknown as string,
        status: extractionOk ? 'new' : 'extraction_failed',
        routine_id: routine.id,
        ingested_by: 'rex',
      });
      itemsStored += 1;
      if (extractionOk) {
        storedSources.push({
          url: item.url,
          title: item.title,
          excerpt: finalSummary,
          retrieved_at: new Date().toISOString(),
          source: item.source,
        });
      }
    } catch (err) {
      scanLog.warn({ err, url: item.url }, 'item failed — skipping');
    }
  }

  scanLog.info(
    { stored: itemsStored, fresh: fresh.length, extraction_failures: extractionFailures, failed_sources: failedSources.length },
    'source scan complete',
  );

  const scanResult: NewsSourceScanResult = {
    sources_scanned: activeSources.length,
    items_found: candidates.length,
    items_stored: itemsStored,
    items_skipped_duplicate: itemsSkippedDuplicate,
    extraction_failures: extractionFailures,
    failed_sources: failedSources,
  };

  const failSuffix = failedSources.length > 0 ? ` ${failedSources.length} source(s) failed to fetch.` : '';
  const summaryLine =
    `Scanned ${activeSources.length} source(s): stored ${itemsStored} new article(s) ` +
    `(${itemsSkippedDuplicate} skipped as duplicates from ${candidates.length} feed items).${failSuffix}`;

  const result: RoutineResult = {
    summary: summaryLine,
    sources: storedSources.slice(0, 5),
    metadata: scanResult as unknown as Record<string, unknown>,
  };

  return {
    ...baseOutcome,
    status: 'success',
    result,
    error: null,
  };
}

// ── podcast_ingest ───────────────────────────────────────────────────────────
// Scans active podcast news_sources, ingests new episodes (dedupe on guid,
// backfill-capped on first fetch), and resolves each transcript through the
// waterfall (feed tag → YouTube → Deepgram). Available transcripts are embedded
// into transcript_segments this run; Deepgram submissions resolve later via the
// /webhooks/deepgram handler. Mirrors runNewsSourceScan's shape.

interface PodcastSourceRow {
  id: string;
  name: string;
  feed_url: string | null;
  transcribe_with_deepgram: boolean;
  preferred_transcript_lang: string;
  max_backfill_episodes: number;
  max_episode_age_days: number | null;
  last_scanned_at: string | null;
}

async function runPodcastIngest(
  routine: z.infer<typeof routineSchema>,
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as unknown as PodcastIngestConfig;
  const maxPerSource = cfg.max_items_per_source ?? 25;
  const lookbackDays = cfg.lookback_days ?? 14;
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

  const baseOutcome = {
    routine_id: routine.id,
    name: routine.name,
    action_type: 'podcast_ingest' as RoutineActionType,
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
  };

  // Load active podcast sources. New columns aren't in the generated types until
  // post-migration regen, so we cast at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sourcesRaw, error: sourcesError } = await (supabase
    .from('news_sources')
    .select(
      'id, name, feed_url, transcribe_with_deepgram, preferred_transcript_lang, max_backfill_episodes, max_episode_age_days, last_scanned_at',
    )
    .eq('is_active', true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('source_type' as any, 'podcast') as any);

  if (sourcesError) {
    return {
      ...baseOutcome,
      status: 'failed',
      result: null,
      error: `Failed to load podcast sources: ${(sourcesError as { message: string }).message}`,
    };
  }

  const sources = (sourcesRaw ?? []) as PodcastSourceRow[];
  const result: PodcastIngestResult = {
    sources_scanned: 0,
    episodes_found: 0,
    episodes_new: 0,
    transcripts_available: 0,
    transcripts_transcribing: 0,
    transcripts_skipped: 0,
    transcripts_failed: 0,
    segments_embedded: 0,
    failed_sources: [],
  };

  for (const src of sources) {
    if (!src.feed_url) continue;
    result.sources_scanned += 1;
    try {
      const feed = await fetchPodcastFeed(src.feed_url);
      const items = normalizePodcastItems(
        (feed.items ?? []) as Parameters<typeof normalizePodcastItems>[0],
        { cutoffMs: cutoff, maxItems: maxPerSource },
      );
      result.episodes_found += items.length;

      const existingGuids = await fetchExistingGuids(src.id);
      const isFirstFetch = !src.last_scanned_at || existingGuids.size === 0;

      let newItems = items.filter((it) => !existingGuids.has(it.guid));
      if (isFirstFetch && newItems.length > src.max_backfill_episodes) {
        // First fetch of a new feed: cap to the newest N so adding an old show
        // doesn't ingest a decade overnight.
        newItems = [...newItems]
          .sort((a, b) => {
            const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
            const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
            return tb - ta;
          })
          .slice(0, src.max_backfill_episodes);
      }

      for (const item of newItems) {
        const episodeId = await insertEpisodeIfNew({
          source_id: src.id,
          guid: item.guid,
          title: item.title,
          description: item.description,
          episode_url: item.episode_url,
          audio_url: item.audio_url,
          audio_mime_type: item.audio_mime_type,
          duration_seconds: item.duration_seconds,
          youtube_url: item.youtube_url,
          season: item.season,
          episode_number: item.episode_number,
          image_url: item.image_url,
          published_at: item.published_at,
          ingestion_origin: 'feed',
          transcript_status: 'resolving',
        });
        // Null = a row with this guid already exists (seen on a prior run, or the
        // feed repeated the guid in this batch). Expected, not a failure — skip
        // it rather than letting the unique-violation abort the whole feed.
        if (episodeId === null) continue;
        result.episodes_new += 1;

        const outcome = await resolveTranscript(
          {
            youtube_url: item.youtube_url,
            audio_url: item.audio_url,
            published_at: item.published_at,
            transcriptTags: item.transcriptTags,
          },
          {
            transcribe_with_deepgram: src.transcribe_with_deepgram,
            preferred_transcript_lang: src.preferred_transcript_lang,
            max_episode_age_days: src.max_episode_age_days,
          },
        );

        if (outcome.kind === 'available') {
          const { segments } = await storeAvailableTranscript(episodeId, outcome);
          result.transcripts_available += 1;
          result.segments_embedded += segments;
        } else if (outcome.kind === 'transcribing') {
          await updateEpisode(episodeId, {
            transcript_status: 'transcribing',
            deepgram_request_id: outcome.deepgramRequestId,
          });
          result.transcripts_transcribing += 1;
        } else if (outcome.kind === 'skipped') {
          await updateEpisode(episodeId, { transcript_status: 'skipped' });
          result.transcripts_skipped += 1;
        } else {
          await updateEpisode(episodeId, {
            transcript_status: 'failed',
            transcript_error: outcome.error,
          });
          result.transcripts_failed += 1;
        }
      }

      await supabase
        .from('news_sources')
        .update({ last_scanned_at: new Date().toISOString(), last_status: 'success', last_error: null })
        .eq('id', src.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed_sources!.push(src.name);
      podcastLog.warn({ source: src.name, error: message }, 'feed failed');
      await supabase
        .from('news_sources')
        .update({ last_scanned_at: new Date().toISOString(), last_status: 'failed', last_error: message.slice(0, 500) })
        .eq('id', src.id);
    }
  }

  const failSuffix = result.failed_sources!.length > 0 ? ` ${result.failed_sources!.length} source(s) failed to fetch.` : '';
  const summary =
    `Scanned ${result.sources_scanned} podcast source(s): ${result.episodes_new} new episode(s) — ` +
    `${result.transcripts_available} transcribed (${result.segments_embedded} segments), ` +
    `${result.transcripts_transcribing} awaiting Deepgram, ${result.transcripts_skipped} skipped, ` +
    `${result.transcripts_failed} failed.${failSuffix}`;

  return {
    ...baseOutcome,
    status: 'success',
    result: { summary, sources: [], metadata: result as unknown as Record<string, unknown> },
    error: null,
    podcast_ingest_result: result,
  };
}

function extractResearchResult(text: string): ResearchResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as ResearchResult;
  } catch {
    return null;
  }
}

// ── Step 3: Persist, reschedule, archive ─────────────────────────────────────

const persistAndSchedule = createStep({
  id: 'persist_and_schedule',
  inputSchema: z.object({
    outcomes: z.array(z.any()),
  }),
  outputSchema: z.object({
    updated: z.number(),
    archived: z.number(),
  }),
  execute: async (params) => {
    const { outcomes } = params.inputData as { outcomes: RoutineOutcome[] };
    let archivedCount = 0;

    for (const outcome of outcomes) {
      const nextRunAt = computeNextRunAt({
        frequency: outcome.frequency,
        timeOfDay: outcome.time_of_day,
        timezone: outcome.timezone,
      });

      const update: Database['public']['Tables']['routines']['Update'] = {
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt.toISOString(),
        last_status: outcome.status,
        last_error: outcome.error,
        last_result: outcome.result as Json | null,
      };

      // For monitor_change, preserve the rolling digest in action_config.
      if (outcome.action_type === 'monitor_change' && outcome.status === 'success' && outcome.result?.digest) {
        const { data: existing } = await supabase
          .from('routines')
          .select('action_config')
          .eq('id', outcome.routine_id)
          .single();
        if (existing) {
          const cfg = { ...((existing.action_config as Record<string, unknown>) ?? {}), last_digest: outcome.result.digest };
          (update as Record<string, unknown>)['action_config'] = cfg as unknown as Json;
        }
      }

      await supabase.from('routines').update(update).eq('id', outcome.routine_id);

      // Audit: one row per run. For news_ingest we serialise the run stats as
      // JSON in `notes` so failures are queryable from Supabase without having
      // to dig through Railway logs:
      //   SELECT created_at, notes::jsonb FROM agent_activity
      //   WHERE action LIKE 'Routine run: News%' ORDER BY created_at DESC;
      const isNewsIngest = outcome.action_type === 'news_ingest';
      const isPodcastIngest = outcome.action_type === 'podcast_ingest';
      const isIndicatorPoll = outcome.action_type === 'indicator_poll';
      const isOnchainPoll = outcome.action_type === 'onchain_poll';
      const indicatorNotes = isIndicatorPoll && outcome.indicator_poll_result
        ? JSON.stringify(outcome.indicator_poll_result)
        : null;
      const indicatorHasAnomaly = isIndicatorPoll && outcome.indicator_poll_result
        ? outcome.indicator_poll_result.failed.length > 0
        : false;
      const onchainNotes = isOnchainPoll && outcome.onchain_poll_result
        ? JSON.stringify(outcome.onchain_poll_result)
        : null;
      const onchainHasAnomaly = isOnchainPoll && outcome.onchain_poll_result
        ? outcome.onchain_poll_result.failed.length > 0
        : false;
      const isMarketReport = outcome.action_type === 'market_report';
      const marketReportNotes = isMarketReport && outcome.market_report_result
        ? JSON.stringify(outcome.market_report_result)
        : null;
      const podcastNotes = isPodcastIngest && outcome.podcast_ingest_result
        ? JSON.stringify(outcome.podcast_ingest_result)
        : null;
      const podcastHasAnomaly = isPodcastIngest && outcome.podcast_ingest_result
        ? outcome.podcast_ingest_result.transcripts_failed > 0
          || (outcome.podcast_ingest_result.failed_sources?.length ?? 0) > 0
        : false;
      const newsNotes = isNewsIngest && outcome.news_ingest_result
        ? JSON.stringify(outcome.news_ingest_result)
        : null;
      const newsHasAnomaly = isNewsIngest && outcome.news_ingest_result
        ? (outcome.news_ingest_result.extraction_failures ?? 0) > 0
          || outcome.news_ingest_result.judge_failed === true
          || (outcome.news_ingest_result.items_stored === 0
              && (outcome.news_ingest_result.items_filtered_irrelevant ?? 0) > 0)
        : false;
      const activityStatus: 'auto' | 'error' = outcome.status === 'success'
        ? (newsHasAnomaly || podcastHasAnomaly || indicatorHasAnomaly || onchainHasAnomaly ? 'error' : 'auto')
        : 'error';
      await supabase.from('agent_activity').insert({
        agent_name: isPodcastIngest ? 'archie' : (isIndicatorPoll || isOnchainPoll || isMarketReport) ? 'simon' : 'rex',
        action: `Routine run: ${outcome.name}`,
        status: activityStatus,
        trigger_type: 'scheduled',
        entity_type: 'routine',
        entity_id: outcome.routine_id,
        approved_actions: outcome.result
          ? ([outcome.result as unknown as Record<string, unknown>] as Json)
          : null,
        notes: newsNotes ?? podcastNotes ?? indicatorNotes ?? onchainNotes ?? marketReportNotes ?? outcome.error ?? outcome.change_summary ?? null,
      });

      // monitor_change notify flow.
      // The previous implementation wrote a proposed_actions row that the deleted
      // specialist dispatch listeners (archivist/ba/recorder/relationshipManager/
      // researcher) consumed. After the supervisor migration those listeners are
      // gone; this row remains as an audit trail only. Re-wiring monitor_change to
      // delegate via Simon's supervisor (or to invoke the target agent directly)
      // is deferred to the Tier 1.4 split of this workflow.
      if (
        outcome.action_type === 'monitor_change' &&
        outcome.has_changed &&
        outcome.notify_agent
      ) {
        await supabase.from('agent_activity').insert({
          agent_name: 'simon',
          action: `Research monitor "${outcome.name}" detected changes: ${outcome.change_summary ?? ''}`,
          status: 'auto',
          trigger_type: 'scheduled',
          proposed_actions: [
            {
              agent: outcome.notify_agent,
              message: `Research monitor update — ${outcome.name}: ${outcome.change_summary ?? ''}`,
              context: {
                routine_id: outcome.routine_id,
                current_digest: outcome.result?.digest,
              },
            },
          ] as Json,
        });
      }

      // Archive sources to knowledge_items when requested.
      if (outcome.archive_urls?.length) {
        archivedCount += await archiveSources(outcome);
      }
    }

    return { updated: outcomes.length, archived: archivedCount };
  },
});

async function archiveSources(outcome: RoutineOutcome): Promise<number> {
  let archived = 0;
  for (const url of outcome.archive_urls ?? []) {
    try {
      // Skip if URL already archived.
      const { data: existing } = await supabase
        .from('knowledge_items')
        .select('id')
        .eq('source_url', url)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const fetched = await fetchUrl.execute!({ url } as never, {} as never) as
        | { title?: string; markdown?: string; retrieved_at?: string }
        | undefined;
      if (!fetched?.markdown) continue;

      const source = outcome.result?.sources.find((s) => s.url === url);
      const title = source?.title ?? fetched.title ?? url;

      await supabase.from('knowledge_items').insert({
        title,
        source_url: url,
        source_type: 'article',
        raw_content: fetched.markdown,
        summary: source?.excerpt ?? null,
        topic_tags: [outcome.name],
        archived_by: 'rex',
      });
      archived += 1;
    } catch (err) {
      log.warn({ err, url }, 'archive failed');
    }
  }
  return archived;
}

// ── Assemble workflow ────────────────────────────────────────────────────────

export const executeRoutineWorkflow = createWorkflow({
  id: 'executeRoutine',
  inputSchema: z.object({ triggered_at: z.string() }),
  outputSchema: z.object({
    updated: z.number(),
    archived: z.number(),
  }),
  // Mastra's built-in scheduler fires this every 5 minutes — preserves the
  // cadence previously implemented by routineListener's setInterval. Each tick
  // re-queries the routines table for rows whose next_run_at has passed, so
  // a routine configured for e.g. 7:00 AM fires within ~5 minutes of its
  // wall-clock time. PostgresStore advertises supportsConcurrentUpdates(),
  // so the workflow can be auto-promoted to the evented engine here.
  // triggered_at is unused by the steps; we pass a static marker so the
  // schedule's payload doesn't go stale at module-load time.
  schedule: {
    cron: '*/5 * * * *',
    timezone: 'UTC',
    inputData: { triggered_at: 'scheduled' },
  },
})
  .then(fetchDueRoutines)
  .then(runRoutine)
  .then(persistAndSchedule)
  .commit();
