'use server';

import type { Json } from '@platform/db';
import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  computeNextRunAt,
  DEFAULT_TIMEZONE,
  NewsCategory,
  NewsRelevanceFilter,
  defaultRelevanceFilter,
} from '@platform/shared';
import type { NewsCategory as NewsCategoryT, NewsRelevanceFilter as NewsRelevanceFilterT } from '@platform/shared';
import { humanizeError } from '@/lib/errors';
import { formBoolean } from '@/lib/formBoolean';

const FREQUENCIES = ['daily', 'weekly', 'fortnightly'] as const;
const AGENTS = ['simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della'] as const;
const NEWS_CATEGORIES = Object.values(NewsCategory) as [string, ...string[]];

// A number field that falls back to `fallback` when the form omits it or sends
// a blank string. Plain `z.coerce.number()` turns '' into 0, which then trips
// the min() check with a message that names a bound the user never typed.
function optionalInt(min: number, max: number, fallback: number) {
  return z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(min).max(max).optional().default(fallback),
  );
}

// Accept either a comma/newline separated string or an already-parsed array.
const queriesSchema = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    return v
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string().min(1)));

const researchDigestConfig = z.object({
  action_type: z.literal('research_digest'),
  subject: z.string().min(1, 'Subject is required'),
  context: z.string().optional().default(''),
  search_queries: queriesSchema.refine((v) => v.length > 0, 'At least one search query is required'),
  archive_sources: formBoolean(false),
  max_sources: optionalInt(1, 50, 10),
});

const monitorChangeConfig = z.object({
  action_type: z.literal('monitor_change'),
  subject: z.string().min(1, 'Subject is required'),
  context: z.string().optional().default(''),
  search_queries: queriesSchema.refine((v) => v.length > 0, 'At least one search query is required'),
  notify_signal: formBoolean(false),
  notify_agent: z.enum(AGENTS).optional().nullable(),
  // Carried through untouched: the digest the next run compares against. Not a
  // form field — it is round-tripped so an edit doesn't reset the baseline.
  last_digest: z.string().optional().nullable(),
});

// queries arrive as a JSON-encoded string (FormData has no array type).
const newsQueriesSchema = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to splitter for backwards-compatible plain strings
    }
    return v
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string().trim().min(1).max(200)).min(1, 'Add at least one search query').max(8, 'Up to 8 queries'));

const RELEVANCE_FILTERS = Object.values(NewsRelevanceFilter) as [string, ...string[]];

// Same JSON-encoded-array transport as newsQueriesSchema — FormData has no
// array type, and the checkbox group can legitimately be narrowed to one.
const platformsSchema = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  return [];
}, z.array(z.enum(['linkedin', 'twitter_x'])).min(1, 'Pick at least one platform'));

const newsIngestConfig = z.object({
  action_type: z.literal('news_ingest'),
  category: z.enum(NEWS_CATEGORIES, { errorMap: () => ({ message: 'Pick a category' }) }),
  queries: newsQueriesSchema,
  max_results_per_query: optionalInt(5, 20, 15),
  max_curated: optionalInt(1, 10, 6),
  // Optional in the DB — omitted rows fall back to defaultRelevanceFilter(category)
  // on the agent side, so the default is resolved in buildActionConfig, not here.
  relevance_filter: z.enum(RELEVANCE_FILTERS).optional(),
});

const newsCurationConfig = z.object({
  action_type: z.literal('news_curation'),
  max_stories: optionalInt(1, 6, 6),
  lookback_hours: optionalInt(6, 72, 24),
});

const podcastIngestConfig = z.object({
  action_type: z.literal('podcast_ingest'),
  max_items_per_source: optionalInt(1, 100, 25),
  lookback_days: optionalInt(1, 90, 14),
});

const newsSourceScanConfig = z.object({
  action_type: z.literal('news_source_scan'),
  max_items_per_source: optionalInt(1, 100, 10),
  lookback_days: optionalInt(1, 30, 3),
});

