/**
 * The annotation layer's content.
 *
 * The differentiating feature of the demo: a toggle between Product view (the
 * app as it really looks) and Architecture view (the same app with numbered
 * markers explaining what each surface demonstrates). Product view is the
 * default — show the real thing first and let the reader opt into the
 * explanation.
 *
 * Written to be skimmed. An evaluator reading all of these in ninety seconds
 * should come away able to describe the architecture to someone else, so each
 * body is two to four plain declarative sentences and says what the system
 * does, not what is impressive about it.
 */

export type PrincipleKey =
  | 'deterministic-before-llm'
  | 'publish-gate'
  | 'curator-notes'
  | 'quiet-day-path'
  | 'neutral-delta-colour'
  | 'hub-and-spoke'
  | 'compliance-as-alignment';

export interface Annotation {
  id: string;
  /** Matches a `data-annotation-id` attribute on the target element. */
  targetSelector: string;
  route: string;
  /** ≤ 60 characters. */
  title: string;
  /** Two to four sentences. */
  body: string;
  principle: PrincipleKey;
  order: number;
}

/**
 * The eight required annotations, minus the one that has no target yet.
 *
 * [`demo-app-spec.md` § Required annotations](../../../docs/features/demo-app/demo-app-spec.md#required-annotations)
 * lists eight, one of which targets the trace replay at `/agents/run/[id]`.
 * That route is Phase 8 and does not exist, so its annotation ships with it
 * rather than pointing at nothing here. All seven principles are still covered:
 * `deterministic-before-llm` carries two of the eight rows.
 */
export const ANNOTATIONS: Annotation[] = [
  {
    id: 'neutral-delta',
    targetSelector: 'indicator-delta',
    route: '/',
    title: 'Deltas carry no direction',
    body: [
      'Every change is a signed number and nothing else. There is no green for up, no red for down,',
      'and no arrow — the same treatment whichever way a series moved.',
      'This is a compliance constraint rather than a style preference: BTS operates as an Authorised',
      'Representative and must not imply a recommendation, and colouring a sign is that implication.',
      'The data layer enforces it structurally — the read model has no field a colour could be',
      'derived from, and a test fails if one is added.',
    ].join(' '),
    principle: 'neutral-delta-colour',
    order: 1,
  },
  {
    id: 'quiet-day',
    targetSelector: 'quiet-day-report',
    route: '/market-reports',
    title: 'The system is allowed to say nothing',
    body: [
      'Nothing cleared the materiality floor on this day, so the report has no narration at all.',
      'It is not an empty run: a finding was computed and scored, and it came in below the',
      'threshold. "We looked and found nothing worth telling you" is a different claim from "we did',
      'not look", and the stored finding is what distinguishes them.',
      'A system that produces an insight every morning is not observing anything.',
    ].join(' '),
    principle: 'quiet-day-path',
    order: 2,
  },
  {
    id: 'findings-boundary',
    targetSelector: 'findings-boundary',
    route: '/market-reports/[id]',
    title: 'Findings are computed before the model runs',
    body: [
      'Everything below this line was computed deterministically — the baseline, the percentile',
      'distance, the materiality score — and committed before any model was invoked.',
      'The narrating agent receives that payload and cannot reach past it: it has no database access',
      'and no tool that returns data, so a number in the prose that is not in the findings could not',
      'have come from anywhere.',
      'Each finding also carries whether a conclusion is permitted from it, and the narration says so',
      'in plain words when it is not.',
    ].join(' '),
    principle: 'deterministic-before-llm',
    order: 3,
  },
  {
    id: 'rubric-score',
    targetSelector: 'relevance-score',
    route: '/news',
    title: 'The score is arithmetic, not an impression',
    body: [
      'This number is a weighted composite of three separately scored dimensions — materiality,',
      'novelty, and whether the item cites a primary source — combined at fixed weights.',
      'It is not a model asked how relevant something is out of ten.',
      'The difference shows in the low scores: a scorer that only ever approves is not a scorer, and',
      'items that fail the rubric stay in the feed with their score visible rather than being',
      'quietly dropped.',
    ].join(' '),
    principle: 'deterministic-before-llm',
    order: 4,
  },
  {
    id: 'curator-note',
    targetSelector: 'curator-note',
    route: '/news/[id]',
    title: 'A human says why this was kept',
    body: [
      'The curator note is written by a person after the item was scored, and it records the thing',
      'the score could not encode — usually which part of a document matters to this business and',
      'why.',
      'This is what separates the feed from generic retrieval. A relevance score tells you an item',
      'resembles things you care about; the note tells you what to do with it.',
      'Notes are stored on the item and travel with it into the knowledge base.',
    ].join(' '),
    principle: 'curator-notes',
    order: 5,
  },
  {
    id: 'publish-gate',
    targetSelector: 'pipeline-status',
    route: '/content',
    title: 'Drafts and published items are different objects',
    body: [
      'Status here is not a label on one record — it governs what the rest of the platform may do',
      'with it. A draft is not embedded, so it cannot be retrieved as source material by the',
      'newsletter workflow or by any agent doing research.',
      'Embeddings are written on publish, by a listener watching the status column.',
      'Nothing reaches a public channel without a human approving it, and that gate never graduates',
      'to autonomous the way other write permissions do.',
    ].join(' '),
    principle: 'publish-gate',
    order: 6,
  },
  {
    id: 'lex-verdict',
    targetSelector: 'compliance-verdict',
    route: '/content',
    title: 'Compliance is a gate with a reason attached',
    body: [
      'This draft is held because a compliance agent read it and said what was wrong with it, and',
      'the reason is stored next to the verdict.',
      'The check runs when the draft is written rather than as a sign-off before sending, so a',
      'cleared verdict is a property the record has been carrying — and an edit resets it to pending',
      'rather than leaving the old verdict standing.',
      'The agent never approves anything on its own. It can only clear or flag; a person decides',
      'what happens next.',
    ].join(' '),
    principle: 'compliance-as-alignment',
    order: 7,
  },
];

