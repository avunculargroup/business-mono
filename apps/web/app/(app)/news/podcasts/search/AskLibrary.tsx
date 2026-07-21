'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Play, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { askLibraryQuestion, getLibraryQuestion } from '@/app/actions/library';
import { formatTimestamp } from '@/lib/podcasts';
import type { LibraryCitation, LibraryQuestion } from '@platform/shared';
import styles from './search.module.css';

const MIN_QUESTION_LENGTH = 8;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90_000;

type AskState = 'idle' | 'thinking' | 'done' | 'error';

// Deep-link a citation to the episode page at the cited moment (?t= seeks the media).
function citationLink(c: LibraryCitation): string {
  const base = `/news/podcasts/${c.episode_id}`;
  return c.start_seconds != null ? `${base}?t=${Math.floor(c.start_seconds)}` : base;
}

export function AskLibrary() {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<AskState>('idle');
  const [answer, setAnswer] = useState<LibraryQuestion | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Guards against a stale poll updating state after a newer question is asked.
  const requestId = useRef(0);

  const poll = (id: string, startedAt: number, mine: number) => {
    const tick = async () => {
      if (requestId.current !== mine) return;
      const res = await getLibraryQuestion(id);
      if (requestId.current !== mine) return;
      if ('error' in res) {
        setState('error');
        setErrorMsg(res.error);
        return;
      }
      const q = res.question;
      if (q.status === 'answered' || q.status === 'failed') {
        setAnswer(q);
        setState(q.status === 'failed' ? 'error' : 'done');
        if (q.status === 'failed') setErrorMsg(q.error ?? 'The answer could not be generated.');
        return;
      }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setState('error');
        setErrorMsg('This is taking longer than expected. Try again in a moment.');
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    void tick();
  };

  const ask = async () => {
    const q = question.trim();
    if (q.length < MIN_QUESTION_LENGTH) return;
    const mine = requestId.current + 1;
    requestId.current = mine;
    setState('thinking');
    setAnswer(null);
    setErrorMsg(null);
    const res = await askLibraryQuestion(q);
    if (requestId.current !== mine) return;
    if ('error' in res) {
      setState('error');
      setErrorMsg(res.error);
      return;
    }
    poll(res.id, Date.now(), mine);
  };

  const flagged = answer?.lex_verdict && !answer.lex_verdict.passes;

  return (
    <section className={styles.ask}>
      <form
        className={styles.searchForm}
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <div className={styles.searchBox}>
          <Sparkles size={18} strokeWidth={1.5} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the library — e.g. how are companies accounting for bitcoin on the balance sheet?"
            aria-label="Ask the library a question"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={state === 'thinking'}
          disabled={question.trim().length < MIN_QUESTION_LENGTH}
        >
          Ask
        </Button>
      </form>
      <p className={styles.hint}>
        Get a short answer synthesised from what guests actually said, with citations that play the exact moment.
      </p>

      {state === 'thinking' && (
        <p className={styles.stateNote}>Reading the library and drafting an answer — this takes a few seconds.</p>
      )}

      {state === 'error' && errorMsg && <p className={styles.stateNote}>{errorMsg}</p>}

      {state === 'done' && answer && (
        answer.no_answer || !answer.answer ? (
          <p className={styles.stateNote}>
            The library doesn&rsquo;t cover that yet. Try rephrasing, or check that the relevant episodes are
            transcribed and in the research index.
          </p>
        ) : (
          <div className={styles.answer}>
            {flagged && (
              <div className={styles.answerFlag}>
                <ShieldAlert size={15} strokeWidth={1.5} />
                <span>
                  Compliance flagged this answer for review — treat as internal, don&rsquo;t share it externally.
                </span>
              </div>
            )}
            <p className={styles.answerText}>{answer.answer}</p>
            {answer.citations.length > 0 && (
              <ol className={styles.citations}>
                {answer.citations.map((c, i) => (
                  <li key={i} className={styles.citation}>
                    <Link href={citationLink(c)} className={styles.citationLink}>
                      <Play size={13} strokeWidth={1.5} />
                      <span className={styles.citationTitle}>{c.episode_title}</span>
                      {c.start_seconds != null && (
                        <span className={styles.citationStamp}>{formatTimestamp(c.start_seconds)}</span>
                      )}
                    </Link>
                    <p className={styles.citationQuote}>{c.quote}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )
      )}
    </section>
  );
}
