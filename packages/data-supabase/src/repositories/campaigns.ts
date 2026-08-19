import type { Json } from '@platform/db';
import type {
  CampaignCadence,
  CampaignGate,
  CampaignGateDecision,
  CampaignRepository,
  NewCampaignDraft,
  NewVoiceSnippet,
  PostMetrics,
  ReadContext,
  VariantCopy,
  VariantGateDecision,
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

export function createCampaignRepository(
  adapter: SupabaseAdapterContext,
): CampaignRepository {
  const { client, principal } = adapter;

  return {
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
