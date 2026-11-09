import { createRealtimeClient, supabase } from '@platform/db';
import { activeLayouts, lintImageConcept, type ImageConcept } from '@platform/shared';
import {
  briefConcepts,
  classifyAltText,
  loadCanon,
  loadImageHistory,
  logActivity,
  renderCandidateSet,
  type PersistedPost,
} from '../workflows/socialPost/image.js';
import { mapNewsRowToCandidate } from '../workflows/socialPost/select.js';
import type { Platform } from '../workflows/variant/schemas.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('content-image-request');

// Web path for the image slot on /content/[id]. The page can't reach the agents
// server over HTTP, so "Regenerate image", "Render with this brief" and an
// alt-text edit INSERT a content_image_requests row (status 'pending'); this
// listener claims it (pending → working), does the work, and resolves it to
// 'done' or 'failed' with an error the page shows. Same web → DB → agents
// pattern as libraryQuestionListener.
//
// A run's images are a candidate set: up to three generation groups, each with a
// crop per draft (LinkedIn and X), exactly one group selected. Regenerate writes
// a fresh set of three from a fresh brief, then marks the old set 'regenerated'.
// Render-with-brief adds one candidate to the current set and selects it, which
// marks the others 'not_chosen'. Old rows are kept, because review_outcome is
// the signal a later distil step reads.

const realtime = createRealtimeClient();

// content_images' new columns and content_image_requests are not in the
// generated types until they are regenerated after the migration applies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// A request claimed but never resolved (crash, redeploy) is failed after this.
const STALE_WORKING_MS = 15 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

export type ImageRequestAction = 'regenerate' | 'render_brief' | 'recheck_alt_text';

export interface ImageRequestRow {
  id: string;
  status: string | null;
}

interface ClaimedRequest {
  id: string;
  content_item_id: string;
  action: ImageRequestAction;
  brief: Partial<ImageConcept> | null;
}

interface SetRow {
  id: string;
  content_item_id: string;
  generation_group_id: string;
  candidate_set_id: string | null;
  candidate_index: number | null;
  is_selected: boolean;
  platform_crop: string | null;
  image_brief: unknown;
  alt_text: string | null;
  review_outcome: string | null;
  created_at: string;
}

const SET_COLUMNS =
  'id, content_item_id, generation_group_id, candidate_set_id, candidate_index, is_selected, platform_crop, image_brief, alt_text, review_outcome, created_at';

/** The platform a crop belongs to, from its platform_crop key. Pure. */
export function platformOfCrop(cropKey: string | null): Platform | null {
  if (!cropKey) return null;
  if (cropKey.startsWith('linkedin_')) return 'linkedin';
  if (cropKey.startsWith('x_')) return 'twitter_x';
  return null;
}

/** A founder's edited concept, normalised to a renderable one. Pure. */
export function normaliseFounderConcept(input: Partial<ImageConcept> | null): ImageConcept {
  const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  return {
    tension: text(input?.tension),
    symbol: text(input?.symbol),
    twist: text(input?.twist),
    subject: text(input?.subject),
    layout: text(input?.layout),
    alt_text: text(input?.alt_text),
  };
}

const live = (r: SetRow) => r.review_outcome !== 'removed' && r.review_outcome !== 'regenerated';

export interface CurrentSet {
  /** Null for images made before candidate sets: their group stands in for a set. */
  setId: string | null;
  /** Every live row of the set, across both drafts. */
  rows: SetRow[];
  /** The selected group's rows, if one is selected. */
  selected: SetRow[];
}

/**
 * The item's current candidate set: the set of its newest live AI image, and
 * every live row in it. Null when the item has none. Filtered in code rather
 * than with an `or()` so the query stays a plain chain.
 */
async function currentSet(contentItemId: string): Promise<CurrentSet | null> {
  const { data, error } = await db
    .from('content_images')
    .select(SET_COLUMNS)
    .eq('content_item_id', contentItemId)
    .eq('source', 'ai_generated')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`content_images read failed: ${error.message}`);
  const newest = ((data ?? []) as SetRow[]).find((r) => r.generation_group_id && live(r));
  if (!newest) return null;

  const { data: setRows, error: setErr } = newest.candidate_set_id
    ? await db.from('content_images').select(SET_COLUMNS).eq('candidate_set_id', newest.candidate_set_id)
    : await db.from('content_images').select(SET_COLUMNS).eq('generation_group_id', newest.generation_group_id);
  if (setErr) throw new Error(`content_images set read failed: ${setErr.message}`);
  const rows = ((setRows ?? []) as SetRow[]).filter(live);
  return { setId: newest.candidate_set_id, rows, selected: rows.filter((r) => r.is_selected) };
}

