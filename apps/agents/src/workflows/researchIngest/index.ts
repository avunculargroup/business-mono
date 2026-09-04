/**
 * `researchIngest` — the corporate research ingest pipeline.
 *
 * A Workflow rather than an Agent, because the pipeline is a defined process
 * with a fixed shape. Agents appear only inside the three steps where the task
 * is genuinely open-ended: reading events out of a filing, judging what is
 * novel, and classifying what may be published. Everything else is arithmetic
 * and is written as arithmetic.
 *
 * The ordering rule that matters most: **deterministic before LLM.** Facts and
 * structured rows commit before anything narrates them, so a model being slow,
 * down, or wrong costs a narration rather than a ledger. `validateNumerics` in
 * particular sits between the extractor and the database and is not a second
 * model call — a validator that can hallucinate is not a validator.
 *
 * The suspend gate sits at **publication**, not ingest. Ingest runs unattended;
 * nothing reaches a client-facing surface without a director approving it.
 *
 * Spec: docs/features/corporate-holdings/corporate-research-spec.md § Agent pipeline
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { MATERIALITY_FLOOR } from '@platform/shared';
import { stepRequestContext } from '../../config/model.js';
import { rex } from '../../agents/researcher/index.js';
import { lex } from '../../agents/compliance/index.js';
import { chunkText, embedTexts } from '../../lib/contentEmbeddings.js';
import { createLogger } from '../../lib/logger.js';
import { fetchAll, resolveDocuments, type DocumentRow } from './documents.js';
import { claimsForEvent, validateClaims } from './numerics.js';
import { isQuietRun, materialDeltas, reconcile, type CommittedEvent } from './reconcile.js';
import {
  classificationsSchema,
  extractionSchema,
  fetchSummarySchema,
  readableDocumentSchema,
  rejectedClaimSchema,
  researchIngestInputSchema,
  researchIngestOutputSchema,
  scoringSchema,
  candidateEventSchema,
  deltaSchema,
  findingSchema,
  classificationSchema,
  type CandidateEvent,
} from './schemas.js';

// The shape flowing between steps, named once. Mastra normalises a step's
// declared schema, so `someStep.outputSchema` is no longer a zod object that
// the next step can extend — the stages have to be spelled out here.
const resolvedSchema = researchIngestInputSchema.extend({ refs: z.array(z.any()) });
const fetchedSchema = researchIngestInputSchema.extend({ fetch: fetchSummarySchema });
const embeddedSchema = fetchedSchema.extend({ chunkCount: z.number() });
const extractedSchema = fetchedSchema.extend({ candidates: z.array(candidateEventSchema) });
const validatedSchema = fetchedSchema.extend({
  validated: z.array(candidateEventSchema),
  rejected: z.array(rejectedClaimSchema),
});
const reconciledSchema = validatedSchema.extend({
  created: z.array(candidateEventSchema),
  deltas: z.array(deltaSchema),
  quiet: z.boolean(),
});
const scoredSchema = reconciledSchema.extend({ findings: z.array(findingSchema) });
const classifiedSchema = scoredSchema.extend({
  classifications: z.array(classificationSchema),
});
const persistedSchema = classifiedSchema.extend({ committed: z.any() });

type Delta = z.infer<typeof deltaSchema>;

const log = createLogger('research-ingest');

/** How much of a document a prompt carries. Whole filings run to 200 pages. */
const MAX_DOCUMENT_CHARS = 60_000;

