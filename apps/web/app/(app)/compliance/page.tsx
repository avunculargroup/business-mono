import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { isAwaitingReview, isLive, sortQueue, type ReviewableRow } from '@/lib/compliance/queue';
import {
  documentReadiness,
  profileFieldsUsedBy,
  type ProfileField,
} from '@/lib/compliance/documents';
import { blastRadius } from '@/lib/clients/operations';
import { ReviewQueue, type QueueItem } from './ReviewQueue';
import { CompanyProfileForm } from './CompanyProfileForm';
import { DocumentList, type DocumentRow } from './DocumentList';
import styles from './compliance.module.css';

/**
 * The Lex approval queue for Minute.
 *
 * Two tables gate what a paying subscriber can see — `prepare_templates` and
 * `client_library_entries` — and both carry a CHECK constraint saying nothing
 * goes live without a named reviewer. Until this page existed the only way to
 * satisfy those constraints was an UPDATE written by hand into a migration
 * header, which is a workable answer once and an unworkable one every quarter.
 *
 * It also carries the company profile and the compliance documents, which are
 * a different act from a review — publishing a Service Statement is not signing
 * one off — but the same job: the things that have to be true before a
 * subscriber can use Minute. Keeping them on one page means the profile field
 * that blocks the gate is next to the document it blocks.
 *
 * Everything ships as a draft, so on first load this page is the whole backlog.
 */
export const dynamic = 'force-dynamic';

type TemplateRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  version: string;
  artefact_type: string;
  client_type: string;
  body: string;
  lex_reviewed_at: string | null;
  review_due_date: string | null;
};

type LibraryRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  lex_reviewed_at: string | null;
  review_due_date: string | null;
};

function toReviewable(row: TemplateRow | LibraryRow): ReviewableRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    lexReviewedAt: row.lex_reviewed_at,
    reviewDueDate: row.review_due_date,
  };
}

export default async function CompliancePage() {
  const supabase = await createClient();

  // Two round-trips rather than one embedded select: the tables are unrelated,
  // and the bridge types carry no PostgREST relationship metadata to join on.
  const [templates, library, documents, generations, profileRow] = await Promise.all([
    supabase
      .from('prepare_templates')
      .select(
        'id, slug, title, status, version, artefact_type, client_type, body, lex_reviewed_at, review_due_date',
      ),
    supabase
      .from('client_library_entries')
      .select('id, slug, title, status, lex_reviewed_at, review_due_date'),
    supabase
      .from('compliance_documents')
      .select('id, doc_type, title, version, body, status, effective_from'),
    // Blast radius. `prepare_generations` exists, in its own comment, so that
    // "if a template is later found to be wrong, this answers who received
    // it" — and nothing read it until now, so the question could not be asked.
    supabase
      .from('prepare_generations')
      .select('account_id, template_id, template_version, event, generated_at'),
    supabase
      .from('company_profile')
      .select(
        'legal_name, trading_name, abn, acn, registered_address, registered_state, registered_postcode, public_phone, public_email, public_website, complaints_contact, complaints_email, complaints_phone',
      )
      .maybeSingle(),
  ]);

  const generationRows = ((generations.data ?? []) as Array<{
    account_id: string;
    template_id: string;
    template_version: string;
    event: string;
    generated_at: string;
  }>).map((row) => ({
    accountId: row.account_id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    event: row.event,
    generatedAt: row.generated_at,
  }));

  const templateRows = (templates.data ?? []) as TemplateRow[];
  const libraryRows = (library.data ?? []) as LibraryRow[];

  const items: QueueItem[] = [
    ...templateRows.map((row) => ({
      ...toReviewable(row),
      kind: 'template' as const,
      detail: `${row.artefact_type.replace(/_/g, ' ')} · ${row.client_type} · v${row.version}`,
      body: row.body,
      version: row.version,
      // Scoped to this version, not the slug: a recall is of specific text, and
      // counting every version would send someone chasing packs built from
      // wording that was never in question.
      reach: blastRadius(generationRows, row.id, row.version),
    })),
    ...libraryRows.map((row) => ({
      ...toReviewable(row),
      kind: 'library' as const,
      detail: 'Library entry',
    })),
  ];

  const awaiting = sortQueue(items.filter(isAwaitingReview));
  const live = sortQueue(items.filter((item) => isLive(item, item.kind)));

  // A read that failed and a table that is empty look identical downstream, and
  // on this page the difference matters: an empty queue reads as "nothing to
  // review" and would be wrong. The migrations are unapplied, so this is the
  // expected state today rather than an outage.
  const readError =
    templates.error?.message
    ?? library.error?.message
    ?? documents.error?.message
    ?? profileRow.error?.message
    ?? null;


  const profile = (profileRow.data ?? null) as Partial<
    Record<ProfileField, string | null>
  > | null;

  // Resolved on the server, against the live profile, so the page shows what a
  // subscriber would actually get rather than what the body says before
  // substitution.
  const today = new Date().toISOString().slice(0, 10);
  const privacyPolicyUrl = process.env['NEXT_PUBLIC_PRIVACY_POLICY_URL'] ?? '';

  const documentRows: DocumentRow[] = ((documents.data ?? []) as Array<{
    id: string;
    doc_type: string;
    title: string;
    version: string;
    body: string;
    status: string;
    effective_from: string | null;
  }>)
    .map((row) => {
      const readiness = documentReadiness(
        { body: row.body, version: row.version, effectiveFrom: row.effective_from },
        profile,
        privacyPolicyUrl,
        today,
      );

      return {
        id: row.id,
        docType: row.doc_type,
        title: row.title,
        version: row.version,
        status: row.status,
        effectiveFrom: row.effective_from,
        ready: readiness.ready,
        missing: readiness.missing,
        body: readiness.body,
        rawBody: row.body,
      };
    })
    .sort(
      (a, b) => a.docType.localeCompare(b.docType) || a.version.localeCompare(b.version),
    );

  // Which profile fields matter is a property of the statement, not a constant:
  // telling someone the terms of service are blocked on a complaints phone
  // number no document mentions would be a lie.
  const statementBodies = documentRows.length > 0
    ? ((documents.data ?? []) as Array<{ doc_type: string; body: string }>)
        .filter((row) => row.doc_type === 'service_statement')
        .map((row) => row.body)
    : [];
  const usedByStatement = [
    ...new Set(statementBodies.flatMap((body) => profileFieldsUsedBy(body))),
  ];

  return (
    <>
      <PageHeader title="Compliance review" />
      <div className={styles.container}>
        <p className={styles.intro}>
          Templates and library entries reach a Minute subscriber only once someone has read them
          and said so. Recording a review here publishes what was reviewed and sets the date it
          should be read again.
        </p>

        {readError && (
          <p className={styles.readError} role="status">
            Could not read the review tables ({readError}). The client-app migrations have not been
            applied yet, so this is expected until they are — but it means the queue below is not
            evidence that there is nothing to review.
          </p>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Company profile</h2>
          <p className={styles.sectionLede}>
            The Service Statement resolves these at render. One blank field it uses and the gate
            serves &ldquo;not available&rdquo; rather than the document, so this is a
            prerequisite for anyone logging in rather than a settings page.
          </p>
          <CompanyProfileForm initial={profile} usedBy={usedByStatement} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Compliance documents</h2>
          <p className={styles.sectionLede}>
            Bodies come from migrations and are not edited here. Publishing supersedes the live
            version of the same type in one transaction, so there is never a moment with none.
          </p>
          <DocumentList documents={documentRows} />
        </section>

        <ReviewQueue awaiting={awaiting} live={live} />
      </div>
    </>
  );
}
