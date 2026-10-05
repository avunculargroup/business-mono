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
import { assignNaturalKeys } from './naturalKey.js';
import { admitUnits, sectionsFor, unitsFor, type ReadingUnit, type StoredSection } from './readingUnits.js';
import { claimsForEvent, validateClaims } from './numerics.js';
import { isQuietRun, materialDeltas, reconcile, type CommittedEvent } from './reconcile.js';
import {
  factsAsOf,
  needsDraft,
  summaryPrompt,
  summaryViolations,
  type SummaryFact,
} from './summaryDraft.js';
import {
  classificationsSchema,
  extractionSchema,
  fetchSummarySchema,
  readableDocumentSchema,
  readingUnitSchema,
  rejectedClaimSchema,
  researchIngestInputSchema,
  researchIngestOutputSchema,
  scoringSchema,
  summaryDraftSchema,
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
const sectionedSchema = embeddedSchema.extend({ units: z.array(readingUnitSchema) });
const extractedSchema = fetchedSchema.extend({
  units: z.array(readingUnitSchema),
  candidates: z.array(candidateEventSchema),
});
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
const draftedSchema = persistedSchema.extend({ summaryDrafted: z.boolean() });

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
      venue: rows[index].venue,
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
    const refs = inputData.refs as Array<{
      id: string;
      title: string;
      sourceClass: string;
      venue: string | null;
    }>;
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
            resolution_status: 'resolved',
          })
          .eq('id', outcome.documentId);
        documents.push({
          id: outcome.documentId,
          title: ref.title,
          text: outcome.text,
          sourceClass: ref.sourceClass,
          venue: ref.venue,
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
          documents.push({
            id: outcome.documentId,
            title: ref.title,
            text,
            sourceClass: ref.sourceClass,
            venue: ref.venue,
          });
        }
        continue;
      }

      failed += 1;
      // Recorded, not discarded. A document that 404s repeatedly is a signal,
      // and a silent skip is how it stays invisible.
      await db
        .from('research_documents')
        .update({
          retrieved_at: new Date().toISOString(),
          retrieval_error: outcome.error,
          resolution_status: outcome.resolution,
        })
        .eq('id', outcome.documentId);
      log.warn({ documentId: outcome.documentId, error: outcome.error }, 'document unavailable');
    }

    return {
      companyId: inputData.companyId,
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

// ── 4. Split and admit ───────────────────────────────────────────────────────
// Deterministic. An SEC filing is split on its item headings and each item
// stored as a section the gate can judge; then only text the ledger accepts
// goes on to the extractor. A claim from a news article or a 10-K's MD&A is
// never extracted, rather than extracted and refused at commit — where the
// refusal raises and takes the whole run's transaction with it.
const splitSectionsStep = createStep({
  id: 'split_sections',
  inputSchema: embeddedSchema,
  outputSchema: sectionedSchema,
  execute: async ({ inputData }) => {
    // The accepted set is read from the table the gate reads, so the two
    // cannot disagree about what the ledger admits.
    const { data: accepted, error: acceptedError } = await db
      .from('field_source_classes')
      .select('source_class')
      .eq('field_key', 'ledger_event');
    if (acceptedError) throw acceptedError;
    const acceptedClasses = new Set(
      ((accepted ?? []) as Array<{ source_class: string }>).map((row) => row.source_class),
    );
    if (acceptedClasses.size === 0) {
      throw new Error('field_source_classes has no classes for ledger_event');
    }

    const units: ReadingUnit[] = [];
    for (const document of inputData.fetch.documents) {
      const sections = sectionsFor(document);
      let stored: StoredSection[] = [];

      if (sections.length > 0) {
        // Existing rows are left alone: a section someone classified by hand
        // keeps that class.
        const { error: upsertError } = await db.from('research_document_sections').upsert(
          sections.map((section) => ({
            document_id: document.id,
            filing_item: section.filingItem,
            source_class: section.sourceClass,
            is_filed: section.isFiled,
          })),
          { onConflict: 'document_id,filing_item', ignoreDuplicates: true },
        );
        if (upsertError) throw upsertError;

        const { data, error } = await db
          .from('research_document_sections')
          .select('id, filing_item, source_class')
          .eq('document_id', document.id);
        if (error) throw error;
        stored = (data ?? []) as StoredSection[];
      }

      units.push(...unitsFor(document, sections, stored));
    }

    const { admitted, skipped } = admitUnits(units, acceptedClasses);
    if (skipped.length > 0) {
      log.info(
        {
          companyId: inputData.companyId,
          skipped: skipped.map((unit) => ({
            documentId: unit.documentId,
            filingItem: unit.filingItem,
            sourceClass: unit.sourceClass,
          })),
        },
        'text the ledger does not accept was not read',
      );
    }

    return { ...inputData, units: admitted };
  },
});

// ── 5. Extract (Rex) ─────────────────────────────────────────────────────────
const extractEventsStep = createStep({
  id: 'extract_events',
  inputSchema: sectionedSchema,
  outputSchema: extractedSchema,
  execute: async ({ inputData }) => {
    // The key prefix comes from the record, never the model: that is what stops
    // one sale arriving as "mstr:disp:…" on one run and "strategy:disposal:…" on
    // the next.
    const { data: company, error: companyError } = await db
      .from('research_companies')
      .select('slug')
      .eq('id', inputData.companyId)
      .maybeSingle();
    if (companyError) throw companyError;
    const slug = (company as { slug: string } | null)?.slug;
    if (!slug) throw new Error(`research company ${inputData.companyId} not found`);

    const extracted: Array<Omit<CandidateEvent, 'natural_key'>> = [];

    for (const unit of inputData.units) {
      const prompt = `Extract treasury events from this filing.

Document id: ${unit.documentId}
Title: ${unit.title}${unit.filingItem ? `\nFiling item: ${unit.filingItem}` : ''}
Source class: ${unit.sourceClass}

Rules:
- Quote figures EXACTLY as the document states them. Do not round, convert, or
  compute an average. Every figure is re-checked against this text afterwards
  and a figure that does not appear here is discarded.
- Consideration goes in the currency the document states, in native units.
  Never convert.
- If the document says a consideration is inclusive of fees, set fees_included.
- event_date is the day the event happened, as YYYY-MM-DD. For an event that
  spans a period, such as a week of sales, use the last day of the period. Never
  use the filing date or a date from the signature block.
- If the document restates earlier events, as in a holdings history table,
  extract every row: restatements are matched to what is already recorded.
- Only extract what this document states. Do not carry anything over from
  general knowledge about the company.
- If the document states no treasury event at all, return an empty list and say
  what you looked for in notes. Saying nothing is a valid answer.

Document text:
${unit.text.slice(0, MAX_DOCUMENT_CHARS)}`;

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
        log.warn(
          { documentId: unit.documentId, filingItem: unit.filingItem },
          'extraction did not match the schema; skipping document',
        );
        continue;
      }

      for (const event of parsed.data.events) {
        // The extractor names its own source, but it is overwritten with the
        // document and item actually being read: a model that attributes an
        // event to a different filing has produced provenance nobody can check.
        extracted.push({
          ...event,
          source_document_id: unit.documentId,
          source_section_id: unit.sectionId,
        } as Omit<CandidateEvent, 'natural_key'>);
      }
    }

    const { keyed, invalid, conflicts } = assignNaturalKeys(slug, extracted);
    const candidates = keyed as CandidateEvent[];
    if (invalid.length > 0) {
      // Dropped rather than passed on: an unparseable date fails the DATE cast
      // inside the commit transaction and takes every other row down with it.
      log.warn(
        { companyId: inputData.companyId, dates: invalid.map((event) => event.event_date) },
        'candidates dropped: event date is not YYYY-MM-DD',
      );
    }
    if (conflicts.length > 0) {
      log.warn({ companyId: inputData.companyId, keys: conflicts }, 'documents disagree about an event');
    }

    log.info({ companyId: inputData.companyId, candidates: candidates.length }, 'events extracted');
    return {
      companyId: inputData.companyId,
      requestedBy: inputData.requestedBy,
      fetch: inputData.fetch,
      units: inputData.units,
      candidates,
    };
  },
});

