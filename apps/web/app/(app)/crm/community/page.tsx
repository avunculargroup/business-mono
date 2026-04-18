import { PageHeader } from '@/components/app-shell/PageHeader';
import { CommunityWatchlist } from '@/components/crm/CommunityWatchlist';
import { getCommunityEntries } from '@/app/actions/community';

export default async function CommunityPage() {
  const entries = await getCommunityEntries();

  return (
    <>
      <PageHeader title="Community Watchlist" />
      <CommunityWatchlist initialEntries={entries} />
    </>
  );
}
