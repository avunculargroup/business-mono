import type { Json } from '@platform/db';
import type {
  CampaignAccount,
  CampaignBeat,
  CampaignCadence,
  CampaignDetail,
  CampaignGate,
  CampaignGateDecision,
  CampaignMatrixRow,
  CampaignOverview,
  CampaignRepository,
  NewCampaignDraft,
  NewVoiceSnippet,
  PostMetrics,
  PublishedPost,
  ReadContext,
  ReadyToPostQueue,
  VariantCopy,
  VariantGateDecision,
  VariantReview,
} from '@platform/data';
import type { SupabaseAdapterContext } from '../adapterContext';

/**
 * Codepoint count — closer to how platforms count than UTF-16 `.length`, which
 * counts an emoji or an astral character twice.
 */
function charCount(text: string): number {
  return Array.from(text).length;
}

type GateState = { gate?: string; preview?: Record<string, Json> } | null;

/**
 * Patch the suspended gate's preview so the editor reflects an edit at once,
 * while the recomputed compliance verdict fills in shortly after.
 *
 * Left untouched when there is no preview to patch — a gate that is not
 * suspended has nothing to show.
 */
function patchGatePreview(gateState: GateState, copy: VariantCopy): GateState {
  if (gateState?.preview == null) return gateState;

  return {
    ...gateState,
    preview: {
      ...gateState.preview,
      isThread: copy.isThread,
      body: copy.body,
      segments: copy.segments,
      charCount: copy.isThread
        ? charCount(copy.segments.map((s, i) => `${i + 1}/ ${s}`).join('\n\n'))
        : charCount(copy.body),
    },
  };
}


/** The statuses after which the plan is fixed and its variants exist. */
const PLAN_LOCKED_STATUSES = new Set(['plan_approved', 'active', 'completed']);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type OverviewRow = {
  id: string;
  slug: string;
  name: string;
  objective: string | null;
  status: string;
  start_date: string | null;
  duration_weeks: number | null;
  end_date: string | null;
  days_remaining: number | null;
  total_variants: number;
  published_count: number;
  approved_count: number;
  pending_count: number;
  flagged_count: number;
};

type MatrixRow = {
  id: string;
  slug: string;
  beat_id: string | null;
  beat_sequence: number | null;
  beat_title: string | null;
  account_id: string;
  account_name: string | null;
  platform: 'linkedin' | 'twitter_x';
  is_thread: boolean;
  status: string;
  scheduled_for: string | null;
  compliance_status: string | null;
  needs_disclaimer: boolean;
};

type ReadyToPostRow = {
  id: string;
  slug: string;
  title: string | null;
  body: string | null;
  type: 'linkedin' | 'twitter_x';
  is_thread: boolean;
  account_name: string | null;
  platform: 'linkedin' | 'twitter_x';
  profile_url: string | null;
  scheduled_for: string | null;
  disclaimer_text: string | null;
};

type PublishedRow = {
  id: string;
  title: string | null;
  body: string | null;
  type: 'linkedin' | 'twitter_x';
  is_thread: boolean;
  published_url: string | null;
  social_accounts: { display_name: string | null } | null;
  post_metrics: PublishedPost['metrics'] | PublishedPost['metrics'][] | null;
};

async function readBeats(
  client: SupabaseAdapterContext['client'],
  campaignId: string,
): Promise<CampaignBeat[]> {
  const { data, error } = await client
    .from('campaign_beats')
    .select('id, sequence, title, core_message, rationale, prefer_thread')
    .eq('campaign_id', campaignId)
    .order('sequence', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    sequence: row.sequence,
    title: row.title,
    coreMessage: row.core_message,
    rationale: row.rationale,
    preferThread: row.prefer_thread,
  }));
}

async function readMatrix(
  client: SupabaseAdapterContext['client'],
  campaignId: string,
): Promise<CampaignMatrixRow[]> {
  const { data, error } = await client
    .from('v_campaign_matrix')
    .select('*')
    .eq('campaign_id', campaignId);

  if (error) throw error;
  return ((data ?? []) as unknown as MatrixRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    beatId: row.beat_id,
    beatSequence: row.beat_sequence,
    beatTitle: row.beat_title,
    accountId: row.account_id,
    accountName: row.account_name,
    platform: row.platform,
    isThread: row.is_thread,
    status: row.status,
    scheduledFor: row.scheduled_for,
    complianceStatus: row.compliance_status,
    needsDisclaimer: row.needs_disclaimer,
  }));
}

