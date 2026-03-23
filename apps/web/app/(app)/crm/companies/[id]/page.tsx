import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import Link from 'next/link';
import { PipelineChip } from '@/components/ui/PipelineChip';
import styles from './company-detail.module.css';

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();

  if (!company) notFound();

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, pipeline_stage, email')
    .eq('company_id', id)
    .order('first_name');

  return (
    <>
      <PageHeader title={company.name} />
      <div className={styles.layout}>
        <aside className={styles.profile}>
          {company.industry && (
            <div className={styles.field}>
              <span className={styles.label}>Industry</span>
              <span>{company.industry}</span>
            </div>
          )}
          {company.size && (
            <div className={styles.field}>
              <span className={styles.label}>Size</span>
              <span>{company.size}</span>
            </div>
          )}
          {company.website && (
            <div className={styles.field}>
              <span className={styles.label}>Website</span>
              <a href={company.website} target="_blank" rel="noopener noreferrer">
                {company.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
          {company.notes && (
            <div className={styles.field}>
              <span className={styles.label}>Notes</span>
              <p className={styles.notes}>{company.notes}</p>
            </div>
          )}
        </aside>

        <div className={styles.main}>
          <h2 className={styles.sectionTitle}>Contacts</h2>
          {contacts && contacts.length > 0 ? (
            <div className={styles.contactList}>
              {contacts.map((c) => (
                <Link key={c.id} href={`/crm/contacts/${c.id}`} className={styles.contactRow}>
                  <span className={styles.contactName}>{c.first_name} {c.last_name}</span>
                  <PipelineChip stage={c.pipeline_stage} />
                  <span className={styles.contactEmail}>{c.email || ''}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No contacts at this company.</p>
          )}
        </div>
      </div>
    </>
  );
}
