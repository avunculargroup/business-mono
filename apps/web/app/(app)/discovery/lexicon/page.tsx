import { PageHeader } from '@/components/app-shell/PageHeader';
import { LexiconList } from '@/components/discovery/LexiconList';
import { getLexiconEntries } from '@/app/actions/lexicon';

export default async function LexiconPage() {
  const entries = await getLexiconEntries();

  return (
    <>
      <PageHeader title="Corporate Lexicon" />
      <LexiconList initialEntries={entries} />
    </>
  );
}