const db = supabase as unknown as {
  from: (table: string) => any;   // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

// ── 1. Resolve ───────────────────────────────────────────────────────────────
// Announcement registration → fetchable URL. No LLM, and no discovery: the
// documents are registered by the curation pass, and this turns a registration
// into an address.
const resolveDocumentsStep = createStep({
  id: 'resolve_documents',
  inputSchema: researchIngestInputSchema,
  outputSchema: resolvedSchema,
  execute: async ({ inputData }) => {
    const { data, error } = await db
      .from('research_documents')
      .select('id, venue, announcement_id, pdf_url, title, content_sha256, source_class')
      .eq('company_id', inputData.companyId);

    if (error) throw error;

    const rows = (data ?? []) as Array<DocumentRow & { source_class: string }>;
    const refs = resolveDocuments(rows).map((ref, index) => ({
      ...ref,
      sourceClass: rows[index].source_class,
    }));

    log.info({ companyId: inputData.companyId, documents: refs.length }, 'documents resolved');
    return { ...inputData, refs };
  },
});

// ── 2. Fetch ─────────────────────────────────────────────────────────────────
const fetchDocumentsStep = createStep({
  id: 'fetch_documents',
  inputSchema: resolvedSchema,
  outputSchema: fetchedSchema,
  execute: async ({ inputData }) => {
    const refs = inputData.refs as Array<{ id: string; title: string; sourceClass: string }>;
    const outcomes = await fetchAll(inputData.refs as never);

    const documents: Array<z.infer<typeof readableDocumentSchema>> = [];
    let fetched = 0;
    let unchanged = 0;
    let failed = 0;

    for (const [index, outcome] of outcomes.entries()) {
      const ref = refs[index];

      if (outcome.kind === 'fetched') {
        fetched += 1;
        await db
          .from('research_documents')
          .update({
            content_sha256: outcome.sha256,
            full_text: outcome.text,
            page_count: outcome.pageCount,
            retrieved_at: new Date().toISOString(),
            retrieval_error: null,
          })
          .eq('id', outcome.documentId);
        documents.push({
          id: outcome.documentId,
          title: ref.title,
          text: outcome.text,
          sourceClass: ref.sourceClass,
        });
        continue;
      }

      if (outcome.kind === 'unchanged') {
        unchanged += 1;
        // Nothing re-downloaded and nothing re-extracted, but the stored text
        // still has to reach the extractor — otherwise a second run over an
        // unchanged corpus would extract nothing and reconcile everything as
        // deleted.
        const { data } = await db
          .from('research_documents')
          .select('full_text')
          .eq('id', outcome.documentId)
          .maybeSingle();
        const text = (data as { full_text: string | null } | null)?.full_text;
        if (text) {
          documents.push({ id: outcome.documentId, title: ref.title, text, sourceClass: ref.sourceClass });
        }
        continue;
      }

      failed += 1;
      // Recorded, not discarded. A document that 404s repeatedly is a signal,
      // and a silent skip is how it stays invisible.
      await db
        .from('research_documents')
        .update({ retrieved_at: new Date().toISOString(), retrieval_error: outcome.error })
        .eq('id', outcome.documentId);
      log.warn({ documentId: outcome.documentId, error: outcome.error }, 'document unavailable');
    }

    return {
      companyId: inputData.companyId,
      promoteToPublished: inputData.promoteToPublished,
      requestedBy: inputData.requestedBy,
      fetch: { fetched, unchanged, failed, documents },
    };
  },
});

// ── 3. Chunk and embed ───────────────────────────────────────────────────────
// Whole documents, never section-keyed. One issuer disclosed its accounting
// election under a heading about accounting treatment inside the risk factors,
// and four rounds of searching the financial statements missed it. Retrieval is
// by field semantics, which only works if the whole document is in the index.
const chunkAndEmbedStep = createStep({
  id: 'chunk_and_embed',
  inputSchema: fetchedSchema,
  outputSchema: embeddedSchema,
  execute: async ({ inputData }) => {
    let chunkCount = 0;

    for (const document of inputData.fetch.documents) {
      const chunks = chunkText(document.text);
      if (chunks.length === 0) continue;

      const embeddings = await embedTexts(chunks);
      await db.from('document_chunks').upsert(
        chunks.map((content, index) => ({
          document_id: document.id,
          chunk_index: index,
          content,
          embedding: embeddings[index],
        })),
        { onConflict: 'document_id,chunk_index' },
      );
      chunkCount += chunks.length;
    }

    return { ...inputData, chunkCount };
  },
});

// ── 4. Extract (Rex) ─────────────────────────────────────────────────────────
const extractEventsStep = createStep({
  id: 'extract_events',
  inputSchema: embeddedSchema,
  outputSchema: extractedSchema,
  execute: async ({ inputData }) => {
    const candidates: CandidateEvent[] = [];

    for (const document of inputData.fetch.documents) {
      const prompt = `Extract treasury events from this filing.

Document id: ${document.id}
Title: ${document.title}
Source class: ${document.sourceClass}

Rules:
- Quote figures EXACTLY as the document states them. Do not round, convert, or
  compute an average. Every figure is re-checked against this text afterwards
  and a figure that does not appear here is discarded.
- Consideration goes in the currency the document states, in native units.
  Never convert.
- If the document says a consideration is inclusive of fees, set fees_included.
- Give each event a natural_key that will be identical if this same document is
  read again: "<company-slug-fragment>:<event-type-fragment>:<event-date>".
- Only extract what this document states. Do not carry anything over from
  general knowledge about the company.
- If the document states no treasury event at all, return an empty list and say
  what you looked for in notes. Saying nothing is a valid answer.

Document text:
${document.text.slice(0, MAX_DOCUMENT_CHARS)}`;

      const response = await rex.generate([{ role: 'user', content: prompt }], {
        requestContext: stepRequestContext('researchIngest.extract_events'),
        structuredOutput: {
          schema: extractionSchema,
          errorStrategy: 'fallback',
          fallbackValue: { events: [], notes: 'Extraction failed.' },
        },
      });

      // safeParse, not parse: `structuredOutput.fallbackValue` covers a model
      // that fails to produce an object at all, and covers nothing when it
      // produces the wrong one. A malformed extraction is an empty extraction,
      // never a dead run.
      const parsed = extractionSchema.safeParse(response.object);
      if (!parsed.success) {
        log.warn({ documentId: document.id }, 'extraction did not match the schema; skipping document');
        continue;
      }

      for (const event of parsed.data.events) {
        // The extractor names its own source, but it is overwritten with the
        // document actually being read: a model that attributes an event to a
        // different filing has produced provenance nobody can check.
        candidates.push({ ...event, source_document_id: document.id } as CandidateEvent);
      }
    }

    log.info({ companyId: inputData.companyId, candidates: candidates.length }, 'events extracted');
    return {
      companyId: inputData.companyId,
      promoteToPublished: inputData.promoteToPublished,
      requestedBy: inputData.requestedBy,
      fetch: inputData.fetch,
      candidates,
    };
  },
});

// ── 5. Validate ──────────────────────────────────────────────────────────────
// Deterministic, and the step that makes the rest of the pipeline trustworthy.
// Rejects do not commit.
const validateNumericsStep = createStep({
  id: 'validate_numerics',
  inputSchema: extractedSchema,
  outputSchema: validatedSchema,
  execute: async ({ inputData }) => {
    const textById = new Map(inputData.fetch.documents.map((d) => [d.id, d.text]));
    const validated: CandidateEvent[] = [];
    const rejected: Array<z.infer<typeof rejectedClaimSchema>> = [];

    for (const candidate of inputData.candidates) {
      const sourceText = textById.get(candidate.source_document_id) ?? '';
      const verdict = validateClaims(claimsForEvent(candidate), sourceText);

      if (verdict.ok) {
        validated.push(candidate);
        continue;
      }

      // The whole event is held back, not just the offending field. An event
      // committed with one figure silently dropped is worse than no event: the
      // page would render a purchase with no consideration and no sign that
      // anything was missing.
      for (const claim of verdict.rejected) {
        rejected.push({ natural_key: candidate.natural_key, ...claim });
      }
      log.warn(
        { naturalKey: candidate.natural_key, fields: verdict.rejected.map((r) => r.field) },
        'candidate rejected: figures not present in source',
      );
    }

    return {
      companyId: inputData.companyId,
      promoteToPublished: inputData.promoteToPublished,
      requestedBy: inputData.requestedBy,
      fetch: inputData.fetch,
      validated,
      rejected,
    };
  },
});

// ── 6. Reconcile ─────────────────────────────────────────────────────────────
const reconcileStep = createStep({
  id: 'reconcile',
  inputSchema: validatedSchema,
  outputSchema: reconciledSchema,
  execute: async ({ inputData }) => {
    const { data } = await db
      .from('treasury_events')
      .select('natural_key, quantity, consideration_native')
      .eq('company_id', inputData.companyId);

    const committed = ((data ?? []) as CommittedEvent[]).map((row) => ({
      natural_key: row.natural_key,
      quantity: row.quantity === null ? null : Number(row.quantity),
      consideration_native:
        row.consideration_native === null ? null : Number(row.consideration_native),
    }));

    const result = reconcile(inputData.validated as never, committed);

    return {
      ...inputData,
      created: result.created as unknown as CandidateEvent[],
      deltas: result.deltas as Delta[],
      quiet: isQuietRun(result),
    };
  },
});

// ── 7. Score (Rex) ───────────────────────────────────────────────────────────
// Runs on pre-computed rows. Bruno's rule, applied here: the narrator narrates
// what arithmetic already decided, and it is handed the material deltas only.
const scoreStep = createStep({
  id: 'score',
  inputSchema: reconciledSchema,
  outputSchema: scoredSchema,
  execute: async ({ inputData }) => {
    const material = materialDeltas({
      created: [],
      restated: [],
      unchanged: [],
      deltas: inputData.deltas,
    });

    // The quiet-day path. Nothing new and nothing material means nothing to
    // score, and calling the model anyway would produce a finding about
    // nothing — which is exactly how a feed teaches its reader to ignore it.
    if (inputData.created.length === 0 && material.length === 0) {
      log.info({ companyId: inputData.companyId }, 'quiet run: nothing material to score');
      return { ...inputData, findings: [] };
    }

    const prompt = `Score what changed in this company's register for novelty.

New events:
${JSON.stringify(inputData.created, null, 2)}

Material restatements (deltas below the ${(MATERIALITY_FLOOR * 100).toFixed(1)}% floor are already excluded):
${JSON.stringify(material, null, 2)}

Rules:
- One finding per thing that actually changed. Do not produce a finding for an
  event that merely restates what was already recorded.
- Materiality is 0 to 1 and is about how much this matters to an Australian CFO
  evaluating a treasury allocation, not about the size of the number.
- A covenant change or a capital posture change is high materiality even when
  no quantity moved: a lender rewriting a liquidity covenant to admit the asset
  is the most transferable fact this register can carry.
- State what was disclosed. Never state what it means for the security.
- Give each finding a natural_key stable across re-runs.`;

    const response = await rex.generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext('researchIngest.score'),
      structuredOutput: {
        schema: scoringSchema,
        errorStrategy: 'fallback',
        fallbackValue: { findings: [] },
      },
    });

    // Parsed rather than passed straight through: the schema's defaults are
    // what turn an omitted `materiality` into an explicit null, and a finding
    // with an absent field is a finding the persist step would write as
    // undefined. Scoring is narration — losing it costs a headline, so a
    // malformed response commits the facts with no findings rather than failing.
    const parsed = scoringSchema.safeParse(response.object);
    if (!parsed.success) {
      log.warn({ companyId: inputData.companyId }, 'scoring did not match the schema; no findings');
      return { ...inputData, findings: [] };
    }

    return { ...inputData, findings: parsed.data.findings };
  },
});

