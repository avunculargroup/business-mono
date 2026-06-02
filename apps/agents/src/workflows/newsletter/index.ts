import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { supabase, contentVectorSearch, newsVectorSearch } from '@platform/db';
import { stepRequestContext } from '../../config/model.js';
import { rex } from '../../agents/researcher/index.js';
import { charlie } from '../../agents/contentCreator/index.js';
import { editor } from '../../agents/editorial/index.js';
import { embedText } from '../../lib/contentEmbeddings.js';
import {
  scoreAndRank,
  contentHitToRankable,
  newsHitToRankable,
  TIME_RANGE_DAYS,
  NEWSLETTER_QUERY_SEED,
} from './retrieval.js';
import { coerceToSchema } from './coerce.js';
import { assembleNewsletter, countWords, overLengthStoryIds, type CompanyVars } from './assembly.js';
import { buildGate1Message, buildGate2Message, buildNoStoriesMessage } from './messages.js';
import {
  newsletterInputSchema,
  retrievedItemSchema,
  storyShortlistSchema,
  storyCandidateSchema,
  researchNoteSchema,
  storyDraftSchema,
  introOutroSchema,
  editorialReviewSchema,
  reviewedStorySchema,
  newsletterStateSchema,
  newsletterCompletedSchema,
  newsletterOutputSchema,
  gate1ResumeSchema,
  gate2ResumeSchema,
  type StoryCandidate,
  type ResearchNote,
  type StoryDraft,
  type ReviewedStory,
  type EditorialReview,
  type NewsletterInput,
} from './schemas.js';

const DEFAULT_AUDIENCE =
  'Australian CFOs and finance executives evaluating bitcoin treasury strategy — sophisticated, sceptical, time-poor. They want signal, not noise.';

function audienceFor(input: NewsletterInput): string {
  return input.audienceContext?.trim() || DEFAULT_AUDIENCE;
}

async function fetchBrandTone(): Promise<string> {
  const { data } = await supabase
    .from('brand_assets')
    .select('content')
    .eq('type', 'tone_of_voice')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return (data?.content as string | undefined) ?? '';
}

async function fetchCompanyVars(): Promise<CompanyVars> {
  const { data } = await supabase
    .from('company_records')
    .select('type_key, value');
  const vars: CompanyVars = {};
  for (const row of (data ?? []) as Array<{ type_key: string; value: string | null }>) {
    if (row.value) vars[row.type_key] = row.value;
  }
  return vars;
}

// ── Step 1: Ingest & retrieve ────────────────────────────────────────────────
const retrieveStep = createStep({
  id: 'retrieve',
  inputSchema: newsletterInputSchema,
  outputSchema: z.object({
    input: newsletterInputSchema,
    pool: z.array(retrievedItemSchema),
  }),
  execute: async ({ inputData }) => {
    const input = inputData;
    const queryEmbedding = await embedText(NEWSLETTER_QUERY_SEED);
    const days = TIME_RANGE_DAYS[input.timeRange];

    // News is the primary source (most candidates); internal content
    // supplements it. A lower-than-default news threshold (0.5, matching
    // content) widens the ideation net — the pool is capped by count and the
    // human/Rex curate from there.
    const [newsHits, contentHits] = await Promise.all([
      newsVectorSearch(queryEmbedding, { count: input.storyCount * 4, days, threshold: 0.5 }),
      contentVectorSearch(queryEmbedding, { count: input.storyCount * 2, days }),
    ]);

    const pool = scoreAndRank(
      [...newsHits.map(newsHitToRankable), ...contentHits.map(contentHitToRankable)],
      input.timeRange,
    );
    return { input, pool };
  },
});

