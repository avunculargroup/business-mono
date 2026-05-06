import { createRealtimeClient } from '@platform/db';
import { runDispatch } from '../lib/dispatchRunner.js';
import { charlie } from '../agents/contentCreator/index.js';

const supabase = createRealtimeClient();

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

function parseContentOutput(text: string): { title: string | null; body: string } {
  const match = text.match(
    /<content_output>\s*<title>([\s\S]*?)<\/title>\s*<body>([\s\S]*?)<\/body>\s*<\/content_output>/
  );
  if (match) {
    return { title: match[1].trim() || null, body: match[2].trim() };
  }
  return { title: null, body: text };
}

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

        const existingContentItemId = dispatch.context?.['content_item_id'] as string | undefined;

        await runDispatch({
          supabase,
          agentName: 'charlie',
          dispatchActivityId: row.id,
          dispatchMessage: dispatch.message,
          // Cap the tool-call loop. Without this, a confused model can hammer
          // tools indefinitely and blow past sensible run times. Mastra returns
          // whatever the agent has produced so far when the cap is hit.
          run: async () =>
            charlie.generate([{ role: 'user', content: dispatch.message }], { maxSteps: 20 }),
          onSuccess: async (result) => {
            // Listener owns persistence — save draft to content_items unconditionally
            // rather than relying on Charlie's tool calls, which are unreliable.
            const parsed = parseContentOutput(result.text);
            let contentItemId: string | null = null;

            if (existingContentItemId) {
              // Revision: update the existing draft
              const { data } = await supabase
                .from('content_items')
                .update({ body: parsed.body, updated_at: new Date().toISOString() })
                .eq('id', existingContentItemId)
                .select('id')
                .single();
              contentItemId = data?.id ?? existingContentItemId;
            } else {
              // First draft: insert a new content_items row
              const { data, error: insertError } = await supabase
                .from('content_items')
                .insert({
                  title: parsed.title,
                  body: parsed.body,
                  type: inferContentType(dispatch.message),
                  status: 'draft',
                  source: 'content_agent',
                })
                .select('id')
                .single();

              if (insertError) {
                console.error('[content-creator-listener] Failed to insert content_items:', insertError);
                throw new Error(`Failed to persist content_items: ${insertError.message}`);
              }
              contentItemId = data?.id ?? null;
            }

            if (!contentItemId) {
              throw new Error('Failed to persist content_items — insert returned no id');
            }

            console.log(`[content-creator-listener] Saved draft to content_items ${contentItemId}`);
            return {
              entityType: 'content_items',
              entityId: contentItemId,
              approvedActions: [{ response: result.text }],
              extra: { contentItemId },
            };
          },
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
