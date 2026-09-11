import type { Metadata } from 'next';
import type { ClientType, Signal } from '@platform/data';
import { EmptyDay } from '@/components/EmptyDay';
import { Freshness } from '@/components/Freshness';
import { requireClientRepositories, readContext } from '@/lib/repositories';
import page from '@/components/Page.module.css';
import styles from './signals.module.css';

export const metadata: Metadata = { title: 'Signals' };

/**
 * Categories that matter most to each persona, most-relevant first.
 *
 * `client_type` weights ordering and hides nothing from either. A trustee cares
 * first about whether a provider is still registered and who is holding the
 * keys; a CFO cares first about what the accountants and the treasury tooling
 * are doing. Both see the whole feed.
 */
const WEIGHTS: Record<ClientType, readonly string[]> = {
  smsf: ['registration_status', 'licensing', 'custody', 'attestation', 'security'],
  corporate: ['accounting', 'treasury', 'licensing', 'registration_status', 'custody'],
};

function weight(signal: Signal, clientType: ClientType): number {
  const order = WEIGHTS[clientType];
  const index = order.findIndex((prefix) => signal.changeType.startsWith(prefix));
  return index === -1 ? order.length : index;
}

export default async function SignalsPage() {
  const repositories = await requireClientRepositories();
  const ctx = readContext();

  const [session, signals] = await Promise.all([
    repositories.session.current(ctx),
    repositories.signals.list(ctx, { limit: 100 }),
  ]);

  const clientType: ClientType = session?.clientType ?? 'corporate';

  // Sorted by relevance to the persona, then by recency. Stable within a
  // weight band, so the underlying date ordering from the adapter survives.
  const ordered = [...signals].sort((a, b) => weight(a, clientType) - weight(b, clientType));

  return (
    <>
      <header className={page.header}>
        <h1 className={page.title}>Signals</h1>
        <p className={page.lede}>
          What has changed at the vendors, registers and standards that matter. Every entry is
          a stated change with a date and a source. A release is an event, not news — nothing
          here is characterised as good or bad.
        </p>
      </header>

      {ordered.length === 0 ? (
        <EmptyDay
          headline="Nothing has changed"
          detail={
            'No monitored provider, register or standard has moved in a way worth reporting. '
            + 'A quiet week in this feed is a good week, and it is the usual one.'
          }
        />
      ) : (
        <ul className={styles.list}>
          {ordered.map((signal) => (
            <SignalRow key={signal.id} signal={signal} />
          ))}
        </ul>
      )}
    </>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  return (
    <li className={`${styles.signal} ${signal.isAbsenceSignal ? styles.absence : ''}`}>
      <div className={styles.head}>
        <h2 className={styles.entity}>{signal.entityName}</h2>
        <span className={styles.changeType}>{signal.changeType.replace(/_/g, ' ')}</span>
        {signal.isAbsenceSignal ? (
          <span className={styles.changeType}>expected, not observed</span>
        ) : null}
      </div>

      <div className={styles.transition}>
        {signal.previousState ? (
          <>
            <span className={styles.state}>{signal.previousState}</span>
            <span className={styles.arrow} aria-label="changed to">
              →
            </span>
          </>
        ) : null}
        <span className={styles.state}>{signal.currentState}</span>
      </div>

      {signal.clientNote ? (
        /* client_note, never curator_note. The internal note is written for a
           director and is allowed to have a view; it is not even in the query. */
        <p className={styles.note}>{signal.clientNote}</p>
      ) : null}

      <div className={styles.rail}>
        <Freshness asAt={signal.observedAt} />
        <span>
          {signal.provenance.sourceUrl ? (
            <a href={signal.provenance.sourceUrl} target="_blank" rel="noreferrer noopener">
              {signal.provenance.sourceName}
            </a>
          ) : (
            signal.provenance.sourceName
          )}
        </span>
        <span>{signal.provenance.basis}</span>
      </div>
    </li>
  );
}
