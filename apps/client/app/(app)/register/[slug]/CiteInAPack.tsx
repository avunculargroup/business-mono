'use client';

import { useEffect, useState } from 'react';
import type { Fact } from '@platform/data';
import {
  citationKey,
  listCitations,
  listPacks,
  removeCitation,
  saveCitation,
  type StoredCitation,
  type StoredPack,
} from '@/lib/prepare/store';
import styles from '../register.module.css';

/**
 * **Cite in a pack** — the join between `/register` and `/prepare`.
 *
 * The two are the same feature at two stages: gathering evidence, and
 * assembling it. Before this existed they did not know about each other, and
 * the register read like a list of holdings to browse. With it, someone using
 * the register is visibly building a case — which is what makes the register's
 * purpose legible from the interface rather than from a disclaimer.
 *
 * A client component because the packs are in IndexedDB and the server has
 * never seen one. Same reason as `LocalPacks`, and the same boundary.
 *
 * The fact travels whole: same `Fact` shape, same provenance, so a cited fact
 * renders in the pack exactly as a bound one does and carries its source into
 * the appendix.
 */
export function CiteInAPack({
  fact,
  entitySlug,
  entityName,
}: {
  fact: Fact;
  entitySlug: string;
  entityName: string;
}) {
  const [packs, setPacks] = useState<StoredPack[] | null>(null);
  const [cited, setCited] = useState<Map<string, StoredCitation>>(new Map());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function load() {
      // Only packs that can actually hold a citation. A pack whose template has
      // no precedent section is not offered, rather than silently accepting a
      // fact that would then render nowhere — a trustee minute records a
      // meeting, not a literature review, and correctly has no such section.
      const inProgress = (await listPacks()).filter(
        (pack) => pack.status === 'in_progress' && pack.acceptsCitations,
      );
      setPacks(inProgress);

      const existing = await Promise.all(
        inProgress.map((pack) => listCitations(pack.id)),
      );
      setCited(
        new Map(
          existing
            .flat()
            .filter((citation) => citation.fact.key === fact.key)
            .map((citation) => [citation.packId, citation]),
        ),
      );
    }

    // IndexedDB unavailable — private browsing, blocked site data. The register
    // still reads; only the cite action is missing, which is the right thing to
    // lose.
    load().catch(() => setPacks([]));
  }, [fact.key]);

  if (packs === null) return null;

  if (packs.length === 0) {
    return (
      <span
        className={styles.citeNone}
        title="Open a pack with a precedent section — a board paper — to cite facts into it"
      >
        No pack to cite into
      </span>
    );
  }

  async function cite(pack: StoredPack) {
    const existing = cited.get(pack.id);

    if (existing) {
      await removeCitation(existing.id);
      setCited((current) => {
        const next = new Map(current);
        next.delete(pack.id);
        return next;
      });
      return;
    }

    const citation: StoredCitation = {
      id: citationKey(pack.id, fact.key),
      packId: pack.id,
      entitySlug,
      entityName,
      fact,
      citedAt: new Date().toISOString(),
    };

    await saveCitation(citation);
    setCited((current) => new Map(current).set(pack.id, citation));
  }

  return (
    <span className={styles.cite}>
      <button
        type="button"
        className={styles.citeButton}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {cited.size > 0 ? `Cited in ${cited.size}` : 'Cite in a pack'}
      </button>

      {open ? (
        <span className={styles.citeMenu} role="group" aria-label={`Cite ${fact.label}`}>
          {packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className={styles.citeOption}
              onClick={() => void cite(pack)}
            >
              <span>{cited.has(pack.id) ? '✓ ' : ''}</span>
              {pack.title}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
