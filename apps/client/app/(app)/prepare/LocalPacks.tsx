'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listPacks, type StoredPack } from '@/lib/prepare/store';
import page from '@/components/Page.module.css';
import styles from './prepare.module.css';

/**
 * Packs on this device.
 *
 * A client component because it has to be: the packs live in IndexedDB and the
 * server has never seen one. That is not a rendering inconvenience, it is the
 * general advice boundary — if this list could be server-rendered, the prose
 * would be on a server.
 */
export function LocalPacks() {
  const [packs, setPacks] = useState<StoredPack[] | null>(null);

  useEffect(() => {
    listPacks()
      .then(setPacks)
      // A browser with IndexedDB unavailable — private mode in some browsers,
      // storage blocked — gets an empty list rather than a broken page. The
      // notice above already says packs live on the device; this is that being
      // true in the unhappy case.
      .catch(() => setPacks([]));
  }, []);

  if (packs === null) return null;

  return (
    <section className={page.section}>
      <h2 className={page.sectionTitle}>On this device</h2>

      {packs.length === 0 ? (
        <p className={page.lede}>
          Nothing in progress. Start from a template above, or import a working copy someone
          has sent you from the pack screen.
        </p>
      ) : (
        <ul className={styles.packs}>
          {packs.map((pack) => (
            <li key={pack.id} className={styles.pack}>
              <Link href={`/prepare/${pack.templateSlug}?pack=${pack.id}`} className={styles.packTitle}>
                {pack.title}
              </Link>
              <span className={styles.packMeta}>
                {pack.status === 'complete' ? 'complete' : 'in progress'}
              </span>
              <span className={styles.packMeta}>updated {pack.updatedAt.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
