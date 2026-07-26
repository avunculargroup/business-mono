import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { LinkedInSettingsClient, type LinkedInAccountRow } from './LinkedInSettingsClient';

export default async function LinkedInSettingsPage() {
  const supabase = await createClient();

  const [accountsRes, credentialsRes] = await Promise.all([
    supabase
      .from('social_accounts')
      .select('id, display_name, handle, account_type, is_active')
      .eq('platform', 'linkedin')
      .order('account_type', { ascending: false }) // founders first, company last
      .order('display_name', { ascending: true }),

    // Never select access_token — connection state only.
    supabase
      .from('social_credentials')
      .select('social_account_id, author_urn, expires_at, last_error, last_error_at, consecutive_failures, updated_at'),
  ]);

  const credentialByAccount = new Map(
    (credentialsRes.data ?? []).map((c) => [c.social_account_id, c]),
  );

  const accounts: LinkedInAccountRow[] = (accountsRes.data ?? []).map((a) => ({
    ...a,
    credential: credentialByAccount.get(a.id) ?? null,
  }));

  return (
    <>
      <PageHeader title="LinkedIn" />
      <LinkedInSettingsClient accounts={accounts} />
    </>
  );
}
