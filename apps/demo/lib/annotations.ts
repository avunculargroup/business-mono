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
  | 'compliance-as-alignment'
  | 'no-comparison-without-basis'
  | 'source-class-as-a-gate';

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
 * The required annotations, all of them, now that the trace replay exists.
 *
 * [`demo-app-spec.md` § Required annotations](../../../docs/features/demo-app/demo-app-spec.md#required-annotations)
 * lists eight. Three of them land on the replay route: the spec names the
 * suspend point for `hub-and-spoke`, and the other two are here because the
 * trace is the only surface where the deterministic boundary and the resume
 * mechanism can be *watched* rather than described.
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
  {
    id: 'trace-boundary',
    targetSelector: 'trace-boundary',
    route: '/agents/run/[traceId]',
    title: 'The last moment the payload is ours',
    body: [
      'Everything up to this step was computed and written down. The agent below receives exactly',
      'this object and has no database tool and no retrieval tool in this workflow, so there is no',
      'path by which anything outside it could reach the draft.',
      'That is the difference between a constraint and an instruction: not "stick to the facts" in a',
      'prompt, but no route to anything else.',
      'Step back one and forward one across this line — the payload is the only thing that moves.',
    ].join(' '),
    principle: 'deterministic-before-llm',
    order: 1,
  },
  {
    id: 'trace-lex-verdict',
    targetSelector: 'trace-lex-verdict',
    route: '/agents/run/[traceId]',
    title: 'The verdict is a step, not a checkbox',
    body: [
      'Compliance review appears here as a first-class step with a classification and a stated',
      'reason, because that is what it is in the workflow — not a flag set at the end.',
      'The agent can clear or flag and never approves. On a flag it writes a suggested rewrite as a',
      'proposed action and the run continues to the gate with the flag attached, so a person decides',
      'what happens with the objection in front of them.',
    ].join(' '),
    principle: 'compliance-as-alignment',
    order: 2,
  },
  {
    id: 'trace-suspend',
    targetSelector: 'trace-suspend',
    route: '/agents/run/[traceId]',
    title: 'The machine stopped and waited',
    body: [
      'The workflow suspends here and holds its state. No agent messages a person: the decision is',
      'written to a database column by the web app and claimed by a listener, because the agent',
      'server is not reachable over HTTP from the browser.',
      'That constraint is why the boundary is real rather than conventional — there is no path from',
      'a specialist to a human that does not go through a stored, auditable decision.',
      'This pause is the one gap in the replay that is not compressed; it lasted four hours.',
    ].join(' '),
    principle: 'hub-and-spoke',
    order: 3,
  },
  {
    id: 'trace-resume',
    targetSelector: 'trace-resume',
    route: '/agents/run/[traceId]',
    title: 'Claimed once, then resumed',
    body: [
      'A Realtime listener claims the pending decision atomically before resuming the run, so two',
      'listeners racing the same row cannot both act on it.',
      'The approved action is carried forward and the rejected one is recorded as not taken rather',
      'than discarded — the audit trail says what was offered, not only what happened.',
    ].join(' '),
    principle: 'hub-and-spoke',
    order: 4,
  },

  // ── Corporate research ────────────────────────────────────────────────────
  // Each of these ties a visible element to the research record that produced
  // it. None of them describes what the element does — an evaluator can see
  // that.
  {
    id: 'no-headline-figure',
    targetSelector: 'no-headline-figure',
    route: '/research',
    title: 'No holdings number on this page',
    body:
      'Three research records produced three unrelated mechanisms by which a stated bitcoin figure overstates a corporate position: secondary sources wrong on the consideration by about half, exposure counted through a fund the company manages itself, and customer assets custodied alongside treasury. A figure that arrives without its basis and its source is worse than no figure, so the register carries none. Totals appear on a record page, where both can travel with them.',
    principle: 'no-comparison-without-basis',
    order: 20,
  },
  {
    id: 'holding-basis',
    targetSelector: 'holding-basis',
    route: '/research/[slug]',
    title: 'Why every row carries a basis',
    body:
      'The basis says what a quantity is a quantity of, and a lookup column decides whether it may enter an aggregate. Fund units and customer assets are excluded from the total and still rendered at full weight, because a reader who cannot see that the issuer stated a larger number is worse off than one who can. A fifth basis is assumed to exist, so it is a table rather than a list in code.',
    principle: 'no-comparison-without-basis',
    order: 21,
  },
  {
    id: 'source-conflict',
    targetSelector: 'source-conflict',
    route: '/research/[slug]',
    title: 'Marketing copy cannot populate a controls field',
    body:
      'This rule was written after getting it wrong. An earlier revision of the research recorded self-custody with no counterparty risk, on the strength of a company About page; the same company\u2019s offer document named a third-party custodian and listed custodian insolvency as a key risk. A database trigger now refuses a weaker source on a gated field at write time. The losing claim is kept and shown, because the conflict is the finding.',
    principle: 'source-class-as-a-gate',
    order: 22,
  },
  {
    id: 'withheld-panel',
    targetSelector: 'withheld-panel',
    route: '/research/[slug]',
    title: 'What is not here, and why',
    body:
      'The withheld list is rendered rather than silently omitted. A page that quietly dropped the unrealised position would look identical to one that had never computed it, and the claim this feature makes is that the omission is deliberate. Each entry names the reason, and a compliance agent classifies per field rather than per record.',
    principle: 'compliance-as-alignment',
    order: 23,
  },
  {
    id: 'archetype-pair',
    targetSelector: 'archetype-pair',
    route: '/research',
    title: 'Two archetype fields, not one',
    body:
      'What a company is and what it calls itself are stored separately, because the divergence is the case study rather than a labelling problem. Archetype also gates comparison: asking to compare a funds manager against an operating business returns an error from the data layer, and the interface renders an explanation instead of a table. A funds manager has no treasury policy to lift and no covenant story.',
    principle: 'no-comparison-without-basis',
    order: 24,
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

// ── Principles added by the corporate research surfaces ─────────────────────

PRINCIPLES.push(
  {
    key: 'no-comparison-without-basis',
    title: 'No basis, no comparison',
    body: [
      'Every holdings row records what its quantity is a quantity of — held directly, seen through a fund, or aggregated with assets custodied for someone else — and a lookup table decides which of those may enter a total. The rule lives in the data, not in a convention, so a third component rendering a position cannot quietly break it.',
      'Rows that cannot be aggregated are still rendered, at the same weight as the rows that can. Hiding them would leave a reader unable to see that the issuer had stated a larger number, which is the failure this is guarding against in the first place.',
      'The same rule gates comparison across companies. Archetype decides whether two records may appear in one table, and the repository throws rather than returning a flag a caller could ignore.',
    ],
  },
  {
    key: 'source-class-as-a-gate',
    title: 'Source class is a gate, not a label',
    body: [
      'Documents are ranked — regulated disclosure, exchange announcement, audited accounts, investor presentation, company website, secondary — and each field declares the weakest class it will accept. Custody, mandate, accounting treatment, covenants and every ledger row require an exchange announcement or better.',
      'A database trigger enforces it at write time. An attempt to record a purchase from a marketing page raises, rather than committing a row that a later review might catch.',
      'Where two documents disagree, the stronger wins and the weaker claim is stored as superseded rather than deleted. Deleting it would destroy the evidence that the gate did anything.',
    ],
  },
);
