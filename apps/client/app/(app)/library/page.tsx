import type { Metadata } from 'next';
import type { ClientType } from '@platform/data';
import { EmptyDay } from '@/components/EmptyDay';
import { Freshness } from '@/components/Freshness';
import { Markdown } from '@/components/Markdown';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from './library.module.css';

export const metadata: Metadata = { title: 'Library' };

const LEDE: Record<ClientType, string> = {
  corporate:
    'Reference material for taking a treasury question through a board and past an auditor. '
    + 'Sections on accounting treatment, board policy and audit committee questions sit '
    + 'alongside the shared material.',
  smsf:
    'Reference material for trustees. Sections on the trust deed, the sole purpose test, '
    + 'separation of assets and the 30 June valuation sit alongside the shared material.',
};

/**
 * The reference layer, and the first place `client_type` changes what is on
 * screen.
 *
 * The sectioning is enforced in the database rather than here: the RLS policy
 * on `client_library_sections` filters on `client_type`, so a page that forgot
 * to pass one still could not show a trustee the corporate sections. Passing it
 * is belt and braces, and the belt is the policy.
 *
 * Every entry is dated. An undated reference entry on a regulatory topic during
 * a transition period is worse than no entry, because the reader cannot tell
 * which regime it describes.
 */
export default async function LibraryPage() {
  const repositories = await requireClientRepositories();
  const ctx = readContext();

  const session = await repositories.session.current(ctx);
  const clientType: ClientType = session?.clientType ?? 'corporate';
  const sections = await repositories.library.sections(ctx, clientType);

  const populated = sections.filter((section) => section.entries.length > 0);

  return (
    <>
      <header className={page.header}>
        <h1 className={page.title}>Library</h1>
        <p className={page.lede}>{LEDE[clientType]}</p>
      </header>

      {populated.length === 0 ? (
        <EmptyDay
          headline="No entries have been published"
          detail={
            'The library is written and reviewed before it is published, entry by entry. '
            + 'Nothing has cleared review yet.'
          }
        />
      ) : (
        populated.map((section) => (
          <section key={section.key} className={styles.section}>
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            <div className={styles.entries}>
              {section.entries.map((entry) => (
                <details key={entry.slug} className={styles.entry}>
                  <summary className={styles.entryTitle}>{entry.title}</summary>
                  <div className={styles.entryBody}>
                    <Markdown>{entry.body}</Markdown>
                  </div>
                  <div className={styles.meta}>
                    <span>
                      Reviewed <Freshness asAt={entry.lastReviewedAt} />
                    </span>
                    {entry.reviewDueDate ? (
                      <span>next review {entry.reviewDueDate}</span>
                    ) : null}
                    {entry.regulatoryReferences.map((reference) => (
                      <span key={reference} className={styles.reference}>
                        {reference}
                      </span>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