// ── 6. Validate ──────────────────────────────────────────────────────────────
// Deterministic, and the step that makes the rest of the pipeline trustworthy.
// Rejects do not commit.
const validateNumericsStep = createStep({
  id: 'validate_numerics',
  inputSchema: extractedSchema,
  outputSchema: validatedSchema,
  execute: async ({ inputData }) => {
    // Checked against the item the event was read from, not the whole filing:
    // a figure that appears only in a section the ledger refuses has not been
    // found in the source the event cites.
    const unitKey = (documentId: string, sectionId: string | null) => `${documentId}:${sectionId ?? ''}`;
    const textByUnit = new Map(inputData.units.map((u) => [unitKey(u.documentId, u.sectionId), u.text]));
    const validated: CandidateEvent[] = [];
    const rejected: Array<z.infer<typeof rejectedClaimSchema>> = [];

    for (const candidate of inputData.candidates) {
      const sourceText =
        textByUnit.get(unitKey(candidate.source_document_id, candidate.source_section_id)) ?? '';
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
      requestedBy: inputData.requestedBy,
      fetch: inputData.fetch,
      validated,
      rejected,
    };
  },
});

// ── 7. Reconcile ─────────────────────────────────────────────────────────────
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

// ── 8. Score (Rex) ───────────────────────────────────────────────────────────
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

