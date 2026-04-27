'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { StatusChip } from '@/components/ui/StatusChip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/providers/ToastProvider';
import { deleteAdvisor, removeAdvisorContact } from '@/app/actions/advisors';
import { AdvisorEditForm } from './AdvisorEditForm';
import { AdvisorContactForm } from './AdvisorContactForm';
import { getInitials, formatDate } from '@/lib/utils';
import styles from '@/app/(app)/advisors/[id]/advisor-detail.module.css';

const engagementLabels: Record<string, string> = {
  ongoing_retainer: 'Ongoing retainer',
  project_based:    'Project based',
  ad_hoc:           'Ad hoc',
  revenue_share:    'Revenue share',
  honorary:         'Honorary',
};

const interactionTypeLabels: Record<string, string> = {
  call: 'Call', email: 'Email', meeting: 'Meeting', zoom: 'Zoom',
  signal: 'Signal', linkedin: 'LinkedIn', note: 'Note', other: 'Other',
};

type Advisor = {
  id: string;
  name: string;
  type: 'advisor' | 'partner';
  specialization: string | null;
  engagement_model: string | null;
  rate_notes: string | null;
  bio: string | null;
  logo_url: string | null;
  website: string | null;
  linkedin_url: string | null;
  active: boolean;
  company_id: string | null;
  key_relationship_id: string | null;
  companies: { id: string; name: string } | null;
  key_relationship: { id: string; full_name: string } | null;
};

type AdvisorContact = {
  id: string;
  role: string | null;
  contacts: { id: string; first_name: string; last_name: string; email: string | null } | null;
};

type Interaction = {
  id: string;
  type: string;
  summary: string | null;
  occurred_at: string;
  contacts: { first_name: string; last_name: string } | null;
};

interface AdvisorDetailProps {
  advisor: Advisor;
  contacts: AdvisorContact[];
  interactions: Interaction[];
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  allContacts: { id: string; first_name: string; last_name: string; email: string | null }[];
}

