import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { formatRelativeDate } from '@/lib/utils';
import styles from './RoutineTile.module.css';

interface RoutineSource {
  url: string;
  title?: string;
  excerpt?: string;
}

interface RoutineResult {
  summary?: string;
  digest?: string;
  sources?: RoutineSource[];
}

interface RoutineTileProps {
  routine: {
    id: string;
    name: string;
    dashboard_title: string | null;
    last_run_at: string | null;
    last_result: RoutineResult | null;
  };
}

export function RoutineTile({ routine }: RoutineTileProps) {
  const title = routine.dashboard_title || routine.name;
  const result = routine.last_result;
  const sources = result?.sources ?? [];

  return (
    <Card>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {routine.last_run_at && (
          <span className={styles.subtitle}>Last run {formatRelativeDate(routine.last_run_at)}</span>
        )}
      </div>

      {sources.length > 0 ? (
        <ul className={styles.list}>
          {sources.slice(0, 5).map((s) => (
            <li key={s.url} className={styles.item}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                {s.title || s.url}
              </a>
              {s.excerpt && <span className={styles.excerpt}>{s.excerpt}</span>}
            </li>
          ))}
        </ul>
      ) : result?.summary ? (
        <p className={styles.summary}>{result.summary.slice(0, 320)}</p>
      ) : (
        <p className={styles.empty}>Awaiting first run</p>
      )}

      <div className={styles.footer}>
        <Link href="/routines" className={styles.viewLink}>
          View routine →
        </Link>
      </div>
    </Card>
  );
}
