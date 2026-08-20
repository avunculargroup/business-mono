import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import Link from 'next/link';
import { PipelineChip } from '@platform/ui/PipelineChip';
import styles from './company-detail.module.css';

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = resolveReadContext();
  const repositories = await getRepositories();

  // The route param may be a slug; the repository resolves either form.
  const company = await repositories.companies.getCompany(ctx, id);
  if (!company) notFound();

  const contacts = await repositories.companies.listCompanyContacts(ctx, company.id);

  return (
    <>
      <PageHeader title={company.name} backHref="/crm/companies" />
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
          {contacts.length > 0 ? (
            <div className={styles.contactList}>
              {contacts.map((c) => (
                <Link key={c.id} href={`/crm/contacts/${c.slug}`} className={styles.contactRow}>
                  <span className={styles.contactName}>{c.firstName} {c.lastName}</span>
                  <PipelineChip stage={c.pipelineStage} />
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