const newsletterConfig = z.object({
  action_type: z.literal('newsletter'),
  time_range: z.enum(['week', 'fortnight', 'month']).optional().default('month'),
  story_count: optionalInt(3, 8, 5),
  target_word_count: optionalInt(100, 800, 250),
  audience_context: z.string().optional().default(''),
  monthly_guard: formBoolean(false),
  // Carried through untouched: marks the /content page's re-armable one-shot.
  // Dropping it would turn the on-demand newsletter into a weekly one.
  one_off: formBoolean(false),
});

const socialPostConfig = z.object({
  action_type: z.literal('social_post_from_news'),
  founder_team_member_id: z.string().uuid('Pick the founder these posts are for'),
  platforms: platformsSchema,
  lookback_hours: optionalInt(6, 72, 24),
});

const indicatorPollConfig = z.object({
  action_type: z.literal('indicator_poll'),
  backfill_periods: optionalInt(1, 120, 18),
});

const onchainPollConfig = z.object({
  action_type: z.literal('onchain_poll'),
  backfill_days: optionalInt(1, 3650, 90),
});

const reportWatchScanConfig = z.object({
  action_type: z.literal('report_watch_scan'),
  max_acquisitions_per_run: optionalInt(1, 100, 10),
});

// No knobs — the report always covers every displayed on-chain metric and every
// active macro indicator.
const marketReportConfig = z.object({
  action_type: z.literal('market_report'),
});

const baseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  agent_name: z.enum(AGENTS),
  frequency: z.enum(FREQUENCIES),
  time_of_day: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time'),
  timezone: z.string().min(1).default(DEFAULT_TIMEZONE),
  show_on_dashboard: formBoolean(false),
  dashboard_title: z.string().optional().default(''),
  is_active: formBoolean(true),
});

// Every action_type the agent-side executeRoutineWorkflow can run has a member
// here. A type missing from this union is a routine that cannot be saved from
// the web UI at all — not even to change its schedule or switch it off.
const createSchema = z
  .discriminatedUnion('action_type', [
    baseSchema.merge(researchDigestConfig),
    baseSchema.merge(monitorChangeConfig),
    baseSchema.merge(newsIngestConfig),
    baseSchema.merge(newsSourceScanConfig),
    baseSchema.merge(newsCurationConfig),
    baseSchema.merge(podcastIngestConfig),
    baseSchema.merge(newsletterConfig),
    baseSchema.merge(socialPostConfig),
    baseSchema.merge(indicatorPollConfig),
    baseSchema.merge(onchainPollConfig),
    baseSchema.merge(marketReportConfig),
    baseSchema.merge(reportWatchScanConfig),
  ])
  .superRefine((data, ctx) => {
    if (data.action_type === 'news_ingest') {
      if (data.max_curated > data.max_results_per_query * data.queries.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Curated cap cannot exceed results per query × number of queries',
          path: ['max_curated'],
        });
      }
    }
  });

function normalizeTime(t: string): string {
  return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
}