// ── Step 2: Story selection (Rex) ─────────────────────────────────────────────
const selectStoriesStep = createStep({
  id: 'select_stories',
  inputSchema: z.object({
    input: newsletterInputSchema,
    pool: z.array(retrievedItemSchema),
  }),
  outputSchema: z.object({
    input: newsletterInputSchema,
    pool: z.array(retrievedItemSchema),
    shortlist: storyShortlistSchema,
  }),
  execute: async ({ inputData }) => {
    const { input, pool } = inputData;
    const tone = await fetchBrandTone();

    const prompt = `You are selecting stories for the BTS newsletter.

Audience: ${audienceFor(input)}
Target story count: ${input.storyCount} (return ${input.storyCount + 2} candidates so the human has options)
Lookback window: past ${input.timeRange}

Brand voice summary:
${tone || '(none on file — apply plain, confident, no-hype BTS voice)'}

Retrieved content pool (most relevant first). This is news-led: items with source_table "news_items" are external Bitcoin news (the primary source, each with a url); "content_items" and "interactions" are BTS's own internal content and client conversations that can add an internal angle or supporting data.
${JSON.stringify(pool, null, 2)}

Your tasks:
1. Cluster related items into coherent story angles, leading with the news and layering internal context where it strengthens the story.
2. Score each candidate on relevance, timeliness, and completeness of available data.
3. Flag stories that are relevant but thin on supporting data (needs_research = true) and suggest research_queries.
4. Produce ${input.storyCount + 2} candidates and recommend the best ${input.storyCount}.

Use the item ids in source_ids (and the news urls when citing). Generate a unique story_id for each candidate.`;

    const fallback = {
      candidates: [] as StoryCandidate[],
      recommended: [] as string[],
      rex_editorial_note: 'Story selection failed — no candidates produced.',
    };

    const response = await rex.generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext('newsletter.story_selection'),
      structuredOutput: {
        schema: storyShortlistSchema,
        errorStrategy: 'fallback',
        fallbackValue: fallback,
      },
    });

    // Ensure every candidate has a story_id even if the model omitted one.
    const shortlist = coerceToSchema(storyShortlistSchema, response.object ?? fallback);
    shortlist.candidates = shortlist.candidates.map((c) => ({
      ...c,
      story_id: c.story_id || randomUUID(),
    }));
    return { input, pool, shortlist };
  },
});

// ── Step 3: Human gate 1 — story selection approval ───────────────────────────
const gate1Step = createStep({
  id: 'gate1',
  inputSchema: z.object({
    input: newsletterInputSchema,
    pool: z.array(retrievedItemSchema),
    shortlist: storyShortlistSchema,
  }),
  resumeSchema: gate1ResumeSchema,
  suspendSchema: z.object({ gate: z.literal('gate1'), message: z.string() }),
  outputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
  }),
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    const { input, pool, shortlist } = inputData;

    if (!resumeData) {
      // No candidates → nothing to approve. Don't suspend at the gate (an empty
      // approval prompt is useless); end the run with a diagnostic reason so the
      // director learns *why* it was empty instead of approving nothing.
      if (shortlist.candidates.length === 0) {
        const reason = buildNoStoriesMessage({ timeRange: input.timeRange, poolSize: pool.length });
        return bail({
          noStories: true as const,
          reason,
          timeRange: input.timeRange,
          candidatesFound: 0,
        });
      }

      const message = buildGate1Message({
        candidates: shortlist.candidates,
        recommendedIds: shortlist.recommended,
        timeRange: input.timeRange,
      });
      await suspend({ gate: 'gate1' as const, message });
      // Unreachable after suspend resolves the run; the resumed pass re-enters
      // execute with resumeData populated.
      return { input, approvedStories: [] };
    }

    const byId = new Map(shortlist.candidates.map((c) => [c.story_id, c]));
    let approvedStories: StoryCandidate[] = shortlist.recommended
      .map((id) => byId.get(id))
      .filter((c): c is StoryCandidate => Boolean(c));

    if (resumeData.decision === 'adjust' && resumeData.adjustment) {
      // Rex revises the shortlist applying the human's instruction — a single
      // agent invocation, not a full workflow re-run.
      const prompt = `The human reviewed your newsletter shortlist and asked for changes.

Original candidates:
${JSON.stringify(shortlist.candidates, null, 2)}

Currently recommended story_ids: ${JSON.stringify(shortlist.recommended)}

Human instruction: "${resumeData.adjustment}"

Apply the instruction and return the revised shortlist. Keep ${input.storyCount} recommended stories. Reuse existing story_ids where the story is unchanged.`;

      const response = await rex.generate([{ role: 'user', content: prompt }], {
        requestContext: stepRequestContext('newsletter.story_rerank'),
        structuredOutput: {
          schema: storyShortlistSchema,
          errorStrategy: 'fallback',
          fallbackValue: shortlist,
        },
      });
      const revised = coerceToSchema(storyShortlistSchema, response.object ?? shortlist);
      const revisedById = new Map(revised.candidates.map((c) => [c.story_id, c]));
      approvedStories = revised.recommended
        .map((id) => revisedById.get(id))
        .filter((c): c is StoryCandidate => Boolean(c));
    }

    return { input, approvedStories };
  },
});

