import { getRepositories, demoReadContext } from '@/lib/repositories';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

export default async function CompaniesPage() {
  const { companies } = getRepositories();
  const { items, total } = await companies.listCompanies(demoReadContext());

  return (
    <Page
      title="Companies"
      lede={`${total} in the demo set. The CRM is where email, call transcripts and meeting notes land as interactions against the right contact, without anyone filing them.`}
    >
      <div className={styles.grid}>
        {items.map((company) => (
          <article key={company.id} className={styles.card}>
            <div className={styles.cardTitle}>{company.name}</div>
            <div className={styles.meta}>
              {company.industry ? <span>{company.industry}</span> : null}
              {company.size ? <span>{company.size}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}