function buildActionConfig(input: z.infer<typeof createSchema>): Json {
  switch (input.action_type) {
    case 'research_digest':
      return {
        subject: input.subject,
        context: input.context || undefined,
        search_queries: input.search_queries,
        archive_sources: input.archive_sources,
        max_sources: input.max_sources,
      };
    case 'monitor_change':
      return {
        subject: input.subject,
        context: input.context || undefined,
        search_queries: input.search_queries,
        notify_signal: input.notify_signal,
        notify_agent: input.notify_agent ?? null,
        last_digest: input.last_digest ?? null,
      };
    case 'news_ingest':
      return {
        category: input.category,
        queries: input.queries,
        max_results_per_query: input.max_results_per_query,
        max_curated: input.max_curated,
        relevance_filter:
          (input.relevance_filter as NewsRelevanceFilterT | undefined) ??
          defaultRelevanceFilter(input.category as NewsCategoryT),
      };
    case 'news_source_scan':
      return {
        max_items_per_source: input.max_items_per_source,
        lookback_days: input.lookback_days,
      };
    case 'news_curation':
      return {
        max_stories: input.max_stories,
        lookback_hours: input.lookback_hours,
        more_news_url: '/news',
      };
    case 'podcast_ingest':
      return {
        max_items_per_source: input.max_items_per_source,
        lookback_days: input.lookback_days,
      };
    case 'newsletter':
      return {
        time_range: input.time_range,
        story_count: input.story_count,
        target_word_count: input.target_word_count,
        audience_context: input.audience_context || null,
        monthly_guard: input.monthly_guard,
        one_off: input.one_off,
      };
    case 'social_post_from_news':
      return {
        founder_team_member_id: input.founder_team_member_id,
        platforms: input.platforms,
        lookback_hours: input.lookback_hours,
      };
    case 'indicator_poll':
      return { backfill_periods: input.backfill_periods };
    case 'onchain_poll':
      return { backfill_days: input.backfill_days };
    case 'report_watch_scan':
      return { max_acquisitions_per_run: input.max_acquisitions_per_run };
    case 'market_report':
      return {};
  }
}

function parseForm(formData: FormData) {
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  // Reject empty notify_agent so Zod treats it as undefined, not ''.
  if (raw['notify_agent'] === '') delete raw['notify_agent'];
  return createSchema.safeParse(raw);
}

export async function createRoutine(formData: FormData) {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const input = parsed.data;
  const timeOfDay = normalizeTime(input.time_of_day);
  const nextRunAt = computeNextRunAt({
    frequency: input.frequency,
    timeOfDay,
    timezone: input.timezone,
  });

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { data, error } = await supabase
    .from('routines')
    .insert({
      name: input.name,
      description: input.description || null,
      agent_name: input.agent_name,
      action_type: input.action_type,
      action_config: buildActionConfig(input),
      frequency: input.frequency,
      time_of_day: timeOfDay,
      timezone: input.timezone,
      next_run_at: nextRunAt.toISOString(),
      show_on_dashboard: input.show_on_dashboard,
      dashboard_title: input.dashboard_title || null,
      is_active: input.is_active,
    })
    .select()
    .single();

  if (error) return { error: humanizeError(error) };

  revalidatePath('/routines');
  if (input.show_on_dashboard) revalidatePath('/');
  return { success: true, routine: data };
}

export async function updateRoutine(id: string, formData: FormData) {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const input = parsed.data;
  const timeOfDay = normalizeTime(input.time_of_day);
  const nextRunAt = computeNextRunAt({
    frequency: input.frequency,
    timeOfDay,
    timezone: input.timezone,
  });

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase
    .from('routines')
    .update({
      name: input.name,
      description: input.description || null,
      agent_name: input.agent_name,
      action_type: input.action_type,
      action_config: buildActionConfig(input),
      frequency: input.frequency,
      time_of_day: timeOfDay,
      timezone: input.timezone,
      next_run_at: nextRunAt.toISOString(),
      show_on_dashboard: input.show_on_dashboard,
      dashboard_title: input.dashboard_title || null,
      is_active: input.is_active,
    })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };

  revalidatePath('/routines');
  revalidatePath('/');
  return { success: true };
}

export async function deleteRoutine(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.from('routines').delete().eq('id', id);
  if (error) return { error: humanizeError(error) };
  revalidatePath('/routines');
  revalidatePath('/');
  return { success: true };
}

export async function toggleRoutineActive(id: string, isActive: boolean) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase
    .from('routines')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) return { error: humanizeError(error) };
  revalidatePath('/routines');
  revalidatePath('/');
  return { success: true };
}

export async function runRoutineNow(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase
    .from('routines')
    .update({ next_run_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: humanizeError(error) };
  revalidatePath('/routines');
  return { success: true };
}