// ── Step 4: Research & enrich (Rex) ──────────────────────────────────────────
const researchStep = createStep({
  id: 'research_enrich',
  inputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
  }),
  outputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
    researchNotes: z.array(researchNoteSchema),
  }),
  execute: async ({ inputData }) => {
    const { input, approvedStories } = inputData;
    const needsResearch = approvedStories.filter(
      (s) => s.needs_research && s.data_completeness < 8,
    );

    const researchNotes: ResearchNote[] = [];
    for (const story of needsResearch) {
      const prompt = `Research to strengthen this newsletter story. Internal data is thin; find up to 3 high-quality external sources that add evidence. Lead with what BTS already knows — external research is supporting evidence only.

Story: ${story.working_title}
Angle: ${story.angle}
Key points: ${JSON.stringify(story.key_points)}
Suggested queries: ${JSON.stringify(story.research_queries ?? [])}

Return a structured research note for story_id ${story.story_id}.`;

      const fallback: ResearchNote = {
        story_id: story.story_id,
        sources: [],
        research_summary: '',
        confidence: 'low',
      };
      const response = await rex.generate([{ role: 'user', content: prompt }], {
        requestContext: stepRequestContext('newsletter.research_enrich'),
        structuredOutput: {
          schema: researchNoteSchema,
          errorStrategy: 'fallback',
          fallbackValue: fallback,
        },
      });
      researchNotes.push(coerceToSchema(researchNoteSchema, response.object ?? fallback));
    }

    return { input, approvedStories, researchNotes };
  },
});

// ── Step 5: Draft generation (Charlie, parallel) ─────────────────────────────
const NO_TOOL_INSTRUCTION =
  'Return ONLY the structured object. Do not call any tool (no persist_content_draft, no supabase tools). This is a workflow draft — persistence happens later.';

async function draftStory(
  story: StoryCandidate,
  note: ResearchNote | undefined,
  input: NewsletterInput,
): Promise<StoryDraft> {
  const prompt = `Draft one newsletter story in BTS brand voice.

Audience: ${audienceFor(input)}
Target length: ${input.targetWordCount} words (stay within 20%).

Story angle: ${story.angle}
Working title: ${story.working_title}
Key points to cover: ${JSON.stringify(story.key_points)}
Rex's rationale: ${story.rex_rationale}
${note && note.research_summary ? `External research (supporting evidence only):\n${note.research_summary}\nSources: ${JSON.stringify(note.sources)}` : 'No external research — lead with the internal BTS perspective.'}

Hard constraints: "Bitcoin" (capital B) = network/protocol; "bitcoin" (lowercase b) = the currency. No exclamation marks. No crypto-native slang. Plain, confident advisor tone. Lead with insight, not background.

${NO_TOOL_INSTRUCTION}`;

  const fallback: StoryDraft = {
    story_id: story.story_id,
    working_title: story.working_title,
    draft_title: story.working_title,
    body: '',
    word_count: 0,
    key_message: '',
    sources_used: story.source_ids,
    charlie_note: 'Draft generation failed.',
  };

  const response = await charlie.generate([{ role: 'user', content: prompt }], {
    requestContext: stepRequestContext('newsletter.draft_generation'),
    structuredOutput: {
      schema: storyDraftSchema,
      errorStrategy: 'fallback',
      fallbackValue: fallback,
    },
  });
  const draft = coerceToSchema(storyDraftSchema, response.object ?? fallback);
  return { ...draft, story_id: story.story_id, word_count: countWords(draft.body) };
}

