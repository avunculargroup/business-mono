import { createRealtimeClient, supabase } from '@platform/db';
import { lintImageBrief, type ImageBrief } from '@platform/shared';
import {
  classifyAltText,
  loadCanon,
  logActivity,
  renderAndPersistImage,
  type PersistedPost,
} from '../workflows/socialPost/image.js';
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
// One render serves every crop in a generation group (the LinkedIn and X drafts
// of one run), so regenerate and render-with-brief replace the whole group: the
// new group is written first, then the old rows are marked 'regenerated'. They
// are kept, because review_outcome is the signal a later distil step reads.

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
  brief: Partial<ImageBrief> | null;
}

interface GroupRow {
  id: string;
  content_item_id: string;
  generation_group_id: string;
  platform_crop: string | null;
  image_brief: ImageBrief | null;
  alt_text: string | null;
  review_outcome: string | null;
  created_at: string;
}

/** The platform a crop belongs to, from its platform_crop key. Pure. */
export function platformOfCrop(cropKey: string | null): Platform | null {
  if (!cropKey) return null;
  if (cropKey.startsWith('linkedin_')) return 'linkedin';
  if (cropKey.startsWith('x_')) return 'twitter_x';
  return null;
}

/** A founder's edited brief, normalised to a renderable one. Pure. */
export function normaliseFounderBrief(input: Partial<ImageBrief> | null): ImageBrief {
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
  return {
    skip: false,
    skip_reason: null,
    motif_key: text(input?.motif_key),
    subject: text(input?.subject),
    metaphor: text(input?.metaphor),
    composition: text(input?.composition),
    alt_text: text(input?.alt_text),
  };
}

/**
 * The item's current AI image group — the newest ai_generated rows not marked
 * regenerated or removed — and every row in it (one per draft). Null when the
 * item has none. Filtered in code rather than with an `or()` so the query stays
 * a plain chain.
 */
async function currentGroup(contentItemId: string): Promise<GroupRow[] | null> {
  const { data, error } = await db
    .from('content_images')
    .select('id, content_item_id, generation_group_id, platform_crop, image_brief, alt_text, review_outcome, created_at')
    .eq('content_item_id', contentItemId)
    .eq('source', 'ai_generated')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`content_images read failed: ${error.message}`);
  const live = ((data ?? []) as GroupRow[]).find(
    (r) => r.generation_group_id && (r.review_outcome === null || r.review_outcome === 'kept'),
  );
  if (!live) return null;

  const { data: groupRows, error: groupErr } = await db
    .from('content_images')
    .select('id, content_item_id, generation_group_id, platform_crop, image_brief, alt_text, review_outcome, created_at')
    .eq('generation_group_id', live.generation_group_id);
  if (groupErr) throw new Error(`content_images group read failed: ${groupErr.message}`);
  return (groupRows ?? []) as GroupRow[];
}

async function postsFor(contentItemId: string, group: GroupRow[] | null): Promise<PersistedPost[]> {
  if (group && group.length > 0) {
    const posts: PersistedPost[] = [];
    for (const r of group) {
      const platform = platformOfCrop(r.platform_crop);
      if (platform && !posts.some((p) => p.contentItemId === r.content_item_id)) {
        posts.push({ contentItemId: r.content_item_id, platform });
      }
    }
    if (posts.length > 0) return posts;
  }
  // No group (never rendered, or removed): the image goes on this draft alone.
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

async function rerender(req: ClaimedRequest): Promise<void> {
  const group = await currentGroup(req.content_item_id);

  let brief: ImageBrief;
  if (req.action === 'regenerate') {
    const stored = group?.find((r) => r.image_brief)?.image_brief;
    if (!stored) throw new Error('There is no image to regenerate. Edit the brief to render one.');
    brief = { ...stored, skip: false, skip_reason: null };
  } else {
    brief = normaliseFounderBrief(req.brief);
  }

  const canon = await loadCanon();
  if (!canon) throw new Error('There is no active brand visual canon. Set one up in Brand → Visual.');
  const flags = lintImageBrief(brief, { motifs: canon.motifs, prohibitedTerms: canon.prohibitedTerms });
  if (flags.length > 0) throw new Error(`The brief needs changes: ${flags.join(' ')}`);

  const posts = await postsFor(req.content_item_id, group);
  const result = await renderAndPersistImage({
    canon,
    brief,
    posts,
    imageSpecs: await imageSpecsFor(posts),
    triggerType: 'manual',
  });
  if (!result.ok) throw new Error(result.reason);

  // The new group is in place; retire the old one. A failure here leaves two
  // live groups, and the page shows the newest, so it is logged, not thrown.
  const oldGroupId = group?.[0]?.generation_group_id;
  if (oldGroupId) {
    const { error } = await db
      .from('content_images')
      .update({ review_outcome: 'regenerated' })
      .eq('generation_group_id', oldGroupId);
    if (error) log.warn({ error: error.message, oldGroupId }, 'marking previous image group regenerated failed');
  }
}

async function recheckAltText(req: ClaimedRequest): Promise<void> {
  const group = await currentGroup(req.content_item_id);
  const altText = group?.find((r) => r.alt_text?.trim())?.alt_text?.trim();
  if (!group || !altText) throw new Error('There is no alt text to check.');

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
    else if (req.action === 'regenerate' || req.action === 'render_brief') await rerender(req);
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
