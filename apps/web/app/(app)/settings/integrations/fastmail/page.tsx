import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { FastmailSettingsClient } from './FastmailSettingsClient';

export default async function FastmailSettingsPage() {
  const supabase = await createClient();

  const [accountsRes, syncRes, exclusionsRes, reviewRes, activityRes] = await Promise.all([
    supabase
      .from('fastmail_accounts')
      .select(
        'id, username, display_name, is_active, watched_addresses, last_error, last_error_at, consecutive_failures, created_at',
      )
      .order('display_name', { ascending: true }),

    supabase
      .from('fastmail_sync_state')
      .select('account_id, last_synced_at'),

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

  const lastSyncByAccount = new Map<string, string | null>(
    (syncRes.data ?? []).map((row) => [row.account_id, row.last_synced_at]),
  );

  const accounts = (accountsRes.data ?? []).map((a) => ({
    ...a,
    last_synced_at: lastSyncByAccount.get(a.id) ?? null,
  }));

  return (
    <>
      <PageHeader title="Fastmail" />
      <FastmailSettingsClient
        accounts={accounts}
        exclusions={exclusionsRes.data ?? []}
        reviewContacts={reviewRes.data ?? []}
        recentActivity={activityRes.data ?? []}
      />
    </>
  );
}
