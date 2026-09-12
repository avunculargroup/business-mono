'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { createLibraryEntry, createLibrarySection } from '@/app/actions/clientLibrary';
import styles from './compliance.module.css';

export interface LibrarySectionRow {
  id: string;
  key: string;
  title: string;
  clientType: string;
  entries: Array<{ id: string; slug: string; title: string; status: string }>;
}

/**
 * The Minute library, as something a founder can fill.
 *
 * `/library` in the client app renders sections that have at least one entry,
 * so an empty library is an empty page — quietly, which is how it stayed empty
 * without anyone noticing. Creating is here; publishing is the Lex queue below,
 * because `published_requires_lex_review` makes review the precondition and one
 * publish path is better than two.
 */
export function LibrarySections({ sections }: { sections: LibrarySectionRow[] }) {
  const [addingSection, setAddingSection] = useState(false);
  const [addingEntryTo, setAddingEntryTo] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={styles.primaryButton}
        onClick={() => setAddingSection((open) => !open)}
      >
        <Plus size={16} strokeWidth={1.5} />
        {addingSection ? 'Cancel' : 'New section'}
      </button>

      {addingSection && <SectionForm onDone={() => setAddingSection(false)} />}

      {sections.length === 0 ? (
        <p className={styles.empty}>
          No sections. `/library` shows sections that have at least one entry, so until there is
          one the route renders nothing to a subscriber.
        </p>
      ) : (
        <ul className={styles.list}>
          {sections.map((section) => (
            <li key={section.id} className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>{section.title}</h3>
                  <p className={styles.cardDetail}>
                    <code className={styles.slug}>{section.key}</code> ·{' '}
                    {section.clientType === 'both'
                      ? 'Both client types'
                      : section.clientType === 'smsf'
                        ? 'SMSF only'
                        : 'Corporate only'}
                  </p>
                </div>
              </div>

              {section.entries.length === 0 ? (
                <p className={styles.empty}>
                  No entries, so this section does not appear in Minute at all.
                </p>
              ) : (
                <ul className={styles.entryList}>
                  {section.entries.map((entry) => (
                    <li key={entry.id} className={styles.entryRow}>
                      <span>{entry.title}</span>
                      <span className={styles.statusBadge}>{entry.status}</span>
                    </li>
                  ))}
                </ul>
              )}

              {addingEntryTo === section.id ? (
                <EntryForm sectionId={section.id} onDone={() => setAddingEntryTo(null)} />
              ) : (
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => setAddingEntryTo(section.id)}
                >
                  <Plus size={16} strokeWidth={1.5} />
                  Add an entry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function SectionForm({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const [clientType, setClientType] = useState<'corporate' | 'smsf' | 'both'>('both');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createLibrarySection({ key, title, clientType });
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form className={styles.card} onSubmit={submit}>
      <label className={styles.label} htmlFor="section-title">
        Title
      </label>
      <input
        id="section-title"
        className={styles.input}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Custody models"
      />

      <label className={styles.label} htmlFor="section-key">
        Key
      </label>
      <input
        id="section-key"
        className={styles.input}
        value={key}
        onChange={(event) => setKey(event.target.value)}
        placeholder="custody-models"
      />
      <p className={styles.hint}>
        Stable and referenced from elsewhere. A title can be reworded freely; a key cannot.
      </p>

      <label className={styles.label} htmlFor="section-client-type">
        Who sees it
      </label>
      <select
        id="section-client-type"
        className={styles.input}
        value={clientType}
        onChange={(event) => setClientType(event.target.value as 'corporate' | 'smsf' | 'both')}
      >
        <option value="both">Both client types</option>
        <option value="corporate">Corporate only</option>
        <option value="smsf">SMSF only</option>
      </select>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button type="submit" className={styles.primaryButton} disabled={pending}>
        {pending ? 'Creating…' : 'Create section'}
      </button>
    </form>
  );
}

function EntryForm({ sectionId, onDone }: { sectionId: string; onDone: () => void }) {
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [references, setReferences] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createLibraryEntry({
        sectionId,
        slug,
        title,
        body,
        regulatoryReferences: references
          .split(',')
          .map((reference) => reference.trim())
          .filter(Boolean),
      });
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label} htmlFor={`entry-title-${sectionId}`}>
        Title
      </label>
      <input
        id={`entry-title-${sectionId}`}
        className={styles.input}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      <label className={styles.label} htmlFor={`entry-slug-${sectionId}`}>
        Slug
      </label>
      <input
        id={`entry-slug-${sectionId}`}
        className={styles.input}
        value={slug}
        onChange={(event) => setSlug(event.target.value)}
        placeholder="what-custody-means"
      />

      <label className={styles.label} htmlFor={`entry-body-${sectionId}`}>
        Body
      </label>
      <textarea
        id={`entry-body-${sectionId}`}
        className={styles.bodyTextarea}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <p className={styles.hint}>
        Markdown, and no parser behind it — unlike a `/prepare` template there is nothing to
        validate, so this saves whatever you write. It ships as a draft and reaches a subscriber
        only through the review queue below.
      </p>

      <label className={styles.label} htmlFor={`entry-refs-${sectionId}`}>
        Regulatory references
      </label>
      <input
        id={`entry-refs-${sectionId}`}
        className={styles.input}
        value={references}
        onChange={(event) => setReferences(event.target.value)}
        placeholder="SIS Reg 4.09, AASB 138"
      />
      <p className={styles.hint}>Comma separated. Leave empty if the entry cites none.</p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={pending}>
          {pending ? 'Creating…' : 'Create entry'}
        </button>
        <button type="button" className={styles.ghostButton} onClick={onDone} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
