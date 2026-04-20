import { createRealtimeClient } from '@platform/db';

const supabase = createRealtimeClient();
import type { CoreMessage } from 'ai';
import { charlie } from '../agents/contentCreator/index.js';

type ProposedAction = {
  agent: string;
  message: string;
  context?: Record<string, unknown>;
};

type ActivityRow = {
  id: string;
  proposed_actions: unknown;
};

const CONTENT_TYPE_KEYWORDS: Array<[string, string]> = [
  ['newsletter', 'newsletter'],
  ['linkedin', 'linkedin'],
  ['twitter', 'twitter_x'],
  ['tweet', 'twitter_x'],
  ['blog', 'blog'],
  ['email', 'email'],
];

function inferContentType(message: string): string {
  const lower = message.toLowerCase();
  for (const [keyword, type] of CONTENT_TYPE_KEYWORDS) {
    if (lower.includes(keyword)) return type;
  }
  return 'email';
}

// Module-level state so reconnect logic is properly deduped across calls
let currentChannel: ReturnType<typeof supabase.channel> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let hasEverSubscribed = false;

function scheduleReconnect(reason?: string): void {
  if (reconnectTimer !== null) return;
  reconnectAttempt += 1;
  const delay = Math.min(5000 * Math.pow(2, reconnectAttempt - 1), 60000);
  const scenario = hasEverSubscribed ? 'connection lost' : 'never connected';
  console.log(
    `[content-creator-listener] ${scenario} — reconnect attempt ${reconnectAttempt} in ${delay / 1000}s` +
    (reason ? ` (${reason})` : '')
  );
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startContentCreatorListener();
  }, delay);
}

/**
 * Subscribes to agent_activity via Supabase Realtime.
 * When Simon dispatches to charlie, invokes contentCreator.generate()
 * with the provided message and logs the result back to agent_activity.
 */
export function startContentCreatorListener(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (currentChannel !== null) {
    void supabase.removeChannel(currentChannel);
  }

  const channel = supabase
    .channel('content-creator-dispatches')
    .on(
      'postgres_changes' as never,
      { event: 'INSERT', schema: 'public', table: 'agent_activity' },
      async (payload: { new: ActivityRow }) => {
        const row = payload.new;
        const proposed = Array.isArray(row.proposed_actions)
          ? (row.proposed_actions as ProposedAction[])
          : [];

        const dispatch = proposed.find((a) => a.agent === 'charlie');
        if (!dispatch) return;

        console.log(`[content-creator-listener] Dispatch received from activity ${row.id}`);

        const messages: CoreMessage[] = [{ role: 'user', content: dispatch.message }];

        let responseText: string;
        try {
          const result = await charlie.generate(messages);
          responseText = result.text;
        } catch (err) {
          console.error('[content-creator-listener] Content Creator error:', err);
          await supabase.from('agent_activity').insert({
            agent_name: 'charlie',
            action: `Error processing dispatch from activity ${row.id}: ${String(err)}`,
            status: 'error',
            trigger_type: 'agent',
            workflow_run_id: null,
            entity_type: null,
            entity_id: null,
            proposed_actions: null,
            approved_actions: null,
            clarifications: null,
            notes: null,
          });
          return;
        }

        // Listener owns persistence — save draft to content_items unconditionally
        // rather than relying on Charlie's tool calls, which are unreliable.
        const existingContentItemId = dispatch.context?.['content_item_id'] as string | undefined;

        let contentItemId: string | null = null;
        if (existingContentItemId) {
          // Revision: update the existing draft
          const { data } = await supabase
            .from('content_items')
            .update({ body: responseText, updated_at: new Date().toISOString() })
            .eq('id', existingContentItemId)
            .select('id')
            .single();
          contentItemId = data?.id ?? existingContentItemId;
        } else {
          // First draft: insert a new content_items row
          const { data } = await supabase
            .from('content_items')
            .insert({
              body: responseText,
              type: inferContentType(dispatch.message),
              status: 'draft',
              source: 'content_agent',
              source_interaction_id: row.id,
            })
            .select('id')
            .single();
          contentItemId = data?.id ?? null;
        }

        if (contentItemId) {
          console.log(`[content-creator-listener] Saved draft to content_items ${contentItemId}`);
        } else {
          console.warn('[content-creator-listener] Failed to save draft to content_items');
        }

        await supabase.from('agent_activity').insert({
          agent_name: 'charlie',
          action: `Completed task dispatched from activity ${row.id}: ${dispatch.message.slice(0, 120)}`,
          status: 'auto',
          trigger_type: 'agent',
          workflow_run_id: null,
          entity_type: contentItemId ? 'content_items' : null,
          entity_id: contentItemId,
          proposed_actions: null,
          approved_actions: [{ response: responseText }],
          clarifications: null,
          notes: null,
        });

        console.log(`[content-creator-listener] Completed dispatch from activity ${row.id}`);
      }
    )
    .subscribe((status, err) => {
      if (channel !== currentChannel) return;

      console.log('[content-creator-listener] Subscription status:', status);
      if (err) console.error('[content-creator-listener] Subscription error:', err);
      if (status === 'SUBSCRIBED') {
        hasEverSubscribed = true;
        reconnectAttempt = 0;
        console.log('[content-creator-listener] Listening for Content Creator dispatches via Supabase Realtime');
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        scheduleReconnect(err ? String(err) : status);
      } else if (status === 'CLOSED') {
        scheduleReconnect('CLOSED');
      }
    });

  currentChannel = channel;
}
