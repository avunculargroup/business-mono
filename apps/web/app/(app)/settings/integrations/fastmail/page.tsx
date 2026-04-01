import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { FastmailSettingsClient } from './FastmailSettingsClient';

export default async function FastmailSettingsPage() {
  const supabase = await createClient();

  const [accountsRes, exclusionsRes, reviewRes, activityRes] = await Promise.all([
    supabase
      .from('fastmail_accounts')
      .select('id, username, display_name, is_active, created_at')
      .order('display_name', { ascending: true }),

    supabase
      .from('fastmail_exclusions')
      .select('id, type, value, notes, created_at')
      .order('type', { ascending: true })
      .order('value', { ascending: true }),

    supabase
      .from('contacts')
      .select('id, first_name, last_name, email, pipeline_stage, created_at')
      .eq('source', 'fastmail_sync')
      .contains('tags', ['needs-review'])
      .order('created_at', { ascending: false }),

    supabase
      .from('agent_activity')
      .select('*')
      .eq('trigger_type', 'system')
      .ilike('action', '%Fastmail email%')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return (
    <>
      <PageHeader title="Fastmail" />
      <FastmailSettingsClient
        accounts={accountsRes.data ?? []}
        exclusions={exclusionsRes.data ?? []}
        reviewContacts={reviewRes.data ?? []}
        recentActivity={activityRes.data ?? []}
      />
    </>
  );
}
