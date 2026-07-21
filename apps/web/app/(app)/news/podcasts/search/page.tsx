import { PageHeader } from '@/components/app-shell/PageHeader';
import { AskLibrary } from './AskLibrary';
import { TranscriptSearch } from './TranscriptSearch';
import styles from './search.module.css';

export const dynamic = 'force-dynamic';

export default function TranscriptSearchPage() {
  return (
    <>
      <PageHeader title="Ask the library" backHref="/news/podcasts" backLabel="Podcast ingestion" />
      <AskLibrary />
      <div className={styles.sectionDivider}>
        <h2 className={styles.sectionHeading}>Or find exact passages</h2>
      </div>
      <TranscriptSearch />
    </>
  );
}
