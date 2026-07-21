import { createRealtimeClient } from '@platform/db';
import { answerLibraryQuestion } from '../workflows/libraryAnswer/index.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('library-question');

// Web path for "Ask the library". The /news/podcasts/search page can't reach the
// agents server over HTTP, so it INSERTs a library_questions row (status
// 'pending'); this listener claims it via Supabase Realtime and runs the RAG
// answer pass — the Q&A mirror of podcastActionListener.

const supabase = createRealtimeClient();

export interface LibraryQuestionRow {
  id: string;
  status: string | null;
}

/**
 * Claim and answer one pending question. The claim flips status pending →
 * answering conditionally, so a concurrent listener (or the reconnect sweep)
 * can't process the same question twice. Exported for unit testing.
 */
export async function handleLibraryQuestionRow(row: LibraryQuestionRow): Promise<void> {
  if (row.status !== 'pending') return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };

  // Atomic claim: only the handler that flips pending → answering proceeds.
  const { data: claimed } = await db
    .from('library_questions')
    .update({ status: 'answering' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id');
  if (!claimed || claimed.length === 0) return;

  log.info({ questionId: row.id }, 'answering');
  await answerLibraryQuestion(row.id);
}

/**
 * Sweep for questions left 'pending' while the subscription was down — Realtime
 * only delivers events that occur while SUBSCRIBED, so a question asked during a
 * reconnect gap would sit forever. handleLibraryQuestionRow's atomic claim keeps
 * this safe against a concurrently delivered event. Exported for unit testing.
 */
export async function reconcilePendingQuestions(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };
  const { data, error } = await db
    .from('library_questions')
    .select('id, status')
    .eq('status', 'pending');
  if (error || !data) return;
  for (const row of data as LibraryQuestionRow[]) {
    try {
      await handleLibraryQuestionRow(row);
    } catch (err) {
      log.error({ err, questionId: row.id }, 'error reconciling question');
    }
  }
}

/** Subscribe to library_questions and answer any newly-inserted pending row. */
export function startLibraryQuestionListener(): void {
  subscribeWithReconnect({
    client: supabase,
    channelName: 'library-question',
    logPrefix: '[library-question]',
    onSubscribed: () => {
      log.info('listening for library questions via Supabase Realtime');
      void reconcilePendingQuestions();
    },
    attachHandlers: (channel) =>
      channel.on(
        'postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'library_questions' },
        async (payload: { eventType: string; new: LibraryQuestionRow }) => {
          try {
            await handleLibraryQuestionRow(payload.new);
          } catch (err) {
            log.error({ err }, 'error handling library question');
          }
        },
      ),
  });
}
