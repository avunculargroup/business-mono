import { PageHeader } from '@/components/app-shell/PageHeader';
import { TranscriptSearch } from './TranscriptSearch';

export const dynamic = 'force-dynamic';

export default function TranscriptSearchPage() {
  return (
    <>
      <PageHeader title="Search transcripts" backHref="/news/podcasts" backLabel="Podcast ingestion" />
      <TranscriptSearch />
    </>
  );
}