const draftStep = createStep({
  id: 'draft_generation',
  inputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
    researchNotes: z.array(researchNoteSchema),
  }),
  outputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
    researchNotes: z.array(researchNoteSchema),
    drafts: z.array(storyDraftSchema),
    introOutro: introOutroSchema,
  }),
  execute: async ({ inputData }) => {
    const { input, approvedStories, researchNotes } = inputData;
    const notesById = new Map(researchNotes.map((n) => [n.story_id, n]));

    // Stories drafted in parallel; intro/outro generated alongside.
    const [drafts, introOutro] = await Promise.all([
      Promise.all(approvedStories.map((s) => draftStory(s, notesById.get(s.story_id), input))),
      (async () => {
        const prompt = `Write a brief newsletter intro and outro in BTS brand voice.

Audience: ${audienceFor(input)}
This issue's stories: ${JSON.stringify(approvedStories.map((s) => s.working_title))}

intro: 60–80 words, sets the editorial tone for the issue ("From the team").
outro: a brief sign-off.

No exclamation marks. Plain, confident tone. ${NO_TOOL_INSTRUCTION}`;
        const response = await charlie.generate([{ role: 'user', content: prompt }], {
          requestContext: stepRequestContext('newsletter.draft_generation'),
          structuredOutput: {
            schema: introOutroSchema,
            errorStrategy: 'fallback',
            fallbackValue: { intro: '', outro: '' },
          },
        });
        return coerceToSchema(introOutroSchema, response.object ?? { intro: '', outro: '' });
      })(),
    ]);

    return { input, approvedStories, researchNotes, drafts, introOutro };
  },
});

// ── Step 6: Editorial review (Editor, parallel) ──────────────────────────────
async function reviewDraft(draft: StoryDraft, input: NewsletterInput): Promise<ReviewedStory> {
  const prompt = `Review this newsletter story draft against BTS brand voice and audience fit.

Target word count: ${input.targetWordCount} (current: ${draft.word_count}).
Audience: ${audienceFor(input)}

Draft title: ${draft.draft_title}
Draft body:
${draft.body}

Charlie's note: ${draft.charlie_note}

Score every rubric dimension, decide passes_gate (voice_match >= 7 AND audience_fit >= 7), give a specific critique, and — only if it fails — supply a revised_draft that fixes the problems.`;

  const fallback: EditorialReview = {
    story_id: draft.story_id,
    scores: {
      voice_match: 7,
      audience_fit: 7,
      bitcoin_accuracy: 7,
      clarity: 7,
      evidence_quality: 7,
      length_discipline: 7,
    },
    overall_score: 7,
    passes_gate: true,
    critique: 'Editorial review unavailable — passing through Charlie\'s draft unchanged.',
    editor_note: 'Review failed; draft used as-is.',
  };

  const response = await editor.generate([{ role: 'user', content: prompt }], {
    requestContext: stepRequestContext('newsletter.editorial_review'),
    structuredOutput: {
      schema: editorialReviewSchema,
      errorStrategy: 'fallback',
      fallbackValue: fallback,
    },
  });
  const review = coerceToSchema(editorialReviewSchema, response.object ?? fallback);

  // Use the editor's revision when the draft failed the gate and a revision
  // was supplied; otherwise keep Charlie's draft.
  const finalBody = !review.passes_gate && review.revised_draft ? review.revised_draft : draft.body;
  return {
    story_id: draft.story_id,
    title: draft.draft_title,
    body: finalBody,
    word_count: countWords(finalBody),
    review,
  };
}