async function postsFor(contentItemId: string, set: CurrentSet | null): Promise<PersistedPost[]> {
  const posts: PersistedPost[] = [];
  for (const r of set?.rows ?? []) {
    const platform = platformOfCrop(r.platform_crop);
    if (platform && !posts.some((p) => p.contentItemId === r.content_item_id)) {
      posts.push({ contentItemId: r.content_item_id, platform });
    }
  }
  if (posts.length > 0) return posts;
  // No set (never rendered, or removed): the image goes on this draft alone.
  const { data, error } = await db.from('content_items').select('id, type').eq('id', contentItemId).maybeSingle();
  if (error) throw new Error(`content_items read failed: ${error.message}`);
  const type = (data as { type?: string } | null)?.type;
  if (type !== 'linkedin' && type !== 'twitter_x') throw new Error('Images are only made for LinkedIn and X drafts.');
  return [{ contentItemId, platform: type }];
}

async function imageSpecsFor(posts: PersistedPost[]): Promise<Map<Platform, unknown>> {
  const specs = new Map<Platform, unknown>();
  const { data } = await db
    .from('platform_specs')
    .select('platform, image_specs')
    .in('platform', [...new Set(posts.map((p) => p.platform))]);
  for (const r of (data ?? []) as Array<{ platform: Platform; image_specs: unknown }>) specs.set(r.platform, r.image_specs);
  return specs;
}

/**
 * What a fresh brief reads for a draft: its copy, the story the morning run
 * drafted it from (recorded on its social_post_drafted activity), and the
 * subjects and layouts of its account's recent images. The story is optional:
 * a draft made outside the routine has the post alone.
 */