export function annotationsForRoute(route: string): Annotation[] {
  return ANNOTATIONS.filter((annotation) => annotation.route === route).sort(
    (a, b) => a.order - b.order,
  );
}

/**
 * The written architecture notes, one per principle.
 *
 * Annotations link here. They are the longer answer for someone who read a
 * marker and wanted the reasoning rather than the claim.
 */
export const PRINCIPLES: {
  key: PrincipleKey;
  title: string;
  body: string[];
}[] = [
  {
    key: 'deterministic-before-llm',
    title: 'Deterministic before the model',
    body: [
      'Anything that can be computed is computed before a model is involved, committed to the database, and handed to the model as a closed payload. The daily market report is the clearest case: a findings engine scores every indicator against its trailing distribution, ranks the results by materiality, and writes them down. Only then does a narrating agent see anything, and what it sees is that payload.',
      'The agent has no database access and no tool that returns data. This is not a prompt instruction that it should stick to the facts — there is no path by which a number could enter the prose without being in the findings first. That is the difference between a constraint and a request.',
      'The same shape appears in the research feed, where a three-dimension rubric produces a composite score at fixed weights rather than asking a model for an overall impression. Arithmetic is auditable and reproducible; an impression is neither.',
    ],
  },
  {
    key: 'quiet-day-path',
    title: 'The quiet-day path',
    body: [
      'Most days nothing material happens, and the system is built to say so. When no finding clears the materiality floor the report is marked quiet, no narration is written, and the email goes out without an insight section.',
      'The findings that were computed and scored are still stored. That matters: it makes "we looked and found nothing" distinguishable from "we did not look", which is the difference between a system you can trust when it is silent and one you cannot.',
      'Building this path costs more than not building it, and it is the feature most likely to go unnoticed. A tool that generates an insight every morning is producing insights, which is a different and much easier job than observing a market.',
    ],
  },
  {
    key: 'neutral-delta-colour',
    title: 'Neutral delta colour',
    body: [
      'Indicator changes render as signed numbers with no colour, no arrow, and no direction language. A fall and a rise of the same size look the same.',
      'BTS operates as an Authorised Representative under an AFSL, and an AR must not imply a recommendation. Green-up and red-down is that implication — it tells a reader which way is good, which is a view about what they should want.',
      'The rule is held in the data layer rather than in a style guide. The read models carry a signed magnitude and nothing from which a sentiment could be derived, and a test asserts they have no direction, colour, or trend field. Turning a sign into a glyph is presentation, and it stays there.',
    ],
  },
  {
    key: 'curator-notes',
    title: 'Curator notes',
    body: [
      'Every research item can carry a note written by a person after the item was scored and read. The note records what the score could not: which clause matters, why this is worth a submission, what it changes about an existing view.',
      'This is the layer that separates a research feed from a retrieval system. Retrieval tells you an item resembles things you have cared about before. A note tells you what a person who knows the business concluded from it.',
      'Notes travel with the item when it is promoted into the knowledge base, so the reasoning survives past the moment it was written.',
    ],
  },
  {
    key: 'publish-gate',
    title: 'The publish gate',
    body: [
      'Content moves idea → draft → review → approved → scheduled → published, and the status governs what the rest of the platform may do with the record rather than just labelling it.',
      'A draft is not embedded. That means no agent can retrieve it as source material, and the newsletter workflow cannot cite it. Embeddings are written on publish by a listener watching the status column, so the retrieval corpus and the published record cannot drift apart.',
      'Every agent on this platform starts with maximum guardrails and graduates as it earns trust — one-at-a-time approval, then batch, then autonomous with notification. Emails and public content never graduate. That exception is deliberate and permanent.',
    ],
  },
  {
    key: 'compliance-as-alignment',
    title: 'Compliance as alignment, not as a checkpoint',
    body: [
      'A compliance agent classifies content when it is written and classifies detected ecosystem changes when they are detected — not as a sign-off immediately before something is sent.',
      'The consequence is that a cleared verdict is a property the record has been carrying, and the surfaces that act on it are reading state rather than requesting a review. Editing a draft resets the verdict to pending rather than leaving a stale clearance standing.',
      'The gates fail closed. An unclassified item is refused in the same way a flagged one is, with different wording, because a classifier that has not run is not the same as an objection that was not raised. The agent can clear or flag; it never approves. A person decides.',
    ],
  },
  {
    key: 'hub-and-spoke',
    title: 'Hub and spoke',
    body: [
      'One coordinating agent talks to the directors. Specialists — research, content, CRM, project management, compliance — never message a person directly. Work reaches a human either through the coordinator relaying it or through an approval surface.',
      'This is what makes the approval wall meaningful. If any agent could message a director, "human in the loop" would describe a convention. Because the path is narrow, it is a boundary: proposed actions are written to an audit table and wait there.',
      'Every agent writes to that table, including on runs that produce nothing. Absence of output is recorded rather than silent, which is what makes the log readable as a history rather than a highlights reel.',
    ],
  },
];
