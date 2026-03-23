import { PageHeader } from '@/components/app-shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import styles from './integrations.module.css';

const integrations = [
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

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" />
      <div className={styles.container}>
        <div className={styles.grid}>
          {integrations.map((integration) => (
            <Card key={integration.name} padding="md">
              <div className={styles.header}>
                <h3 className={styles.name}>{integration.name}</h3>
                <StatusChip label={integration.status} color="success" />
              </div>
              <p className={styles.description}>{integration.description}</p>
              <p className={styles.details}>{integration.details}</p>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