// ── 9. Classify (Lex) ────────────────────────────────────────────────────────
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

// ── 10. Persist ───────────────────────────────────────────────────────────────
// One transaction, via commit_research_ingest. PostgREST has none, and four
// sequential inserts can half-succeed — leaving events committed with the
// classifications that gate them missing, which is the one failure direction
// that matters.
const persistStep = createStep({
  id: 'persist',
  inputSchema: classifiedSchema,
  outputSchema: persistedSchema,
  execute: async ({ inputData, runId }) => {
    const suppressed: Delta[] = inputData.deltas.filter((delta) => delta.suppressed);

    const payload = {
      company_id: inputData.companyId,
      // Stamped on every row this run writes or changes, so a reviewer can
      // approve exactly what this run produced.
      run_id: runId,
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

// ── 11. Draft the subscriber summary (Rex) ──────────────────────────────────
// After persist, so a model being slow, down or wrong costs a draft and never
// a ledger. Only for a record with no summary yet, and only when its facts
// have moved since the last draft. Composed from implementation facts only;
// the draft lands in research_summary_drafts, which no subscriber can read,
// and clearance refuses it until a person has edited it.
//
// Never fails the run: the rows are committed whatever happens here.
const draftSummaryStep = createStep({
  id: 'draft_summary',
  inputSchema: persistedSchema,
  outputSchema: draftedSchema,
  execute: async ({ inputData, runId }) => {
    try {
      return { ...inputData, summaryDrafted: await draftSummary(inputData.companyId, runId) };
    } catch (err) {
      log.error({ err, companyId: inputData.companyId }, 'summary draft failed');
      return { ...inputData, summaryDrafted: false };
    }
  },
});

/** Two attempts: a draft that trips the filter is retried once, told why. */
const SUMMARY_ATTEMPTS = 2;

async function draftSummary(companyId: string, runId: string): Promise<boolean> {
  const { data: company, error: companyError } = await db
    .from('research_companies')
    .select('legal_name, client_summary')
    .eq('id', companyId)
    .maybeSingle();
  if (companyError) throw companyError;
  if (!company) return false;
  const { legal_name: legalName, client_summary: clientSummary } = company as {
    legal_name: string;
    client_summary: string | null;
  };
  if (clientSummary?.trim()) return false;

  // Implementation facts only, read from the classification the client read
  // policy uses, so the draft and the subscriber's view agree about what an
  // implementation fact is. An unclassified key is left out.
  const { data: classes, error: classesError } = await db
    .from('field_source_minimums')
    .select('field_key')
    .eq('client_fact_class', 'implementation');
  if (classesError) throw classesError;
  const implementation = new Set(
    ((classes ?? []) as Array<{ field_key: string }>).map((row) => row.field_key),
  );

  const { data: factRows, error: factsError } = await db
    .from('research_company_facts')
    .select('field_key, label, value, as_of, updated_at, review_state, is_superseded')
    .eq('company_id', companyId);
  if (factsError) throw factsError;
  const facts = ((factRows ?? []) as Array<SummaryFact & { review_state: string; is_superseded: boolean }>)
    .filter((fact) => implementation.has(fact.field_key))
    .filter((fact) => !fact.is_superseded && fact.review_state !== 'retired')
    .map(({ field_key, label, value, as_of, updated_at }) => ({ field_key, label, value, as_of, updated_at }));

  const { data: existing, error: existingError } = await db
    .from('research_summary_drafts')
    .select('facts_as_of')
    .eq('company_id', companyId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (!needsDraft({ clientSummary, facts, existing: existing as { facts_as_of: string | null } | null })) {
    return false;
  }

  const { data: metrics, error: metricsError } = await db
    .from('restricted_metrics')
    .select('label, aliases');
  if (metricsError) throw metricsError;
  const restricted = ((metrics ?? []) as Array<{ label: string; aliases: string[] | null }>).flatMap(
    (metric) => [metric.label, ...(metric.aliases ?? [])],
  );

  let rejected: string[] = [];
  for (let attempt = 0; attempt < SUMMARY_ATTEMPTS; attempt += 1) {
    const response = await rex.generate(
      [{ role: 'user', content: summaryPrompt({ legalName, facts, rejected }) }],
      {
        requestContext: stepRequestContext('researchIngest.draft_summary'),
        structuredOutput: {
          schema: summaryDraftSchema,
          errorStrategy: 'fallback',
          fallbackValue: { summary: '' },
        },
      },
    );

    const parsed = summaryDraftSchema.safeParse(response.object);
    const body = parsed.success ? parsed.data.summary.trim() : '';
    if (!body) {
      log.warn({ companyId }, 'summary draft came back empty');
      return false;
    }

    rejected = summaryViolations(body, restricted);
    if (rejected.length > 0) {
      log.warn({ companyId, attempt, terms: rejected }, 'summary draft refused by the filter');
      continue;
    }

    const { error } = await db.from('research_summary_drafts').upsert(
      {
        company_id: companyId,
        body,
        drafted_at: new Date().toISOString(),
        ingest_run_id: runId,
        facts_as_of: factsAsOf(facts),
      },
      { onConflict: 'company_id' },
    );
    if (error) throw error;
    log.info({ companyId }, 'summary drafted');
    return true;
  }

  return false;
}

// ── 12. Record the run ───────────────────────────────────────────────────────
// Persist-and-stop. The run's rows are already in the database as drafts,
// stamped with this run's id, and the review queue on /research is where a
// person reads and approves them. Nothing here waits: a suspended run holds
// workflow state open and needs storage-backed context to survive a restart,
// which is the wrong shape for something that runs unattended.
//
// The run is logged to agent_activity as the audit trail, as `auto` rather
// than `pending`. A pending row would appear in the generic approvals list,
// whose approve button only changes the activity's status; the rows would stay
// drafts, and two approve paths for one run would disagree. Approving on
// /research marks this row approved too.
const recordRunStep = createStep({
  id: 'record_run',
  inputSchema: draftedSchema,
  outputSchema: researchIngestOutputSchema,
  execute: async ({ inputData, runId }) => {
    const committed = (inputData.committed ?? {}) as Record<
      string,
      { inserted?: number; updated?: number }
    >;

    // Counted from the rows rather than the commit's tallies: the commit counts
    // an unchanged re-read as an update, and only a changed or new row is a
    // draft waiting for someone. A quiet run queues nothing because it writes
    // no draft, not because it is skipped here.
    let queuedRows = 0;
    for (const table of ['treasury_events', 'research_findings'] as const) {
      const { count } = await db
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('company_id', inputData.companyId)
        .eq('ingest_run_id', runId)
        .eq('review_state', 'draft');
      queuedRows += count ?? 0;
    }

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
      queuedRows,
      summaryDrafted: inputData.summaryDrafted,
    };

    const { error } = await db.from('agent_activity').insert({
      agent_name: 'rex',
      action: 'research_ingest',
      status: 'auto',
      trigger_type: inputData.requestedBy ? 'manual' : 'scheduled',
      trigger_ref: inputData.requestedBy,
      workflow_run_id: runId,
      entity_type: 'research_companies',
      entity_id: inputData.companyId,
      notes:
        (queuedRows > 0
          ? `${queuedRows} rows waiting for review on /research.`
          : 'Nothing to review: no new or changed rows.') +
        (inputData.summaryDrafted ? ' Subscriber summary drafted for editing.' : ''),
    });
    // The rows are committed whatever happens here, and the queue reads them,
    // not this log. A failed audit write is logged rather than failing the run.
    if (error) log.error({ err: error, runId }, 'run not logged to agent_activity');

    return summary;
  },
});

export const researchIngestWorkflow = createWorkflow({
  id: 'researchIngest',
  inputSchema: researchIngestInputSchema,
  outputSchema: researchIngestOutputSchema,
})
  .then(resolveDocumentsStep)
  .then(fetchDocumentsStep)
  .then(chunkAndEmbedStep)
  .then(splitSectionsStep)
  .then(extractEventsStep)
  .then(validateNumericsStep)
  .then(reconcileStep)
  .then(scoreStep)
  .then(classifyStep)
  .then(persistStep)
  .then(draftSummaryStep)
  .then(recordRunStep)
  .commit();
