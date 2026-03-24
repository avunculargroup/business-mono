import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { TeamTable, type TeamMemberRow } from '@/components/settings/TeamTable';

export default async function TeamSettingsPage() {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from('team_members')
    .select('*')
    .order('full_name');

  return (
    <>
      <PageHeader title="Team Members" />
      <div style={{ padding: 'var(--space-6)', maxWidth: 'var(--content-max-width)' }}>
        <TeamTable members={(members || []) as TeamMemberRow[]} />
      </div>
    </>
  );
}
