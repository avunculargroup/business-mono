import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { formatRelativeDate, formatTimeInTz } from '@/lib/utils';
import { cleanNewsTitle } from '@/lib/news/cleanTitle';
import styles from './RoutineTile.module.css';

interface RoutineSource {
  url: string;
  title?: string;
  excerpt?: string;
  source?: string;
}

interface RoutineResult {
  summary?: string;
  digest?: string;
  sources?: RoutineSource[];
  metadata?: {
    mood_summary?: string;
    more_news_url?: string;
    headline_image_url?: string;
  };
}

interface RoutineTileProps {
  routine: {
    id: string;
    name: string;
    dashboard_title: string | null;
    last_run_at: string | null;
    last_result: RoutineResult | null;
    timezone: string;
  };
}

export function RoutineTile({ routine }: RoutineTileProps) {
  const title = routine.dashboard_title || routine.name;
  const result = routine.last_result;
  const sources = result?.sources ?? [];
  const mood = result?.metadata?.mood_summary;
  const moreNewsUrl = result?.metadata?.more_news_url;
  const headlineImage = result?.metadata?.headline_image_url;

  return (
    <Card>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {routine.last_run_at && (
          <span className={styles.subtitle}>
            Last run {formatRelativeDate(routine.last_run_at, routine.timezone)},{' '}
            {formatTimeInTz(routine.last_run_at, routine.timezone)}
          </span>
        )}
      </div>

      {headlineImage && (
        // eslint-disable-next-line @next/next/no-img-element -- remote, unknown host; avoids next/image remotePatterns config
        <img src={headlineImage} alt="" className={styles.headlineImage} />
      )}

      {mood && <p className={styles.summary}>{mood}</p>}

      {sources.length > 0 ? (
        <ul className={styles.list}>
          {sources.slice(0, 6).map((s) => (
            <li key={s.url} className={styles.item}>
              <span className={styles.headline}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {s.title ? cleanNewsTitle(s.title) : s.url}
                </a>
                {s.source && <span className={styles.source}>{s.source}</span>}
              </span>
              {s.excerpt && <span className={styles.excerpt}>{s.excerpt}</span>}
            </li>
          ))}
        </ul>
      ) : mood ? null : result?.summary ? (
        <p className={styles.summary}>{result.summary.slice(0, 320)}</p>
      ) : (
        <p className={styles.empty}>Awaiting first run</p>
      )}

      <div className={styles.footer}>
        {moreNewsUrl ? (
          <Link href={moreNewsUrl} className={styles.viewLink}>
            More news →
          </Link>
        ) : (
          <Link href="/routines" className={styles.viewLink}>
            View routine →
          </Link>
        )}
      </div>
    </Card>
  );
}