// ── 8. Classify (Lex) ────────────────────────────────────────────────────────
const classifyStep = createStep({
  id: 'classify',
  inputSchema: scoredSchema,
  outputSchema: classifiedSchema,
  execute: async ({ inputData }) => {
    if (inputData.created.length === 0) {
      return { ...inputData, classifications: [] };
    }

    const prompt = `Classify each of these register events for publication.

${JSON.stringify(
  inputData.created.map((event) => ({
    natural_key: event.natural_key,
    event_type: event.event_type,
    headline: event.headline,
    detail: event.detail,
  })),
  null,
  2,
)}

The register states what a company did and disclosed, with a citation on every
claim. It never states what that means for the security.

restricted, in all cases:
- unrealised position against cost basis
- mNAV, premium or discount to bitcoin NAV, bitcoin per share
- share price movement attributed to any announcement
- dilution narration from issuance, accretion narration from buybacks
- inference about management's view of price from a buyback
- comparison of shareholder outcome against holding bitcoin directly
- characterisation of a covenant waiver as a credit-quality signal
- fund performance figures for a registered scheme
- third-party analyst characterisations, including as attributed quotation

internal where the event is a disclosed fact whose natural reading is a view on
the security — a covenant amendment is the standing example.

publishable where the row states what was done and where it was said, with
nothing inferred.

Return one classification per event. A field you are unsure about is internal.`;

    const response = await lex.generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext('researchIngest.classify'),
      structuredOutput: {
        schema: classificationsSchema,
        errorStrategy: 'fallback',
        // A failed classification pass leaves everything internal, which is the
        // safe direction: an unclassified field is internal by default in the
        // view too, so a Lex outage cannot publish anything.
        fallbackValue: { classifications: [] },
      },
    });

    // Parsed so the schema's defaults land — `field_key` defaults to
    // 'ledger_event', which is what every classification this pipeline writes
    // is about. A malformed response classifies nothing, which leaves every
    // field internal: the safe direction, and the same one a Lex outage takes.
    const parsed = classificationsSchema.safeParse(response.object);
    if (!parsed.success) {
      log.warn({ companyId: inputData.companyId }, 'classification did not match the schema; nothing classified');
      return { ...inputData, classifications: [] };
    }

    return { ...inputData, classifications: parsed.data.classifications };
  },
});