export function AdvisorDetail({
  advisor,
  contacts: initialContacts,
  interactions,
  companies,
  teamMembers,
  allContacts,
}: AdvisorDetailProps) {
  const router = useRouter();
  const { success, error } = useToast();

  const [showEdit, setShowEdit] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  const [contacts, setContacts] = useState(initialContacts);

  const handleContactAdded = useCallback((contact: AdvisorContact) => {
    setContacts((prev) => [...prev, contact]);
    setShowAddContact(false);
  }, []);

  const handleRemoveContact = async (contactId: string) => {
    const result = await removeAdvisorContact(advisor.id, contactId);
    if ('error' in result) { error(result.error!); return; }
    setContacts((prev) => prev.filter((c) => c.contacts?.id !== contactId));
    success('Contact removed');
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteAdvisor(advisor.id);
    if ('error' in result) {
      error(result.error!);
      setIsDeleting(false);
      return;
    }
    success('Deleted');
    router.push('/advisors');
  };

  const existingContactIds = contacts
    .map((c) => c.contacts?.id)
    .filter((cid): cid is string => !!cid);

  return (
    <div className={styles.layout}>
      {/* Left: overview */}
      <aside className={styles.sidebar}>
        <div className={styles.avatarHero}>
          {advisor.logo_url ? (
            <img src={advisor.logo_url} alt={`${advisor.name} logo`} />
          ) : (
            getInitials(advisor.name)
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Type</span>
          <div className={styles.chips}>
            <StatusChip label={advisor.type === 'advisor' ? 'Advisor' : 'Partner'} color="neutral" />
            <span className={styles.statusRow}>
              <span className={`${styles.dot} ${advisor.active ? styles.dotActive : styles.dotInactive}`} />
              {advisor.active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        {advisor.companies && (
          <div className={styles.field}>
            <span className={styles.label}>Company</span>
            <span className={styles.value}>{advisor.companies.name}</span>
          </div>
        )}

        {advisor.specialization && (
          <div className={styles.field}>
            <span className={styles.label}>Specialization</span>
            <span className={styles.value}>{advisor.specialization}</span>
          </div>
        )}

        {advisor.engagement_model && (
          <div className={styles.field}>
            <span className={styles.label}>Engagement model</span>
            <span className={styles.value}>{engagementLabels[advisor.engagement_model] ?? advisor.engagement_model}</span>
          </div>
        )}

        {advisor.key_relationship && (
          <div className={styles.field}>
            <span className={styles.label}>Key relationship</span>
            <span className={styles.value}>{advisor.key_relationship.full_name}</span>
          </div>
        )}

        {advisor.rate_notes && (
          <div className={styles.field}>
            <span className={styles.label}>Rate notes</span>
            <p className={styles.valueSecondary}>{advisor.rate_notes}</p>
          </div>
        )}

        {advisor.bio && (
          <div className={styles.field}>
            <span className={styles.label}>Bio</span>
            <p className={styles.valueSecondary}>{advisor.bio}</p>
          </div>
        )}

        {advisor.website && (
          <div className={styles.field}>
            <span className={styles.label}>Website</span>
            <a
              href={advisor.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 14 }}
            >
              <ExternalLink size={14} strokeWidth={1.5} />
              {advisor.website.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}

        {advisor.linkedin_url && (
          <div className={styles.field}>
            <span className={styles.label}>LinkedIn</span>
            <a
              href={advisor.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 14 }}
            >
              <ExternalLink size={14} strokeWidth={1.5} />
              View profile
            </a>
          </div>
        )}

        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowDelete(true)}>Delete</Button>
        </div>
      </aside>

      {/* Right: sections */}
      <div className={styles.main}>
        {/* Key contacts */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Key contacts</span>
            <Button variant="ghost" size="sm" onClick={() => setShowAddContact(true)}>
              <Plus size={14} strokeWidth={1.5} />
              Add contact
            </Button>
          </div>
          {contacts.length > 0 ? (
            contacts.map((c) => c.contacts && (
              <div key={c.id} className={styles.itemRow}>
                <span className={styles.itemName}>
                  {c.contacts.first_name} {c.contacts.last_name}
                </span>
                {c.role && <span className={styles.itemMeta}>{c.role}</span>}
                {c.contacts.email && (
                  <span className={styles.itemMeta}>{c.contacts.email}</span>
                )}
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => handleRemoveContact(c.contacts!.id)}
                  aria-label={`Remove ${c.contacts.first_name} ${c.contacts.last_name}`}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ))
          ) : (
            <div className={styles.emptyCard}>No key contacts added yet.</div>
          )}
        </div>

        {/* Interaction history */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Interaction history</span>
          </div>
          {interactions.length > 0 ? (
            interactions.map((interaction) => (
              <div key={interaction.id} className={styles.interactionRow}>
                <div className={styles.interactionMeta}>
                  <span className={styles.interactionSummary}>
                    {interaction.summary ?? `${interactionTypeLabels[interaction.type] ?? interaction.type} with ${interaction.contacts ? `${interaction.contacts.first_name} ${interaction.contacts.last_name}` : 'unknown'}`}
                  </span>
                  <span className={styles.interactionTimestamp}>
                    {formatDate(interaction.occurred_at)}
                    {interaction.contacts && ` · ${interaction.contacts.first_name} ${interaction.contacts.last_name}`}
                  </span>
                </div>
                <StatusChip label={interactionTypeLabels[interaction.type] ?? interaction.type} color="neutral" />
              </div>
            ))
          ) : (
            <div className={styles.emptyCard}>
              {contacts.length === 0
                ? 'Add key contacts to see interaction history.'
                : 'No interactions recorded with key contacts.'}
            </div>
          )}
        </div>
      </div>

      {/* Edit */}
      <SlideOver
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit advisor or partner"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="advisor-edit-form" loading={isEditSubmitting}>Save changes</Button>
          </>
        }
      >
        <AdvisorEditForm
          advisor={advisor}
          companies={companies}
          teamMembers={teamMembers}
          onSuccess={() => { setShowEdit(false); router.refresh(); }}
          onPendingChange={setIsEditSubmitting}
        />
      </SlideOver>

      {/* Add contact */}
      <SlideOver
        open={showAddContact}
        onClose={() => setShowAddContact(false)}
        title="Add key contact"
      >
        <AdvisorContactForm
          advisorId={advisor.id}
          allContacts={allContacts}
          existingContactIds={existingContactIds}
          onSuccess={handleContactAdded}
        />
      </SlideOver>

      {/* Delete confirm */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete advisor or partner"
        description={`Delete "${advisor.name}"? This will also remove all associated contacts.`}
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
