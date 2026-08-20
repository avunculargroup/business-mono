import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

export default async function ContentPage() {
  const { content } = getRepositories();
  const ctx = demoReadContext();
  const { items } = await content.listCards(ctx);

  // The verdict lives on the publish gate rather than on the card, because it
  // is read when someone tries to publish. Shown here so the board says *why*
  // an item is stuck rather than only that it is.
  const gates = await Promise.all(items.map((card) => content.getPublishGate(ctx, card.id)));

  return (
    <Page
      title="Content"
      lede="Drafts move idea → draft → review → approved → published, and nothing reaches a public channel without a human approving it and a compliance verdict clearing it. That gate never graduates to autonomous."
    >
      <div className={styles.grid}>
        {items.map((card, index) => {
          const verdict = gates[index]?.complianceStatus ?? null;

          return (
            <article key={card.id} className={styles.card}>
              <div className={styles.cardTitle}>{card.title}</div>
              <div className={styles.meta}>
                <span data-annotation-id={card.status === 'draft' ? 'pipeline-status' : undefined}>
                  {card.status}
                </span>
                <span>{card.type}</span>
                {card.accountName ? <span>{card.accountName}</span> : null}
                {verdict ? (
                  <span
                    // Only the flagged one is annotated: a verdict that cleared
                    // demonstrates nothing a reader would not assume, and the
                    // point of the surface is that the gate can say no.
                    data-annotation-id={verdict === 'flagged' ? 'compliance-verdict' : undefined}
                  >
                    compliance: {verdict}
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </Page>
  );
}