const reviewStep = createStep({
  id: 'editorial_review',
  inputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
    researchNotes: z.array(researchNoteSchema),
    drafts: z.array(storyDraftSchema),
    introOutro: introOutroSchema,
  }),
  outputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
    researchNotes: z.array(researchNoteSchema),
    reviewed: z.array(reviewedStorySchema),
    introOutro: introOutroSchema,
  }),
  execute: async ({ inputData }) => {
    const { input, approvedStories, researchNotes, drafts, introOutro } = inputData;
    const reviewed = await Promise.all(drafts.map((d) => reviewDraft(d, input)));
    return { input, approvedStories, researchNotes, reviewed, introOutro };
  },
});

// ── Step 7: Assembly ──────────────────────────────────────────────────────────
function newsletterTitle(date: Date): string {
  const month = date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  return `BTS Newsletter — ${month}`;
}

const assembleStep = createStep({
  id: 'assemble',
  inputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
    researchNotes: z.array(researchNoteSchema),
    reviewed: z.array(reviewedStorySchema),
    introOutro: introOutroSchema,
  }),
  outputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
    researchNotes: z.array(researchNoteSchema),
    reviewed: z.array(reviewedStorySchema),
    introOutro: introOutroSchema,
    title: z.string(),
    markdown: z.string(),
    totalWordCount: z.number(),
    overLengthIds: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { input, reviewed, introOutro } = inputData;
    const company = await fetchCompanyVars();
    const now = new Date();
    const title = newsletterTitle(now);
    const markdown = assembleNewsletter({
      title,
      date: now,
      intro: introOutro.intro,
      outro: introOutro.outro,
      stories: reviewed,
      company,
    });
    const totalWordCount = reviewed.reduce((sum, s) => sum + s.word_count, 0);
    const overLengthIds = overLengthStoryIds(reviewed, input.targetWordCount);
    return { ...inputData, title, markdown, totalWordCount, overLengthIds };
  },
});

// ── Step 8: Human gate 2 — final draft approval ──────────────────────────────
const gate2Step = createStep({
  id: 'gate2',
  inputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
    researchNotes: z.array(researchNoteSchema),
    reviewed: z.array(reviewedStorySchema),
    introOutro: introOutroSchema,
    title: z.string(),
    markdown: z.string(),
    totalWordCount: z.number(),
    overLengthIds: z.array(z.string()),
  }),
  resumeSchema: gate2ResumeSchema,
  stateSchema: newsletterStateSchema,
  suspendSchema: z.object({
    gate: z.literal('gate2'),
    message: z.string(),
    newsletterMarkdown: z.string(),
    held: z.boolean().optional(),
  }),
  outputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
    reviewed: z.array(reviewedStorySchema),
    title: z.string(),
    markdown: z.string(),
    totalWordCount: z.number(),
  }),
  execute: async ({ inputData, resumeData, suspend, state, setState }) => {
    const { input, approvedStories, researchNotes, introOutro, title } = inputData;

    // A resumed step re-runs from the top, so prior revisions live in workflow
    // state, not local vars. Fall back to the freshly assembled inputData on the
    // first pass (no state yet).
    const working = state?.working;
    let reviewed = working?.reviewed ?? inputData.reviewed;
    let markdown = working?.markdown ?? inputData.markdown;
    let totalWordCount = working?.totalWordCount ?? inputData.totalWordCount;
    let overLengthIds = working?.overLengthIds ?? inputData.overLengthIds;

    const current = () => ({ input, approvedStories, reviewed, title, markdown, totalWordCount });

    const buildAndSuspend = async (held?: boolean): Promise<void> => {
      const message = buildGate2Message({
        stories: reviewed,
        totalWordCount,
        timeRange: input.timeRange,
        overLengthIds,
        held,
      });
      await suspend({ gate: 'gate2' as const, message, newsletterMarkdown: markdown, held });
    };

    if (!resumeData) {
      await buildAndSuspend();
      return current();
    }

    if (resumeData.decision === 'hold') {
      await buildAndSuspend(true);
      return current();
    }

    if (resumeData.decision === 'revise' && resumeData.storyNumber && resumeData.instruction) {
      const idx = resumeData.storyNumber - 1;
      const target = reviewed[idx];
      if (target) {
        const story = approvedStories.find((s) => s.story_id === target.story_id);
        const note = researchNotes.find((n) => n.story_id === target.story_id);
        if (story) {
          // Re-draft just this story with the human's instruction, then re-review.
          const revisedDraft = await draftStory(
            { ...story, key_points: [...story.key_points, `Human revision: ${resumeData.instruction}`] },
            note,
            input,
          );
          const reReviewed = await reviewDraft(revisedDraft, input);
          reviewed = reviewed.map((s, i) => (i === idx ? reReviewed : s));

          const company = await fetchCompanyVars();
          markdown = assembleNewsletter({
            title,
            date: new Date(),
            intro: introOutro.intro,
            outro: introOutro.outro,
            stories: reviewed,
            company,
          });
          totalWordCount = reviewed.reduce((sum, s) => sum + s.word_count, 0);
          overLengthIds = overLengthStoryIds(reviewed, input.targetWordCount);

          // Persist the revision so a later "publish" resume sees it.
          await setState({ working: { reviewed, markdown, totalWordCount, overLengthIds } });
        }
      }
      await buildAndSuspend();
      return current();
    }

    // decision === 'publish' → fall through to persist with the latest draft.
    return current();
  },
});

