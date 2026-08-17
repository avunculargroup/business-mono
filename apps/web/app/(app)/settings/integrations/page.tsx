import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { Card } from '@platform/ui/Card';
import { StatusChip } from '@platform/ui/StatusChip';
import styles from './integrations.module.css';

const staticIntegrations = [
  {
    name: 'Signal CLI',
    description: 'Messaging sidecar for director communication',
    status: 'configured',
    details: 'Deployed via Docker on Railway',
  },
  {
    name: 'Telnyx',
    description: 'Voice API for phone call recording',
    status: 'configured',
    details: 'Webhook: /webhooks/telnyx',
  },
  {
    name: 'Deepgram',
    description: 'Speech-to-text transcription (Nova-3)',
    status: 'configured',
    details: 'Webhook: /webhooks/deepgram',
  },
  {
    name: 'Supabase',
    description: 'Database, auth, real-time, and storage',
    status: 'connected',
    details: 'PostgreSQL + pgvector',
  },
];

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const [{ count: activeAccountCount }, { count: linkedinCredentialCount }] = await Promise.all([
    supabase
      .from('fastmail_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('social_credentials')
      .select('*', { count: 'exact', head: true })
      .eq('provider', 'linkedin'),
  ]);

  const fastmailConfigured = (activeAccountCount ?? 0) > 0;
  const linkedinConfigured = (linkedinCredentialCount ?? 0) > 0;

  return (
    <>
      <PageHeader title="Integrations" />
      <div className={styles.container}>
        <div className={styles.grid}>
          {staticIntegrations.map((integration) => (
            <Card key={integration.name} padding="md">
              <div className={styles.header}>
                <h3 className={styles.name}>{integration.name}</h3>
                <StatusChip label={integration.status} color="success" />
              </div>
              <p className={styles.description}>{integration.description}</p>
              <p className={styles.details}>{integration.details}</p>
            </Card>
          ))}

          {/* Fastmail — dynamic, links to management page */}
          <Link href="/settings/integrations/fastmail" style={{ textDecoration: 'none' }}>
            <Card padding="md" hoverable>
              <div className={styles.header}>
                <h3 className={styles.name}>Fastmail</h3>
                <StatusChip
                  label={fastmailConfigured ? 'configured' : 'needs setup'}
                  color={fastmailConfigured ? 'success' : 'warning'}
                />
              </div>
              <p className={styles.description}>
                JMAP email sync — logs inbound and outbound emails to CRM contacts
              </p>
              <p className={styles.details}>
                {fastmailConfigured
                  ? `${activeAccountCount} active account${activeAccountCount === 1 ? '' : 's'} · 5-minute polling`
                  : 'No accounts connected — click to configure'}
              </p>
            </Card>
          </Link>

          {/* LinkedIn — dynamic, links to management page */}
          <Link href="/settings/integrations/linkedin" style={{ textDecoration: 'none' }}>
            <Card padding="md" hoverable>
              <div className={styles.header}>
                <h3 className={styles.name}>LinkedIn</h3>
                <StatusChip
                  label={linkedinConfigured ? 'configured' : 'needs setup'}
                  color={linkedinConfigured ? 'success' : 'warning'}
                />
              </div>
              <p className={styles.description}>
                API posting for founder profiles and the company page — schedule from /content
              </p>
              <p className={styles.details}>
                {linkedinConfigured
                  ? `${linkedinCredentialCount} connected account${linkedinCredentialCount === 1 ? '' : 's'} · tokens last 60 days`
                  : 'No accounts connected — click to configure'}
              </p>
            </Card>
          </Link>
        </div>
      </div>
    </>
  );
}
