import { supabase } from '@platform/db';
import { roger } from '../../agents/recorder/agent.js';
import { lex, complianceVerdictSchema, type ComplianceVerdict } from '../../agents/compliance/index.js';
import { stepRequestContext } from '../../config/model.js';
import { createLogger } from '../../lib/logger.js';
import { summaryDraftSchema } from './schemas.js';
import {
  buildSummaryPrompt,
  buildSummaryLexPrompt,
  prepareTranscript,
  type SummaryEpisode,
} from './prompts.js';

const log = createLogger('podcast-intel');

// podcast_episodes and its summary columns aren't in the generated Database
// types until types are regenerated post-migration, so access goes through a
// boundary cast — the same pattern store.ts / reResolve.ts already use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Fail-safe: a compliance gate must never fail open. If Lex errors, the verdict
// is "route to a human", never a silent pass. Mirrors compliance/index.ts.
const FAILSAFE_VERDICT: ComplianceVerdict = {
  passes: false,
  flags: [],
  rationale: 'Compliance review could not be completed — routing to a human for manual review.',
  suggested_rewrite: null,
};

interface EpisodeRow {
  id: string;
  title: string;
  description: string | null;
  transcript_text: string | null;
  transcript_status: string;
}

/** roger narrates a short descriptive brief from the transcript. Returns '' on failure. */
async function narrateSummary(episode: SummaryEpisode, transcriptText: string): Promise<string> {
  const fallback = { summary: '' };
  const response = await roger.generate(
    [{ role: 'user', content: buildSummaryPrompt(episode, transcriptText) }],
    {
      requestContext: stepRequestContext('podcast_intel.narrate'),
      structuredOutput: {
        schema: summaryDraftSchema,
        errorStrategy: 'fallback',
        fallbackValue: fallback,
      },
    },
  );
  return summaryDraftSchema.parse(response.object ?? fallback).summary.trim();
}

/** Lex reviews the proposed summary for advice risk. Never throws (fail-safe). */
async function reviewSummary(episode: SummaryEpisode, summary: string): Promise<ComplianceVerdict> {
  try {
    const response = await lex.generate(
      [{ role: 'user', content: buildSummaryLexPrompt(episode, summary) }],
      {
        requestContext: stepRequestContext('podcast_intel.compliance_check'),
        structuredOutput: {
          schema: complianceVerdictSchema,
          errorStrategy: 'fallback',
          fallbackValue: FAILSAFE_VERDICT,
        },
      },
    );
    return complianceVerdictSchema.parse(response.object ?? FAILSAFE_VERDICT);
  } catch {
    return FAILSAFE_VERDICT;
  }
}

/**
 * Episode intelligence pass (Phase 1: summary). Deterministic load → roger
 * narrates → Lex reviews → persist a `proposed` summary behind the publish-wall.
 *
 * There is no suspend/resume gate: nothing runs after approval (approval is a
 * plain DB flip via decideEpisodeBrief), so the pass runs straight through and
 * leaves the summary as `proposed`. A human approves it separately from the
 * episode page. Triggered on demand by podcastActionListener when the web app
 * writes pending_action = 'summarize'.
 */
export async function runEpisodeIntel(episodeId: string): Promise<void> {
  const { data, error } = await db
    .from('podcast_episodes')
    .select('id, title, description, transcript_text, transcript_status')
    .eq('id', episodeId)
    .single();
  if (error || !data) {
    log.error({ episodeId, error: error?.message }, 'episode not found');
    return;
  }
  const ep = data as EpisodeRow;

  // Can only summarise an episode that has a stored transcript.
  if (ep.transcript_status !== 'available' || !ep.transcript_text?.trim()) {
    log.warn({ episodeId, status: ep.transcript_status }, 'no transcript to summarise');
    return;
  }

  const episode: SummaryEpisode = { title: ep.title, description: ep.description };
  const summary = await narrateSummary(episode, prepareTranscript(ep.transcript_text));
  if (!summary) {
    log.error({ episodeId }, 'summary narration returned empty');
    return;
  }

  const verdict = await reviewSummary(episode, summary);

  const now = new Date().toISOString();
  const { error: upErr } = await db
    .from('podcast_episodes')
    .update({
      episode_summary: summary,
      summary_status: 'proposed',
      summary_lex_verdict: verdict,
      summary_generated_at: now,
    })
    .eq('id', episodeId);
  if (upErr) {
    log.error({ episodeId, error: upErr.message }, 'failed to persist summary');
    return;
  }

  const flagSummary = verdict.flags.length
    ? ` Flagged: ${verdict.flags.map((f) => `"${f.quote}" — ${f.issue}`).join('; ')}`
    : '';
  const { error: actErr } = await db.from('agent_activity').insert([
    {
      agent_name: 'roger',
      action: 'episode_summarized',
      status: 'pending',
      trigger_type: 'manual',
      entity_type: 'podcast_episodes',
      entity_id: episodeId,
      proposed_actions: [{ type: 'episode_summary' }],
    },
    {
      agent_name: 'lex',
      action: verdict.passes ? 'Compliance review: passed' : 'Compliance review: flagged',
      status: verdict.passes ? 'auto' : 'pending',
      trigger_type: 'agent',
      entity_type: 'podcast_episodes',
      entity_id: episodeId,
      notes: `${verdict.rationale}${flagSummary}`,
      proposed_actions: verdict.suggested_rewrite
        ? [{ kind: 'suggested_rewrite', body: verdict.suggested_rewrite }]
        : [],
    },
  ]);
  if (actErr) {
    log.error({ episodeId, error: actErr.message }, 'failed to log episode summary activity');
  }

  log.info({ episodeId, passes: verdict.passes }, 'episode summary proposed');
}
