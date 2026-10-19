// ============================================================
// Source reconciliation — the spec's six rules, applied before any tier
// ============================================================
// OpenAlex is the index, not the authority on licences or versions. Each rule
// that changes something records its input and verdict as a 'reconciled'
// event, so a tier can always be traced to the copy and the rule that set it.
// Spec: docs/features/client-app/library-papers-spec.md#source-reconciliation-rules
//
// Rules 5 and 6 have no code here, by construction: nothing in this pipeline
// matches a work on its title (rule 5), and nothing reads licence tags off a
// publisher's web page (rule 6). Licences come only from OpenAlex, the
// publisher's Crossref deposit and the repository's own record.

import {
  depositedLicences, isPostedContent, publishedVersionDois, updatesAgainst, type CrossrefWork,
} from './crossref.js';
import { fromUrl } from './licences.js';
import type { NormalisedWork } from './normalise.js';
import type { RepositoryRecord } from './repository.js';
import type { Location, ReconciledEvent, Update } from './types.js';

export interface ReconcileInput {
  work: NormalisedWork;
  /** The DOI the lookup was made for, when it was made by DOI. */
  requestedDoi: string | null;
  /** The publisher's deposit for the work's own DOI (requestedDoi for a draft). */
  crossref: CrossrefWork | null;
  /** Repository confirmations by landing URL; null where the repository could not be read. */
  repository: ReadonlyMap<string, RepositoryRecord | null>;
  asOf: Date;
}

export interface Reconciled {
  /** True when the work is a draft whose published version is a separate record (rule 4). */
  isDraft: boolean;
  /** The published work's DOI when OpenAlex merged this draft into it; null otherwise. */
  mergedInto: string | null;
  /** The published version's DOI, for a draft. Resolved and committed before the draft. */
  publishedVersionDoi: string | null;
  identifiers: NormalisedWork['identifiers'];
  locations: Location[];
  updates: Update[];
  events: ReconciledEvent[];
}

