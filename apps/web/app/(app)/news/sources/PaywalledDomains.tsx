'use client';

import { useState } from 'react';
import { Button } from '@platform/ui/Button';
import { useToast } from '@platform/ui/ToastProvider';
import { Plus, X } from 'lucide-react';
import { addPaywalledDomain, removePaywalledDomain } from '@/app/actions/newsSources';
import styles from './sources.module.css';

export interface PaywalledDomainRow {
  id: string;
  domain: string;
}

interface Props {
  initialDomains: PaywalledDomainRow[];
}

/**
 * The publishers the digest marks "Paywall" without needing to read the page —
 * the only way to flag sites that block the fetch. Ingestion reads this list;
 * articles already ingested keep the flag they were given.
 */
export function PaywalledDomains({ initialDomains }: Props) {
  const [domains, setDomains] = useState(initialDomains);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const { success, error } = useToast();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    const result = await addPaywalledDomain(draft);
    setAdding(false);
    if ('error' in result && result.error) return error(result.error);
    if ('domain' in result && result.domain) {
      const added = result.domain;
      setDomains((prev) => [...prev, added].sort((a, b) => a.domain.localeCompare(b.domain)));
      setDraft('');
      success(`${added.domain} added`);
    }
  };

  const handleRemove = async (row: PaywalledDomainRow) => {
    setRemoving(row.id);
    const result = await removePaywalledDomain(row.id);
    setRemoving(null);
    if ('error' in result && result.error) return error(result.error);
    setDomains((prev) => prev.filter((d) => d.id !== row.id));
    success(`${row.domain} removed`);
  };

  return (
    <section className={styles.healthPanel} aria-labelledby="paywalled-sites">
      <div className={styles.healthHeader}>
        <h2 id="paywalled-sites" className={styles.healthTitle}>
          Paywalled sites
        </h2>
        <p className={styles.healthIntro}>
          New articles from these sites, and their subdomains, are marked Paywall in the daily digest.
          Include metered sites. Articles from other sites are still marked when the page or its text
          shows a paywall.
        </p>
      </div>

      {domains.length > 0 ? (
        <ul className={styles.domainList}>
          {domains.map((row) => (
            <li key={row.id} className={styles.domainChip}>
              <span className={styles.mono}>{row.domain}</span>
              <button
                type="button"
                className={styles.domainRemove}
                onClick={() => handleRemove(row)}
                disabled={removing === row.id}
                aria-label={`Remove ${row.domain}`}
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.healthIntro}>No sites listed. Only page and text signals mark articles.</p>
      )}

      <form className={styles.domainForm} onSubmit={handleAdd}>
        <label htmlFor="paywalled-domain" className={styles.srOnly}>
          Site
        </label>
        <input
          id="paywalled-domain"
          className={`${styles.input} ${styles.inputMono}`}
          placeholder="bloomberg.com"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="secondary" loading={adding} disabled={!draft.trim()}>
          <Plus size={16} strokeWidth={1.5} />
          Add site
        </Button>
      </form>
    </section>
  );
}