// ── Step 9: Persist & notify ──────────────────────────────────────────────────
const persistStep = createStep({
  id: 'persist',
  inputSchema: z.object({
    input: newsletterInputSchema,
    approvedStories: z.array(storyCandidateSchema),
    reviewed: z.array(reviewedStorySchema),
    title: z.string(),
    markdown: z.string(),
    totalWordCount: z.number(),
  }),
  outputSchema: newsletterCompletedSchema,
  execute: async ({ inputData, runId }) => {
    const { input, approvedStories, reviewed, title, markdown, totalWordCount } = inputData;

    const { data: inserted, error } = await supabase
      .from('content_items')
      .insert({
        title,
        body: markdown,
        type: 'newsletter',
        status: 'approved',
        topic_tags: ['newsletter', input.timeRange],
        source: 'content_agent',
        assigned_to: input.requestedBy ?? null,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Failed to insert newsletter content_item: ${error.message}`);
    const contentItemId = (inserted as { id: string }).id;

    const editorialScores: Record<string, number> = {};
    for (const s of reviewed) editorialScores[s.story_id] = s.review.overall_score;

    await supabase.from('agent_activity').insert({
      agent_name: 'charlie',
      action: 'newsletter_generated',
      status: 'approved',
      trigger_type: input.triggerSource === 'schedule' ? 'scheduled' : 'signal_message',
      workflow_run_id: runId ?? null,
      entity_type: 'content_item',
      entity_id: contentItemId,
      proposed_actions: [
        { type: 'newsletter', story_ids: approvedStories.map((s) => s.story_id) },
      ],
      approved_actions: [{ content_item_id: contentItemId }],
      approved_by: input.requestedBy ?? null,
      approved_at: new Date().toISOString(),
    } as never);

    return { contentItemId, title, storyCount: reviewed.length, totalWordCount, editorialScores };
  },
});

export const newsletterWorkflow = createWorkflow({
  id: 'newsletter',
  inputSchema: newsletterInputSchema,
  stateSchema: newsletterStateSchema,
  // A run either persists a newsletter or bails with a no-stories diagnostic.
  outputSchema: newsletterOutputSchema,
})
  .then(retrieveStep)
  .then(selectStoriesStep)
  .then(gate1Step)
  .then(researchStep)
  .then(draftStep)
  .then(reviewStep)
  .then(assembleStep)
  .then(gate2Step)
  .then(persistStep)
  .commit();
