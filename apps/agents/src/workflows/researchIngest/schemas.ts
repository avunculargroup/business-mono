/**
 * The step contract, as schemas.
 *
 * Two things these encode that comments could not. The agent steps produce
 * structured output constrained by the schemas here, so a model cannot invent a
 * field or an event type the register has no column for. And every candidate
 * carries `natural_key` from the extract step onward, computed there from what
 * the model read rather than asked of it — re-ingesting a document has to
 * update the same rows, and a key a model writes differs between runs.
 */

import { z } from 'zod';
import {
  HOLDING_BASIS_CODES,
  ResearchClassification,
  ResearchFindingType,
  TreasuryEventType,
} from '@platform/shared';

export const researchIngestInputSchema = z.object({
  companyId: z.string().uuid(),
  /**
   * Whether this run is proposing the record for a client-facing surface.
   *
   * False is the normal path and runs unattended end to end. The suspend gate
   * sits at publication, never at ingest: facts arriving in the register is not
   * a decision a director needs to make, and a pipeline that stops for approval
   * on every quarterly stops running.
   */
  promoteToPublished: z.boolean().default(false),
  requestedBy: z.string().uuid().nullable().default(null),
});
export type ResearchIngestInput = z.infer<typeof researchIngestInputSchema>;

export const documentRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  knownSha: z.string().nullable(),
  status: z.enum(['resolved', 'unresolved']),
  reason: z.string().optional(),
});

/** A document that reached the extractor: fetched, extracted, with text to read. */
export const readableDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  sourceClass: z.string(),
  /** Only an SEC filing is split into items; see `readingUnits.ts`. */
  venue: z.string().nullable().default(null),
});

/** A document, or one item of a filing, as the extractor reads it. */
export const readingUnitSchema = z.object({
  documentId: z.string(),
  sectionId: z.string().nullable(),
  filingItem: z.string().nullable(),
  title: z.string(),
  text: z.string(),
  sourceClass: z.string(),
});

export const fetchSummarySchema = z.object({
  fetched: z.number(),
  unchanged: z.number(),
  failed: z.number(),
  documents: z.array(readableDocumentSchema),
});

/**
 * One event as Rex proposes it.
 *
 * `source_document_id` is required and is the id of the document the extraction
 * read — not a document the model chose. A candidate that cannot name where it
 * came from is not a candidate.
 */
export const candidateEventSchema = z.object({
  event_type: z.enum(
    Object.values(TreasuryEventType) as [string, ...string[]],
  ),
  asset_class: z.string().default('btc'),
  event_date: z.string().describe('YYYY-MM-DD, as the document states it'),
  quantity: z.number().nullable().default(null),
  consideration_native: z.number().nullable().default(null),
  native_currency: z.string().nullable().default(null),
  fees_included: z.boolean().nullable().default(null),
  headline: z.string(),
  detail: z.string().nullable().default(null),
  disclosure_venue: z.string().nullable().default(null),
  basis: z.enum(HOLDING_BASIS_CODES as unknown as [string, ...string[]]).nullable().default(null),
  source_document_id: z.string(),
  /**
   * The filing item the event was read from, where the document was split.
   * Set from the unit being read, never by the model: the gate judges the
   * claim by this section's class.
   */
  source_section_id: z.string().nullable().default(null),
  /** Computed by `assignNaturalKeys`, never by the model. */
  natural_key: z.string(),
});
export type CandidateEvent = z.infer<typeof candidateEventSchema>;

/**
 * What Rex returns: a candidate without its key. The key is built afterwards
 * from the record's slug, so a model cannot vary it between runs.
 */
export const extractedEventSchema = candidateEventSchema.omit({
  natural_key: true,
  source_section_id: true,
});

export const extractionSchema = z.object({
  events: z.array(extractedEventSchema),
  /** What the extractor looked for and did not find. Absence is reportable. */
  notes: z.string().nullable().default(null),
});

export const rejectedClaimSchema = z.object({
  natural_key: z.string(),
  field: z.string(),
  value: z.number(),
  nearest: z.number().nullable(),
});

export const validationSchema = z.object({
  validated: z.array(candidateEventSchema),
  rejected: z.array(rejectedClaimSchema),
});

/** A reconciliation delta, including the ones the floor suppressed. */
export const deltaSchema = z.object({
  natural_key: z.string(),
  field: z.enum(['quantity', 'consideration_native']),
  from: z.number().nullable(),
  to: z.number().nullable(),
  relative: z.number().nullable(),
  suppressed: z.boolean(),
  reason: z.string().nullable(),
});

export const findingSchema = z.object({
  finding_type: z.enum(Object.values(ResearchFindingType) as [string, ...string[]]),
  is_absence: z.boolean().default(false),
  subject: z.enum(['covenants', 'debt', 'holdings', 'policy']).nullable().default(null),
  occurred_on: z.string().nullable().default(null),
  headline: z.string(),
  detail: z.string().nullable().default(null),
  materiality: z.number().min(0).max(1).nullable().default(null),
  event_natural_key: z.string().nullable().default(null),
  source_document_id: z.string().nullable().default(null),
  natural_key: z.string(),
});

export const scoringSchema = z.object({
  findings: z.array(findingSchema),
});

export const classificationSchema = z.object({
  event_natural_key: z.string(),
  field_key: z.string().default('ledger_event'),
  classification: z.enum(
    Object.values(ResearchClassification) as [string, ...string[]],
  ),
  reason: z.string(),
});

export const classificationsSchema = z.object({
  classifications: z.array(classificationSchema),
});

export const researchIngestOutputSchema = z.object({
  companyId: z.string(),
  documentsFetched: z.number(),
  documentsFailed: z.number(),
  eventsCommitted: z.number(),
  eventsUpdated: z.number(),
  findingsCommitted: z.number(),
  rejectedClaims: z.number(),
  suppressedDeltas: z.number(),
  /** True when nothing material happened. A valid, common outcome. */
  quiet: z.boolean(),
  published: z.boolean(),
});
