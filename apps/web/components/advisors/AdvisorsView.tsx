'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Handshake, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { StatusChip } from '@/components/ui/StatusChip';
import { AdvisorForm } from './AdvisorForm';
import { getInitials } from '@/lib/utils';
import styles from '@/app/(app)/advisors/advisors.module.css';

export type AdvisorRow = {
  id: string;
  name: string;
  type: 'advisor' | 'partner';
  specialization: string | null;
  active: boolean;
  logo_url: string | null;
  company_id: string | null;
  key_relationship_id: string | null;
  companies: { name: string } | null;
  team_members: { full_name: string } | null;
};

interface AdvisorsViewProps {
  advisors: AdvisorRow[];
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
}

export function AdvisorsView({ advisors: initialAdvisors, companies, teamMembers }: AdvisorsViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [advisors, setAdvisors] = useState(initialAdvisors);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreated = useCallback((advisor: AdvisorRow) => {
    setAdvisors((prev) => [advisor, ...prev]);
    setShowCreate(false);
  }, []);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-4) var(--space-6) 0' }}>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add advisor
        </Button>
      </div>

      <div className={styles.container}>
        {advisors.length > 0 ? (
          <div className={styles.grid}>
            {advisors.map((advisor) => (
              <Link key={advisor.id} href={`/advisors/${advisor.id}`} className={styles.cardLink}>
                <Card hoverable padding="md">
                  <div className={styles.cardTopRow}>
                    <div className={styles.avatar}>
                      {advisor.logo_url ? (
                        <img src={advisor.logo_url} alt={`${advisor.name} logo`} />
                      ) : (
                        getInitials(advisor.name)
                      )}
                    </div>
                    <div className={styles.cardTopInfo}>
                      <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>{advisor.name}</h3>
                        <StatusChip
                          label={advisor.type === 'advisor' ? 'Advisor' : 'Partner'}
                          color="neutral"
                        />
                      </div>
                      {advisor.specialization && (
                        <p className={styles.specialization}>{advisor.specialization}</p>
                      )}
                    </div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.statusRow}>
                      <span className={`${styles.dot} ${advisor.active ? styles.dotActive : styles.dotInactive}`} />
                      {advisor.active ? 'Active' : 'Inactive'}
                    </span>
                    {advisor.companies?.name && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {advisor.companies.name}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <Handshake size={48} strokeWidth={1} />
            <h3>No advisors or partners yet</h3>
            <p>Track advisors who support BTS and partners who deliver alongside you.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add advisor</Button>
          </div>
        )}
      </div>

      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add advisor or partner"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="advisor-form" loading={isSubmitting}>Save</Button>
          </>
        }
      >
        <AdvisorForm
          companies={companies}
          teamMembers={teamMembers}
          onSuccess={handleCreated}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>
    </>
  );
}