// ── 9. Persist ───────────────────────────────────────────────────────────────
// One transaction, via commit_research_ingest. PostgREST has none, and four
// sequential inserts can half-succeed — leaving events committed with the
// classifications that gate them missing, which is the one failure direction
// that matters.
const persistStep = createStep({
  id: 'persist',
  inputSchema: classifiedSchema,
  outputSchema: persistedSchema,
  execute: async ({ inputData }) => {
    const suppressed: Delta[] = inputData.deltas.filter((delta) => delta.suppressed);

    const payload = {
      company_id: inputData.companyId,
      events: inputData.validated,
      findings: [
        ...inputData.findings,
        // A suppressed delta is stored as a suppressed finding rather than
        // dropped: "we looked and it was immaterial" and "we did not look" have
        // to stay distinguishable on the page.
        ...suppressed.map((delta, index) => ({
          finding_type: 'holdings_change',
          headline: 'Restatement below the materiality floor',
          detail: delta.reason,
          is_suppressed: true,
          suppressed_reason: delta.reason,
          natural_key: `suppressed:${delta.natural_key}:${index}`,
        })),
      ],
      classifications: inputData.classifications,
    };

    const { data, error } = await db.rpc('commit_research_ingest', { payload });
    if (error) throw error;

    return { ...inputData, committed: data };
  },
});

