import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import styles from './jurisdictions.module.css';

/**
 * The jurisdiction notes, keyed on standard and venue rather than on company.
 *
 * Written once and joined onto every record that matches. Across three research
 * records this panel does more for an Australian CFO than any individual
 * company page: two of them are quoted on the same exchange and their identical
 * economic exposure produces opposite earnings behaviour, because one measures
 * through equity and the other through income.
 *
 * Notes marked internal render here and nowhere client-facing. v1 is internal
 * only, and a note that has not been signed off says so on its face.
 */
export default async function JurisdictionsPage() {
  const { corporateHoldings } = await getRepositories();
  const ctx = resolveReadContext();

  // Every note the register holds, gathered across the dimensions it keys on.
  // Deduped by id because a note keyed only on venue matches several queries.
  const results = await Promise.all([
    corporateHoldings.getJurisdictionNotes(ctx, { standard: 'aasb' }),
    corporateHoldings.getJurisdictionNotes(ctx, { standard: 'nz_ifrs' }),
    corporateHoldings.getJurisdictionNotes(ctx, { standard: 'us_gaap' }),
    corporateHoldings.getJurisdictionNotes(ctx, { venue: 'asx', listingType: 'primary' }),
    corporateHoldings.getJurisdictionNotes(ctx, { venue: 'nzx', listingType: 'primary' }),
  ]);

  const notes = [...new Map(results.flat().map((note) => [note.id, note])).values()].sort(
    (a, b) => a.title.localeCompare(b.title),
  );

  return (
    <>
      <PageHeader title="Jurisdiction notes" backHref="/research" backLabel="Register" />

      <div className={styles.page}>
        <p className={styles.lede}>
          Keyed on reporting standard, venue and listing type — never on a company. An
          Australian holder and a United States holder can carry identical exposure and
          report opposite earnings, and a comparison that does not say which standard applies
          is comparing two different questions.
        </p>

        {notes.length === 0 ? (
          <p className={styles.empty}>
            No jurisdiction note has been entered yet. Start with the accounting models — they
            are the notes every record joins onto.
          </p>
        ) : (
          <ol className={styles.notes}>
            {notes.map((note) => (
              <li key={note.id} className={styles.note}>
                <div className={styles.noteHead}>
                  <h2 className={styles.noteTitle}>{note.title}</h2>
                  {note.isPublished ? null : (
                    <span className={styles.internal}>Internal — not signed off</span>
                  )}
                </div>

                <p className={styles.applies}>
                  {[
                    note.appliesToStandard ? `Standard: ${note.appliesToStandard}` : null,
                    note.appliesToVenue ? `Venue: ${note.appliesToVenue}` : null,
                    note.appliesToListingType ? `Listing: ${note.appliesToListingType}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>

                {note.body.split('\n\n').map((paragraph, index) => (
                  <p key={index} className={styles.body}>
                    {paragraph}
                  </p>
                ))}

                {note.ruleReference ? (
                  <p className={styles.rule}>
                    {/* The rule text, cited. Not commentary about the rule. */}
                    {note.ruleReference}
                    {note.primarySourceUrl ? (
                      <>
                        {' · '}
                        <a href={note.primarySourceUrl} rel="noreferrer">
                          Primary source
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