const OPEN_CODES = new Set(['cc-by', 'cc-by-sa', 'cc0', 'public-domain', 'cc-by-nd', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nc-nd']);

function isSsrn(l: Location): boolean {
  const urls = [l.landingUrl, l.pdfUrl].filter(Boolean).join(' ').toLowerCase();
  return /(^|[/.])ssrn\.com\//.test(urls) || (l.doi?.startsWith('10.2139/ssrn.') ?? false);
}

export function reconcile(input: ReconcileInput): Reconciled {
  const { work, crossref, asOf } = input;
  const events: ReconciledEvent[] = [];
  const workDoi = work.identifiers.doi;
  const requested = input.requestedDoi;

  // ── Rule 4: a draft is always its own record ──────────────────────────────
  // OpenAlex returning a work whose DOI is not the one asked for means it has
  // merged the draft into the published work (gs-37 into gs-15). Crossref's
  // posted-content type and is-preprint-of relation say the same thing
  // directly, merged or not.
  const mergedInto = requested && workDoi && requested !== workDoi ? workDoi : null;
  const preprintOf = crossref ? publishedVersionDois(crossref)[0] ?? null : null;
  const isDraft = mergedInto !== null || (crossref !== null && isPostedContent(crossref));
  const publishedVersionDoi = mergedInto ?? preprintOf;
  if (mergedInto) {
    events.push({
      rule: 4,
      input: `OpenAlex lookup for ${requested} returned ${work.identifiers.openalexId} (DOI ${workDoi})`,
      verdict: `draft kept as its own record, linked to ${workDoi} by published_version_of`,
    });
  }

  // A merged draft keeps only its own copies, and never the published work's
  // OpenAlex id (papers.openalex_id belongs to that work).
  let locations = mergedInto
    ? work.locations.filter((l) => l.hostType === 'preprint_server' || l.doi === requested)
    : work.locations.map((l) => ({ ...l }));
  const identifiers = mergedInto
    ? { ...work.identifiers, doi: requested, openalexId: null }
    : { ...work.identifiers };

  // Rule 4, second half: a preprint server's copy is a submitted version.
  // OpenAlex labels merged ones acceptedVersion.
  // Rule 2: SSRN is never a published or accepted version.
  locations = locations.map((l) => {
    const forced = l.hostType === 'preprint_server' || isSsrn(l);
    if (forced && l.version !== null && l.version !== 'submittedVersion') {
      events.push({
        rule: isSsrn(l) ? 2 : 4,
        input: `${l.landingUrl ?? l.pdfUrl} reported as ${l.version}`,
        verdict: 'submittedVersion: a preprint server or SSRN copy is never a published or accepted version',
      });
      return { ...l, version: 'submittedVersion' as const };
    }
    return l;
  });

  // ── Rule 3: confirm repository copies at the repository ───────────────────
  locations = locations.map((l) => {
    if (l.hostType !== 'repository' || !l.landingUrl) return l;
    const record = input.repository.get(l.landingUrl);
    if (!record) return l; // unconfirmed: recorded, lifts nothing
    const next: Location = {
      ...l,
      version: record.version ?? l.version,
      isOa: record.isOa,
      licence: record.licence,
      reportedBy: 'repository',
      verifiedAtHost: true,
    };
    if (next.isOa !== l.isOa || next.version !== l.version || next.licence !== l.licence) {
      events.push({
        rule: 3,
        input: `OpenAlex: ${l.landingUrl} is_oa=${l.isOa}, ${l.version ?? 'no version'}, ${l.licence ?? 'no licence'}`,
        verdict: `repository record (${record.evidence}): is_oa=${next.isOa}, ${next.version ?? 'no version'}, ${next.licence ?? 'no licence'}`,
      });
    }
    return next;
  });

  // ── Rule 1: the publisher's Crossref licence deposit for the version of record
  // A CC licence deposited for the VoR is the publisher saying the VoR is open
  // under it (gs-28 CC BY-NC, gs-36 CC BY). A draft's deposit describes the
  // draft, not a version of record, so it is not applied here.
  if (crossref && !isDraft && workDoi) {
    const code = depositedLicences(crossref, 'vor', asOf).map(fromUrl).find((c) => c !== null) ?? null;
    if (code && OPEN_CODES.has(code)) {
      const doiUrl = `https://doi.org/${workDoi}`;
      const idx = locations.findIndex((l) => l.hostType === 'publisher' && l.version !== 'submittedVersion');
      const prior = idx >= 0 ? locations[idx] : null;
      const next: Location = {
        hostType: 'publisher',
        sourceName: prior?.sourceName ?? work.venue?.name ?? null,
        landingUrl: prior?.landingUrl ?? doiUrl,
        pdfUrl: prior?.pdfUrl ?? null,
        doi: prior?.doi ?? workDoi,
        version: 'publishedVersion',
        licence: code,
        oaStatus: prior?.oaStatus ?? null,
        isOa: true,
        reportedBy: prior?.reportedBy ?? 'crossref',
        verifiedAtHost: prior?.verifiedAtHost ?? false,
      };
      if (!prior || prior.licence !== code || !prior.isOa || prior.version !== 'publishedVersion') {
        events.push({
          rule: 1,
          input: prior
            ? `OpenAlex: publisher copy ${prior.licence ?? 'no licence'}, is_oa=${prior.isOa}`
            : 'OpenAlex: no publisher copy',
          verdict: `Crossref VoR licence deposit: ${code}`,
        });
      }
      if (idx >= 0) locations[idx] = next;
      else locations.push(next);
    }
  }

  // Notices: Crossref's updated-by, plus OpenAlex's retraction flag.
  const updates = crossref ? updatesAgainst(crossref) : [];
  if (work.isRetracted && !updates.some((u) => u.kind === 'retracted') && !mergedInto) {
    updates.push({ kind: 'retracted', noticeDoi: null, source: 'openalex' });
  }

  return { isDraft, mergedInto, publishedVersionDoi, identifiers, locations, updates, events };
}