async function readPublished(
  client: SupabaseAdapterContext['client'],
  campaignId: string,
): Promise<PublishedPost[]> {
  const { data, error } = await client
    .from('content_items')
    .select(
      'id, title, body, type, is_thread, published_url, social_accounts(display_name), post_metrics(impressions, reactions, comments, reposts, clicks)',
    )
    .eq('campaign_id', campaignId)
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as PublishedRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    isThread: row.is_thread,
    publishedUrl: row.published_url,
    accountName: row.social_accounts?.display_name ?? null,
    // post_metrics is one row per content item, but PostgREST returns a
    // to-many relation as an array. Flattened here rather than in the page.
    metrics: Array.isArray(row.post_metrics) ? (row.post_metrics[0] ?? null) : row.post_metrics,
  }));
}

/** Thread bodies by content item, in sequence. One query for every thread. */
async function readSegmentsFor(
  client: SupabaseAdapterContext['client'],
  contentItemIds: string[],
): Promise<Record<string, string[]>> {
  if (contentItemIds.length === 0) return {};

  const { data, error } = await client
    .from('thread_segments')
    .select('content_item_id, sequence, body')
    .in('content_item_id', contentItemIds)
    .order('sequence', { ascending: true });

  if (error) throw error;

  const byItem: Record<string, string[]> = {};
  for (const segment of data ?? []) {
    (byItem[segment.content_item_id] ??= []).push(segment.body);
  }
  return byItem;
}