async function briefContext(contentItemId: string) {
  const { data: item, error } = await db
    .from('content_items')
    .select('id, body, title, social_account_id')
    .eq('id', contentItemId)
    .maybeSingle();
  if (error) throw new Error(`content_items read failed: ${error.message}`);
  if (!item) throw new Error('That draft could not be found.');

  let story = null;
  let form: string | null = null;
  const { data: activity } = await db
    .from('agent_activity')
    .select('proposed_actions')
    .eq('entity_id', contentItemId)
    .eq('action', 'social_post_drafted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const drafted = Array.isArray(activity?.proposed_actions) ? activity.proposed_actions[0] : null;
  if (typeof drafted?.story_id === 'string') {
    const { data: news } = await db
      .from('news_items')
      .select('id, title, url, summary, key_points, source_name, category, relevance_score, topic_tags, published_at')
      .eq('id', drafted.story_id)
      .maybeSingle();
    if (news) story = mapNewsRowToCandidate(news);
    form = typeof drafted.form === 'string' ? drafted.form : null;
  }

  const accountIds = item.social_account_id ? [item.social_account_id as string] : [];
  return {
    story,
    form,
    postCopy: [item.title, item.body].filter((v: unknown) => typeof v === 'string' && v.trim()).join('\n\n'),
    history: await loadImageHistory(accountIds),
  };
}

async function retire(rows: SetRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from('content_images')
    .update({ review_outcome: 'regenerated', is_selected: false })
    .in('id', rows.map((r) => r.id));
  // The new set is in place and selected; the page shows the newest. Logged, not thrown.
  if (error) log.warn({ error: error.message }, 'marking the previous candidate set regenerated failed');
}

/** A fresh brief, a fresh set of up to three candidates, then the old set retired. */
async function regenerate(req: ClaimedRequest): Promise<void> {
  const set = await currentSet(req.content_item_id);
  const canon = await loadCanon();
  if (!canon) throw new Error('There is no active brand visual canon. Set one up in Brand → Visual.');

  const briefed = await briefConcepts(canon, await briefContext(req.content_item_id));
  if ('skip' in briefed) throw new Error(`No new images: ${briefed.skip}`);

  const posts = await postsFor(req.content_item_id, set);
  const result = await renderCandidateSet({
    canon,
    concepts: briefed.concepts,
    review: briefed.review,
    posts,
    imageSpecs: await imageSpecsFor(posts),
    triggerType: 'manual',
  });
  if (!result.selected) {
    throw new Error(result.results.map((r) => (r.ok ? '' : r.reason)).filter(Boolean).join(' | ') || 'Every candidate failed.');
  }
  await retire(set?.rows ?? []);
}

/** One founder-edited concept, rendered into the current set and selected. */
async function renderBrief(req: ClaimedRequest): Promise<void> {
  const concept = normaliseFounderConcept(req.brief);
  const canon = await loadCanon();
  if (!canon) throw new Error('There is no active brand visual canon. Set one up in Brand → Visual.');
  const flags = lintImageConcept(concept, { layouts: activeLayouts(canon), prohibitedTerms: canon.prohibitedTerms });
  if (flags.length > 0) throw new Error(`The brief needs changes: ${flags.join(' ')}`);

  const set = await currentSet(req.content_item_id);
  const posts = await postsFor(req.content_item_id, set);
  // A pre-set image has no set id; the new candidate starts one, and the old
  // group is retired once the new one is in, as a regenerate would.
  const startIndex = set?.setId ? Math.max(-1, ...set.rows.map((r) => r.candidate_index ?? 0)) + 1 : 0;
  const result = await renderCandidateSet({
    canon,
    concepts: [concept],
    posts,
    imageSpecs: await imageSpecsFor(posts),
    triggerType: 'manual',
    candidateSetId: set?.setId ?? undefined,
    startIndex,
    founderChoice: true,
  });
  if (!result.selected) throw new Error(result.results[0] && !result.results[0].ok ? result.results[0].reason : 'The render failed.');
  if (set && !set.setId) await retire(set.rows);
}

async function recheckAltText(req: ClaimedRequest): Promise<void> {
  const set = await currentSet(req.content_item_id);
  const group = set?.selected ?? [];
  const altText = group.find((r) => r.alt_text?.trim())?.alt_text?.trim();
  if (group.length === 0 || !altText) throw new Error('There is no alt text to check.');

  const verdict = await classifyAltText(altText);
  const groupId = group[0]!.generation_group_id;
  const { error } = await db
    .from('content_images')
    .update({
      alt_text_verdict: {
        classification: verdict.classification,
        needs_disclaimer: false,
        rationale: verdict.rationale,
        checked_at: new Date().toISOString(),
      },
    })
    .eq('generation_group_id', groupId);
  if (error) throw new Error(`alt_text_verdict update failed: ${error.message}`);

  await logActivity([
    {
      agent_name: 'lex',
      action: 'compliance_checked',
      status: 'pending',
      trigger_type: 'manual',
      entity_type: 'content_item',
      entity_id: req.content_item_id,
      proposed_actions: [{ type: 'image_alt_text', generation_group_id: groupId, classification: verdict.classification }],
    },
  ]);
}

async function resolve(id: string, error: string | null): Promise<void> {
  const { error: updErr } = await db
    .from('content_image_requests')
    .update({ status: error ? 'failed' : 'done', error, completed_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) log.error({ error: updErr.message, requestId: id }, 'resolving image request failed');
}

/**
 * Claim and run one pending request. The claim flips pending → working
 * conditionally, so a concurrent listener or the sweep cannot run it twice.
 * Never throws: a failure is written to the row for the page to show.
 */
export async function handleImageRequestRow(row: ImageRequestRow): Promise<void> {
  if (row.status !== 'pending') return;

  const { data: claimed } = await db
    .from('content_image_requests')
    .update({ status: 'working' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id, content_item_id, action, brief');
  const req = (claimed as ClaimedRequest[] | null)?.[0];
  if (!req) return;

  log.info({ requestId: req.id, action: req.action }, 'image request claimed');
  try {
    if (req.action === 'recheck_alt_text') await recheckAltText(req);
    else if (req.action === 'regenerate') await regenerate(req);
    else if (req.action === 'render_brief') await renderBrief(req);
    else throw new Error(`Unknown image action: ${String(req.action)}`);
    await resolve(req.id, null);
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    log.warn({ requestId: req.id, action: req.action, error: message }, 'image request failed');
    await resolve(req.id, message);
  }
}

/**
 * Run anything left pending while the subscription was down, and fail anything
 * stuck in 'working' past STALE_WORKING_MS (claimed, then the process died).
 */
export async function reconcileImageRequests(now: number = Date.now()): Promise<void> {
  const staleBefore = new Date(now - STALE_WORKING_MS).toISOString();
  const { error: staleErr } = await db
    .from('content_image_requests')
    .update({
      status: 'failed',
      error: 'The image request did not finish. Try again.',
      completed_at: new Date(now).toISOString(),
    })
    .eq('status', 'working')
    .lt('updated_at', staleBefore);
  if (staleErr) log.warn({ error: staleErr.message }, 'failing stale image requests failed');

  const { data, error } = await db.from('content_image_requests').select('id, status').eq('status', 'pending');
  if (error || !data) return;
  for (const row of data as ImageRequestRow[]) {
    await handleImageRequestRow(row);
  }
}

/** Subscribe to content_image_requests and run each newly-inserted request. */
export function startContentImageRequestListener(): void {
  subscribeWithReconnect({
    client: realtime,
    channelName: 'content-image-request',
    logPrefix: '[content-image-request]',
    onSubscribed: () => {
      log.info('listening for image requests via Supabase Realtime');
      void reconcileImageRequests();
    },
    attachHandlers: (channel) =>
      channel.on(
        'postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'content_image_requests' },
        async (payload: { eventType: string; new: ImageRequestRow }) => {
          await handleImageRequestRow(payload.new);
        },
      ),
  });
  setInterval(() => {
    void reconcileImageRequests().catch((err) => log.error({ err }, 'image request sweep failed'));
  }, RECONCILE_INTERVAL_MS).unref();
}
