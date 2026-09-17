import type { Metadata } from 'next';
import Link from 'next/link';
import type { ClientType } from '@platform/data';
import { EmptyDay } from '@/components/EmptyDay';
import { LocalPacks } from './LocalPacks';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from './prepare.module.css';

export const metadata: Metadata = { title: 'Prepare' };

/**
 * What an empty list says, per fund type.
 *
 * The list is scoped to the account's `client_type` twice over — the RLS policy
 * filters on it and so does the adapter — so a trustee cannot see a corporate
 * template even when one is live, and vice versa. "No templates are available
 * yet" hides that: it reads as nothing published anywhere, which is a different
 * state with a different fix. Naming the scope is the difference between a
 * subscriber who knows what they are waiting for and one who files a bug.
 */
const NOTHING_FOR_THIS_TYPE: Record<ClientType, string> = {
  corporate:
    'Templates are published separately for companies and for self-managed funds, and '
    + 'none is live for a company yet. Every template is reviewed before it is '
    + 'published, because a template that states a conclusion would state it in every '
    + 'document generated from it.',
  smsf:
    'Templates are published separately for self-managed funds and for companies, and '
    + 'none is live for a self-managed fund yet. Every template is reviewed before it '
    + 'is published, because a template that states a conclusion would state it in '
    + 'every document generated from it.',
};

/**
 * `/prepare` — the reason a subscription renews.
 *
 * Everything else in Minute is a well-made version of something a determined
 * CFO could assemble given a weekend they do not have. This is the thing they
 * cannot produce at all: the artefact that carries a decision into a room with
 * a board, a co-trustee or an auditor in it.
 *
 * Templates come from the server; packs come from the device. The split is the
 * whole design, so the page renders the two lists separately and the second one
 * is a client component, because the server has never seen it and cannot.
 */
export default async function PreparePage() {
  const repositories = await requireClientRepositories();
  const ctx = readContext();

  const session = await repositories.session.current(ctx);
  const clientType: ClientType = session?.clientType ?? 'corporate';
  const templates = await repositories.prepare.templates(ctx, clientType);

  return (
    <>
      <header className={page.header}>
        <h1 className={page.title}>Prepare</h1>
        <p className={page.lede}>
          Work through a structured set of questions and take away a document that reads as
          though someone who understood the obligations wrote it. The questions are ours. The
          answers are yours, and they stay on this device.
        </p>
      </header>

      {/* Said once, plainly, at the top. No modal, no "are you sure", no
          repetition — the honest cost of local-only storage, stated. */}
      <p className={styles.localNotice}>
        Packs are stored in this browser on this device. They are never sent to Bitcoin
        Treasury Solutions and we cannot recover one for you. Use{' '}
        <strong>Download working copy</strong> to keep a backup, or to hand a draft to a
        co-trustee.
      </p>

      <section className={page.section}>
        <h2 className={page.sectionTitle}>Start something</h2>

        {templates.length === 0 ? (
          <EmptyDay
            headline="No templates are available yet"
            detail={NOTHING_FOR_THIS_TYPE[clientType]}
          />
        ) : (
          <div className={styles.templates}>
            {templates.map((template) => (
              <Link
                key={template.slug}
                href={`/prepare/${template.slug}`}
                className={styles.template}
              >
                <h3 className={styles.templateTitle}>{template.title}</h3>
                <p className={styles.templateMeta}>
                  {template.sections.length} lines of enquiry · version {template.version}
                </p>
                {template.regulatoryReferences.length > 0 ? (
                  <div className={styles.references}>
                    {template.regulatoryReferences.map((reference) => (
                      <span key={reference} className={styles.reference}>
                        {reference}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <LocalPacks />
    </>
  );
}