export function createCampaignRepository(
  adapter: SupabaseAdapterContext,
): CampaignRepository {
  const { client, principal } = adapter;

  return {
    async listOverview(_ctx: ReadContext): Promise<CampaignOverview[]> {
      const { data, error } = await client.from('v_campaign_overview').select('*');
      if (error) throw error;

      return ((data ?? []) as unknown as OverviewRow[]).map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        objective: row.objective,
        status: row.status,
        startDate: row.start_date,
        durationWeeks: row.duration_weeks,
        endDate: row.end_date,
        daysRemaining: row.days_remaining,
        totalVariants: row.total_variants,
        publishedCount: row.published_count,
        approvedCount: row.approved_count,
        pendingCount: row.pending_count,
        flaggedCount: row.flagged_count,
      }));
    },

    async listAccounts(_ctx: ReadContext): Promise<CampaignAccount[]> {
      const { data, error } = await client
        .from('social_accounts')
        .select('id, platform, account_type, display_name')
        .eq('is_active', true)
        .order('display_name', { ascending: true });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        platform: row.platform,
        accountType: row.account_type,
        displayName: row.display_name,
      }));
    },

    async getDetail(_ctx: ReadContext, idOrSlug: string): Promise<CampaignDetail | null> {
      const { data: campaign, error } = await client
        .from('campaigns')
        .select(
          'id, slug, name, objective, status, strategy, schedule_plan, gate_state, pending_decision, workflow_run_id',
        )
        .eq(isUuid(idOrSlug) ? 'id' : 'slug', idOrSlug)
        .maybeSingle();

      if (error) throw error;
      if (!campaign) return null;

      // Before the plan is approved the beats live transiently in gate_state
      // and no variants exist, so there is nothing downstream to read.
      const planLocked = PLAN_LOCKED_STATUSES.has(campaign.status);

      const base = {
        id: campaign.id,
        slug: campaign.slug,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
        // The workflow owns these payloads and writes them verbatim; the
        // adapter names the columns, it does not reshape them.
        strategy: campaign.strategy as CampaignDetail['strategy'],
        schedulePlan: campaign.schedule_plan as CampaignDetail['schedulePlan'],
        gateState: campaign.gate_state as CampaignDetail['gateState'],
        pendingDecision: campaign.pending_decision,
        workflowRunId: campaign.workflow_run_id,
        planLocked,
      };

      if (!planLocked) {
        return { ...base, beats: [], matrix: [], published: [] };
      }

      const [beats, matrix, published] = await Promise.all([
        readBeats(client, campaign.id),
        readMatrix(client, campaign.id),
        readPublished(client, campaign.id),
      ]);

      return { ...base, beats, matrix, published };
    },

    async getReadyToPost(
      _ctx: ReadContext,
      idOrSlug: string,
    ): Promise<ReadyToPostQueue | null> {
      const { data: campaign, error } = await client
        .from('campaigns')
        .select('id, slug, name')
        .eq(isUuid(idOrSlug) ? 'id' : 'slug', idOrSlug)
        .maybeSingle();

      if (error) throw error;
      if (!campaign) return null;

      const { data, error: queueError } = await client
        .from('v_ready_to_post')
        .select('*')
        .eq('campaign_id', campaign.id);

      if (queueError) throw queueError;
      const rows = (data ?? []) as unknown as ReadyToPostRow[];

      // One query for every thread's segments rather than one per row — a view
      // cannot cleanly nest its children, but it does not have to n+1 either.
      const segmentsByItem = await readSegmentsFor(
        client,
        rows.filter((row) => row.is_thread).map((row) => row.id),
      );

      return {
        campaignId: campaign.id,
        campaignSlug: campaign.slug,
        campaignName: campaign.name,
        items: rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          body: row.body,
          type: row.type,
          isThread: row.is_thread,
          accountName: row.account_name,
          platform: row.platform,
          profileUrl: row.profile_url,
          scheduledFor: row.scheduled_for,
          disclaimerText: row.disclaimer_text,
          segments: segmentsByItem[row.id] ?? [],
        })),
      };
    },

    async getVariantReview(
      _ctx: ReadContext,
      idOrSlug: string,
    ): Promise<VariantReview | null> {
      const { data, error } = await client
        .from('content_items')
        .select('id, status, workflow_run_id, gate_state, campaign_id')
        .eq(isUuid(idOrSlug) ? 'id' : 'slug', idOrSlug)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Resolved here so the page can link back by slug without knowing that a
      // campaign id and a campaign slug are different things.
      let campaignSlug: string | null = null;
      if (data.campaign_id) {
        const { data: campaign } = await client
          .from('campaigns')
          .select('slug')
          .eq('id', data.campaign_id)
          .maybeSingle();
        campaignSlug = campaign?.slug ?? null;
      }

      return {
        id: data.id,
        status: data.status,
        gateState: data.gate_state,
        campaignSlug,
      };
    },

    async getGate(_ctx: ReadContext, id: string): Promise<CampaignGate | null> {
      const { data, error } = await client
        .from('campaigns')
        .select('status, gate_state, workflow_run_id')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const gateState = data.gate_state as GateState;
      return {
        status: data.status,
        workflowRunId: data.workflow_run_id,
        openGate: gateState?.gate ?? null,
      };
    },

    async setCampaignDecision(id: string, decision: CampaignGateDecision): Promise<void> {
      const { error } = await client
        .from('campaigns')
        .update({ pending_decision: decision as unknown as Json })
        .eq('id', id);

      if (error) throw error;
    },

    async setVariantDecision(
      contentItemId: string,
      decision: VariantGateDecision,
    ): Promise<void> {
      const { error } = await client
        .from('content_items')
        .update({ pending_decision: decision as unknown as Json })
        .eq('id', contentItemId);

      if (error) throw error;
    },

    async createDraft(input: NewCampaignDraft): Promise<string> {
      const { data, error } = await client
        .from('campaigns')
        .insert({
          name: input.name,
          objective: input.objective,
          audience_filter: input.audienceFilter as unknown as Json,
          audience_persona: input.audiencePersona,
          status: 'draft',
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    },

    async saveCadenceAndLaunch(id: string, cadence: CampaignCadence): Promise<void> {
      const { error: cadenceError } = await client
        .from('campaigns')
        .update({
          posts_per_week: cadence.postsPerWeek,
          post_slots: { slots: cadence.slots } as unknown as Json,
          duration_weeks: cadence.durationWeeks,
          start_date: cadence.startDate,
        })
        .eq('id', id);

      if (cadenceError) throw cadenceError;

      // The participating-accounts join is replaced wholesale. There is no
      // transaction here: a failed insert after the delete leaves the campaign
      // with none, which is pre-existing behaviour and why the launch signal is
      // written last — the listener must not see a half-built campaign.
      const { error: clearError } = await client
        .from('campaign_accounts')
        .delete()
        .eq('campaign_id', id);
      if (clearError) throw clearError;

      const { error: accountsError } = await client
        .from('campaign_accounts')
        .insert(
          cadence.accountIds.map((accountId) => ({
            campaign_id: id,
            social_account_id: accountId,
          })),
        );
      if (accountsError) throw accountsError;

      const { error: launchError } = await client
        .from('campaigns')
        .update({ pending_decision: { decision: 'start' } as unknown as Json })
        .eq('id', id);
      if (launchError) throw launchError;
    },

    async markVariantPosted(contentItemId: string, url: string): Promise<boolean> {
      // The `approved` check rides on the update rather than preceding it, so
      // two submits racing cannot both find the row approved and both write.
      const { data, error } = await client
        .from('content_items')
        .update({
          published_url: url,
          published_at: new Date().toISOString(),
          status: 'published',
        })
        .eq('id', contentItemId)
        .eq('status', 'approved')
        .select('id');

      if (error) throw error;
      return (data ?? []).length > 0;
    },

    async saveVariantCopy(contentItemId: string, copy: VariantCopy): Promise<boolean> {
      const { data: existing, error: readError } = await client
        .from('content_items')
        .select('gate_state')
        .eq('id', contentItemId)
        .maybeSingle();

      if (readError) throw readError;
      if (!existing) return false;

      const { error } = await client
        .from('content_items')
        .update({
          body: copy.body || null,
          is_thread: copy.isThread,
          char_count: copy.isThread ? null : charCount(copy.body),
          // A cleared verdict must not survive an edit — the same invariant the
          // content repository holds, for the same reason.
          compliance_status: 'pending',
          compliance_checked_at: null,
          gate_state: patchGatePreview(existing.gate_state as GateState, copy) as unknown as Json,
        })
        .eq('id', contentItemId);

      if (error) throw error;

      const { error: clearError } = await client
        .from('thread_segments')
        .delete()
        .eq('content_item_id', contentItemId);
      if (clearError) throw clearError;

      if (copy.isThread && copy.segments.length > 0) {
        const { error: segmentError } = await client.from('thread_segments').insert(
          copy.segments.map((body, index) => ({
            content_item_id: contentItemId,
            sequence: index + 1,
            body,
            char_count: charCount(body),
          })),
        );
        if (segmentError) throw segmentError;
      }

      return true;
    },

    async savePostMetrics(
      contentItemId: string,
      platform: string,
      metrics: PostMetrics,
    ): Promise<void> {
      const { error } = await client.from('post_metrics').upsert(
        {
          content_item_id: contentItemId,
          platform,
          impressions: metrics.impressions,
          reactions: metrics.reactions,
          comments: metrics.comments,
          reposts: metrics.reposts,
          clicks: metrics.clicks,
          recorded_at: new Date().toISOString(),
          // From the bound principal, never from an argument.
          recorded_by: principal.userId,
        },
        { onConflict: 'content_item_id' },
      );

      if (error) throw error;
    },

    async promoteToVoiceSnippet(
      contentItemId: string,
      snippet: NewVoiceSnippet,
    ): Promise<void> {
      // The post's own account and platform anchor the snippet to that voice.
      const { data: item, error: readError } = await client
        .from('content_items')
        .select('social_account_id, type')
        .eq('id', contentItemId)
        .maybeSingle();

      if (readError) throw readError;

      const type = item?.type;
      const { error } = await client.from('voice_snippets').insert({
        social_account_id: item?.social_account_id ?? null,
        snippet_type: snippet.snippetType,
        body: snippet.body,
        curator_note: snippet.curatorNote,
        // `voice_snippets.platform` only recognises the two social platforms;
        // a newsletter or blog post has no platform voice to anchor to.
        platform: type === 'linkedin' || type === 'twitter_x' ? type : null,
        topic_tags: snippet.topicTags,
        source: 'promoted_from_post',
        source_content_item_id: contentItemId,
        created_by: principal.userId,
      });

      if (error) throw error;
    },
  };
}