// ── 10. Approval gate ────────────────────────────────────────────────────────
// The only human gate, and it is about publication rather than ingest. A run
// that is not promoting anything passes straight through — which is most runs.
const approvalGateStep = createStep({
  id: 'approval_gate',
  inputSchema: persistedSchema,
  outputSchema: researchIngestOutputSchema,
  resumeSchema: z.object({
    approved: z.boolean(),
    approvedBy: z.string().uuid().nullable().default(null),
  }),
  suspendSchema: z.object({
    gate: z.literal('publish'),
    companyId: z.string(),
    message: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const committed = (inputData.committed ?? {}) as Record<
      string,
      { inserted?: number; updated?: number }
    >;
    const summary = {
      companyId: inputData.companyId,
      documentsFetched: inputData.fetch.fetched,
      documentsFailed: inputData.fetch.failed,
      eventsCommitted: committed['events']?.inserted ?? 0,
      eventsUpdated: committed['events']?.updated ?? 0,
      findingsCommitted: committed['findings']?.inserted ?? 0,
      rejectedClaims: inputData.rejected.length,
      suppressedDeltas: inputData.deltas.filter((delta) => delta.suppressed).length,
      quiet: inputData.quiet,
    };

    if (!inputData.promoteToPublished) {
      return { ...summary, published: false };
    }

    if (resumeData) {
      if (resumeData.approved) {
        await db
          .from('research_companies')
          .update({ is_published: true })
          .eq('id', inputData.companyId);
      }
      return { ...summary, published: resumeData.approved };
    }

    const { data } = await db
      .from('research_companies')
      .select('legal_name')
      .eq('id', inputData.companyId)
      .maybeSingle();
    const name = (data as { legal_name: string } | null)?.legal_name ?? inputData.companyId;

    await suspend({
      gate: 'publish' as const,
      companyId: inputData.companyId,
      message:
        `${name} is proposed for the client-facing register.\n\n` +
        `${summary.eventsCommitted} new events, ${summary.findingsCommitted} findings, ` +
        `${summary.rejectedClaims} extracted figures rejected as not present in source.\n\n` +
        'Only fields Lex classified publishable will render. Approve or reject.',
    });

    // Unreachable: suspend resolves the run, and the resumed pass re-enters
    // execute with resumeData set.
    return { ...summary, published: false };
  },
});

/**
 * Exported for its own tests. Resuming a suspended run needs a storage-backed
 * Mastra instance; the gate's two branches are a property of this step and are
 * tested by calling it directly.
 */
export { approvalGateStep };

export const researchIngestWorkflow = createWorkflow({
  id: 'researchIngest',
  inputSchema: researchIngestInputSchema,
  outputSchema: researchIngestOutputSchema,
})
  .then(resolveDocumentsStep)
  .then(fetchDocumentsStep)
  .then(chunkAndEmbedStep)
  .then(extractEventsStep)
  .then(validateNumericsStep)
  .then(reconcileStep)
  .then(scoreStep)
  .then(classifyStep)
  .then(persistStep)
  .then(approvalGateStep)
  .commit();
