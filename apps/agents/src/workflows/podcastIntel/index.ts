import { supabase } from '@platform/db';
import { roger } from '../../agents/recorder/agent.js';
import { lex, complianceVerdictSchema, type ComplianceVerdict } from '../../agents/compliance/index.js';
import { stepRequestContext } from '../../config/model.js';
import { createLogger } from '../../lib/logger.js';
import { summaryDraftSchema, type Takeaway } from './schemas.js';
import {
  buildSummaryPrompt,
  buildSummaryLexPrompt,
  buildTimestampedTranscript,
  prepareTranscript,
  snapToSegment,
  type SummaryEpisode,
  type TimedSegment,
} from './prompts.js';
import { scoreEpisodeRelevance } from '../podcastRubric.js';

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

interface Brief {
  summary: string;
  takeaways: Takeaway[];
}

/**
 * roger narrates a short descriptive brief (summary + key takeaways) from the
 * transcript. Each takeaway's model-proposed timestamp is snapped to a real
 * segment start so deep-links point at moments that exist. Returns an empty brief
 * on failure.
 */
async function narrateBrief(
  episode: SummaryEpisode,
  transcriptText: string,
  segmentStarts: number[],
): Promise<Brief> {
  const fallback = { summary: '', takeaways: [] as Takeaway[] };
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
  const draft = summaryDraftSchema.parse(response.object ?? fallback);
  return {
    summary: draft.summary.trim(),
    takeaways: draft.takeaways
      .map((t) => ({ text: t.text.trim(), start_seconds: snapToSegment(t.start_seconds, segmentStarts) }))
      .filter((t) => t.text.length > 0),
  };
}

/** Lex reviews the proposed brief (summary + takeaways) for advice risk. Never
 *  throws (fail-safe). */
async function reviewBrief(episode: SummaryEpisode, brief: Brief): Promise<ComplianceVerdict> {
  try {
    const response = await lex.generate(
      [{ role: 'user', content: buildSummaryLexPrompt(episode, brief.summary, brief.takeaways.map((t) => t.text)) }],
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
 * Episode intelligence pass (Phase 2: summary + takeaways). Deterministic load →
 * roger narrates a brief → Lex reviews → persist a `proposed` brief behind the
 * publish-wall. Takeaways ride the same summary_status gate as the summary.
 *
 * There is no suspend/resume gate: nothing runs after approval (approval is a
 * plain DB flip via decideEpisodeBrief), so the pass runs straight through and
 * leaves the brief as `proposed`. A human approves it separately from the
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

  // Prefer timestamped segments so takeaways can anchor to real moments; fall
  // back to the flat transcript when there are none (takeaways then have no
  // timestamps to snap to and render without a deep-link).
  const { data: segRows } = await db
    .from('transcript_segments')
    .select('start_seconds, speaker, content')
    .eq('episode_id', episodeId)
    .order('segment_index', { ascending: true });
  const segments = (segRows ?? []) as TimedSegment[];
  const segmentStarts = segments
    .map((s) => s.start_seconds)
    .filter((s): s is number => s != null);
  const transcriptText = prepareTranscript(
    segments.length > 0 ? buildTimestampedTranscript(segments) : ep.transcript_text,
  );

  const episode: SummaryEpisode = { title: ep.title, description: ep.description };
  const brief = await narrateBrief(episode, transcriptText, segmentStarts);
  if (!brief.summary) {
    log.error({ episodeId }, 'summary narration returned empty');
    return;
  }

  const verdict = await reviewBrief(episode, brief);

  // Relevance is director/ops metadata (a score + category), not client prose, so
  // it's scored from the brief and written immediately — no publish-wall, no Lex.
  // A scoring failure leaves relevance null without blocking the summary.
  const scored = await scoreEpisodeRelevance({
    title: ep.title,
    summary: brief.summary,
    takeaways: brief.takeaways.map((t) => t.text),
  });

  const now = new Date().toISOString();
  const { error: upErr } = await db
    .from('podcast_episodes')
    .update({
      episode_summary: brief.summary,
      key_takeaways: brief.takeaways,
      summary_status: 'proposed',
      summary_lex_verdict: verdict,
      summary_generated_at: now,
      relevance_score: scored?.relevanceScore ?? null,
      category: scored?.category ?? null,
      relevance_metadata: scored
        ? {
            dimension_scores: scored.dimensionScores,
            relevance_reasoning: scored.relevanceReasoning,
            flags: scored.flags,
            rubric_version: scored.rubricVersion,
          }
        : null,
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

  log.info(
    { episodeId, passes: verdict.passes, takeaways: brief.takeaways.length, relevance: scored?.relevanceScore ?? null },
    'episode brief proposed',
  );
}
