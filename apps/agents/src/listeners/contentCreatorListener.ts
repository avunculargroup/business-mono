import { createRealtimeClient } from '@platform/db';
import { runDispatch } from '../lib/dispatchRunner.js';
import { makeStepLogger } from '../lib/agentStepTelemetry.js';
import { charlie } from '../agents/contentCreator/index.js';
import { recordComplianceReview } from '../agents/compliance/index.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('content-creator-listener');
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

export function inferContentType(message: string): string {
  const lower = message.toLowerCase();
  for (const [keyword, type] of CONTENT_TYPE_KEYWORDS) {
    if (lower.includes(keyword)) return type;
  }
  return 'email';
}

export function parseContentOutput(text: string): { title: string | null; body: string } {
  const match = text.match(
    /<content_output>\s*<title>([\s\S]*?)<\/title>\s*<body>([\s\S]*?)<\/body>\s*<\/content_output>/
  );
  if (match) {
    return { title: match[1].trim() || null, body: match[2].trim() };
  }
  return { title: null, body: text };
}

export function startContentCreatorListener(): void {
  subscribeWithReconnect({
    client: supabase,
    channelName: 'content-creator-dispatches',
    logPrefix: '[content-creator-listener]',
    onSubscribed: () => {
      log.info('listening for Content Creator dispatches via Supabase Realtime');
    },
    attachHandlers: (channel) => channel.on(
      'postgres_changes' as never,
      { event: 'INSERT', schema: 'public', table: 'agent_activity' },
      async (payload: { new: ActivityRow }) => {
        const row = payload.new;
        const proposed = Array.isArray(row.proposed_actions)
          ? (row.proposed_actions as ProposedAction[])
          : [];

        const dispatch = proposed.find((a) => a.agent === 'charlie');
        if (!dispatch) return;

        log.info({ activityId: row.id }, 'dispatch received');

        const existingContentItemId = dispatch.context?.['content_item_id'] as string | undefined;

        await runDispatch({
          supabase,
          agentName: 'charlie',
          dispatchActivityId: row.id,
          dispatchMessage: dispatch.message,
          // Cap the tool-call loop. Without this, a confused model can hammer
          // tools indefinitely and blow past sensible run times. Mastra returns
          // whatever the agent has produced so far when the cap is hit.
          run: async () => {
            const stepLogger = makeStepLogger(`charlie/${row.id}`);
            try {
              return await charlie.generate(
                [{ role: 'user', content: dispatch.message }],
                {
                  maxSteps: 20,
                  onStepFinish: stepLogger.onStepFinish,
                },
              );
            } finally {
              stepLogger.summarise();
            }
          },
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
                log.error({ error: insertError }, 'failed to insert content_items');
                throw new Error(`Failed to persist content_items: ${insertError.message}`);
              }
              contentItemId = data?.id ?? null;
            }

            if (!contentItemId) {
              throw new Error('Failed to persist content_items — insert returned no id');
            }

            log.info({ contentItemId }, 'saved draft to content_items');

            // Compliance gate: beats flagged compliance-sensitive (e.g. on-chain
            // valuation framing) get a Lex review logged against the draft before
            // it reaches the human approval wall. Advisory — never auto-publishes.
            if (dispatch.context?.['compliance_sensitive']) {
              try {
                const verdict = await recordComplianceReview({
                  contentItemId,
                  title: parsed.title,
                  body: parsed.body,
                  parentActivityId: row.id,
                });
                log.info(
                  { contentItemId, verdict: verdict.passes ? 'passed' : 'flagged' },
                  'Lex compliance review',
                );
              } catch (err) {
                log.error({ err }, 'compliance review failed');
              }
            }

            return {
              entityType: 'content_items',
              entityId: contentItemId,
              approvedActions: [{ response: result.text }],
              extra: { contentItemId },
            };
          },
        });

        log.info({ activityId: row.id }, 'completed dispatch');
      }
    ),
  });
}
