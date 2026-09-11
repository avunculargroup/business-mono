'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AbsentFact,
  CompanyIdentity,
  Fact,
  PrepareTemplate,
  TemplateSection,
} from '@platform/data';
import { composePack, packProgress } from '@/lib/prepare/compose';
import {
  exportWorkingCopy,
  getPack,
  getSnapshot,
  importWorkingCopy,
  listResponses,
  responseKey,
  savePack,
  saveResponse,
  saveSnapshot,
  type StoredPack,
  type StoredResponse,
  type WorkingCopy,
} from '@/lib/prepare/store';
import { Freshness } from '@/components/Freshness';
import styles from '../prepare.module.css';

/**
 * The interview.
 *
 * Not a form and not a wall of headings. Each step is a **line of enquiry** and
 * shows four things: the question, why a board or auditor asks it, the bound
 * facts as labelled blocks, and a text field. It should feel like being
 * interviewed by someone competent rather than handed a template.
 *
 * Everything typed here goes to IndexedDB on blur and on a debounce, and
 * nowhere else. There is no save button, no unsaved-changes modal, and no
 * network call in this file — `lib/prepare/prose.test.ts` asserts the last of
 * those over the source.
 */
export function PackEditor({
  template,
  facts,
  absent,
  factsFetchedAt,
  identity,
  generalAdviceWarning,
  initialPackId,
}: {
  template: PrepareTemplate;
  facts: Fact[];
  absent: AbsentFact[];
  factsFetchedAt: string;
  identity: CompanyIdentity | null;
  generalAdviceWarning: string;
  initialPackId?: string;
}) {
  const [pack, setPack] = useState<StoredPack | null>(null);
  const [responses, setResponses] = useState<Map<string, StoredResponse>>(new Map());
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Open the named pack, or start one. Creating on open rather than on first
  // keystroke means a subscriber who types one sentence and closes the tab
  // still has a pack when they come back.
  useEffect(() => {
    let cancelled = false;

    async function open() {
      const id = initialPackId ?? crypto.randomUUID();
      const existing = initialPackId ? await getPack(initialPackId) : undefined;

      const now = new Date().toISOString();
      const opened: StoredPack = existing ?? {
        id,
        templateSlug: template.slug,
        templateVersion: template.version,
        artefactType: template.artefactType,
        title: template.title,
        status: 'in_progress',
        createdAt: now,
        updatedAt: now,
      };

      if (!existing) await savePack(opened);

      const stored = await listResponses(opened.id);
      const snapshot = await getSnapshot(opened.id);

      // Snapshot the facts the first time a pack is opened, so a refresh later
      // has something to diff against. Facts refresh; prose persists.
      if (!snapshot) {
        await saveSnapshot({ packId: opened.id, fetchedAt: factsFetchedAt, facts });
      }

      if (cancelled) return;
      setPack(opened);
      setResponses(new Map(stored.map((response) => [response.sectionId, response])));
    }

    open().catch(() => {
      // IndexedDB unavailable. The page stays readable and nothing is
      // persisted, which is better than a blank screen with no explanation.
      if (!cancelled) setPack(null);
    });

    return () => {
      cancelled = true;
    };
  }, [initialPackId, template, facts, factsFetchedAt]);

  const persist = useCallback(
    async (sectionId: string, body: string, skipped: boolean) => {
      if (!pack) return;

      const response: StoredResponse = {
        id: responseKey(pack.id, sectionId),
        packId: pack.id,
        sectionId,
        body,
        skipped,
        updatedAt: new Date().toISOString(),
      };

      await saveResponse(response);
      await savePack({ ...pack, updatedAt: response.updatedAt });

      setResponses((current) => new Map(current).set(sectionId, response));
      setSavedAt(response.updatedAt);
    },
    [pack],
  );

  if (!pack) {
    return (
      <p className={styles.localNotice}>
        This browser will not let Minute store anything on the device, so a pack cannot be
        started here. Private browsing and blocked site data are the usual causes.
      </p>
    );
  }

  const progress = packProgress(template, responses);

  return (
    <>
      {/* Counts, never a percentage. A percentage implies the document is a
          task to be finished rather than a piece of thinking to be done. */}
      <p className={styles.progress}>
        {progress.answered} of {progress.total} lines of enquiry addressed
        {progress.skipped > 0 ? `, ${progress.skipped} skipped` : ''}
        {savedAt ? ` · saved ${savedAt.slice(11, 16)}` : ''}
      </p>

      {template.sections.map((section) => (
        <Enquiry
          key={section.id}
          section={section}
          facts={facts.filter((fact) => section.facts.includes(fact.key))}
          absent={absent.filter((fact) => section.facts.includes(fact.key))}
          response={responses.get(section.id)}
          onPersist={persist}
        />
      ))}

      <Toolbar
        pack={pack}
        template={template}
        responses={responses}
        facts={facts}
        absent={absent}
        factsFetchedAt={factsFetchedAt}
        identity={identity}
        generalAdviceWarning={generalAdviceWarning}
      />
    </>
  );
}

