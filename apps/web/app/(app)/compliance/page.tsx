import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { isAwaitingReview, isLive, sortQueue, type ReviewableRow } from '@/lib/compliance/queue';
import { ReviewQueue, type QueueItem } from './ReviewQueue';
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
  const [templates, library] = await Promise.all([
    supabase
      .from('prepare_templates')
      .select(
        'id, slug, title, status, version, artefact_type, client_type, lex_reviewed_at, review_due_date',
      ),
    supabase
      .from('client_library_entries')
      .select('id, slug, title, status, lex_reviewed_at, review_due_date'),
  ]);

  const templateRows = (templates.data ?? []) as TemplateRow[];
  const libraryRows = (library.data ?? []) as LibraryRow[];

  const items: QueueItem[] = [
    ...templateRows.map((row) => ({
      ...toReviewable(row),
      kind: 'template' as const,
      detail: `${row.artefact_type.replace(/_/g, ' ')} · ${row.client_type} · v${row.version}`,
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
  const readError = templates.error?.message ?? library.error?.message ?? null;

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

        <ReviewQueue awaiting={awaiting} live={live} />
      </div>
    </>
  );
}