function Enquiry({
  section,
  facts,
  absent,
  response,
  onPersist,
}: {
  section: TemplateSection;
  facts: Fact[];
  absent: AbsentFact[];
  response: StoredResponse | undefined;
  onPersist: (sectionId: string, body: string, skipped: boolean) => Promise<void>;
}) {
  const [body, setBody] = useState(response?.body ?? '');
  const [skipped, setSkipped] = useState(response?.skipped ?? false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rehydrate once the pack loads. Keyed on the stored value rather than on
  // every render, so it does not stamp over what is being typed.
  useEffect(() => {
    if (response) {
      setBody(response.body);
      setSkipped(response.skipped);
    }
  }, [response?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function change(next: string) {
    setBody(next);
    if (timer.current) clearTimeout(timer.current);
    // Autosave on a debounce as well as on blur. No save button and no
    // unsaved-changes modal: a document being written is not a form.
    timer.current = setTimeout(() => void onPersist(section.id, next, false), 800);
  }

  return (
    <section className={styles.enquiry}>
      <p className={styles.enquiryLabel}>Line of enquiry</p>
      <h2 className={styles.prompt}>{section.prompt}</h2>

      {/* The teaching layer — why a board or auditor asks this. It is what
          makes the pack worth more than a blank document with headings. */}
      <p className={styles.why}>{section.why}</p>

      {section.regulatoryReference ? (
        <p className={styles.enquiryLabel}>{section.regulatoryReference}</p>
      ) : null}

      {facts.length > 0 || absent.length > 0 ? (
        <div className={styles.factBlock}>
          {facts.map((fact) => (
            <div key={fact.key} className={styles.factRow}>
              <span className={styles.factLabel}>{fact.label}</span>
              {/* A labelled block, never interpolated into a sentence. A
                  sentence characterises what it contains; a row does not. */}
              <span className={styles.factValue}>
                {fact.value}
                {fact.unit ? ` ${fact.unit}` : ''}
              </span>
              <Freshness
                asAt={fact.asAt}
                {...(fact.expectedCadenceDays !== undefined
                  ? { expectedCadenceDays: fact.expectedCadenceDays }
                  : {})}
              />
              <span className={styles.factLabel}>{fact.sourceName}</span>
            </div>
          ))}
          {absent.map((fact) => (
            <div key={fact.key} className={styles.factRow}>
              <span className={styles.factLabel}>{fact.label}</span>
              {/* Absence as a fact, in the same block rather than omitted. */}
              <span className={styles.factAbsent}>Not available as at this date</span>
            </div>
          ))}
        </div>
      ) : null}

      <label>
        <span className="sr-only" />
        <textarea
          className={styles.textarea}
          value={body}
          onChange={(event) => change(event.target.value)}
          onBlur={() => void onPersist(section.id, body, skipped)}
          aria-label={section.prompt}
          disabled={skipped}
        />
      </label>

      <div className={styles.enquiryActions}>
        <button
          type="button"
          className={`${styles.skip} ${skipped ? styles.skipped : ''}`}
          onClick={() => {
            const next = !skipped;
            setSkipped(next);
            void onPersist(section.id, body, next);
          }}
        >
          {skipped ? 'Skipped — address this instead' : 'Skip this'}
        </button>
        {skipped ? (
          <span className={styles.saved}>
            Will appear in the export as &ldquo;Not addressed&rdquo;
          </span>
        ) : null}
      </div>
    </section>
  );
}

function Toolbar({
  pack,
  template,
  responses,
  facts,
  absent,
  factsFetchedAt,
  identity,
  generalAdviceWarning,
}: {
  pack: StoredPack;
  template: PrepareTemplate;
  responses: Map<string, StoredResponse>;
  facts: Fact[];
  absent: AbsentFact[];
  factsFetchedAt: string;
  identity: CompanyIdentity | null;
  generalAdviceWarning: string;
}) {
  function download(filename: string, contents: string, type: string) {
    // A blob and an object URL. The bytes never leave the browser — there is
    // no upload step and no server round trip, which is the point.
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    const markdown = composePack({
      pack,
      template,
      responses,
      facts,
      absent,
      identity,
      generalAdviceWarning,
      factsFetchedAt,
      now: new Date(),
    });

    download(`${pack.templateSlug}-${pack.id.slice(0, 8)}.md`, markdown, 'text/markdown');
  }

  async function downloadWorkingCopy() {
    const copy = await exportWorkingCopy(pack.id);
    download(
      `${pack.templateSlug}-working-copy-${pack.id.slice(0, 8)}.json`,
      JSON.stringify(copy, null, 2),
      'application/json',
    );
  }

  async function importFile(file: File) {
    const copy = JSON.parse(await file.text()) as WorkingCopy;
    // A new id, always. Importing over an existing pack is how someone loses an
    // afternoon's writing to a file they thought was newer.
    const id = await importWorkingCopy(copy, crypto.randomUUID());
    window.location.search = `?pack=${id}`;
  }

  return (
    <div className={styles.toolbar}>
      <button type="button" className={styles.action} onClick={exportMarkdown}>
        Export markdown
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.secondary}`}
        onClick={() => window.print()}
      >
        Print or save as PDF
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.secondary}`}
        onClick={() => void downloadWorkingCopy()}
      >
        Download working copy
      </button>
      <label className={`${styles.action} ${styles.secondary}`}>
        Import working copy
        <input
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </label>
    </div>
  );
}
