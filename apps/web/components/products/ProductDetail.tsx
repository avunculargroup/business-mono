'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Plus, X, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { StatusChip } from '@/components/ui/StatusChip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/providers/ToastProvider';
import { deleteProduct, removeProductKeyContact, deleteReferralAgreement } from '@/app/actions/products';
import { ProductEditForm } from './ProductEditForm';
import { ProductKeyContactForm } from './ProductKeyContactForm';
import { ProductReferralAgreementForm } from './ProductReferralAgreementForm';
import { formatDate } from '@/lib/utils';
import styles from '@/app/(app)/products/[id]/product-detail.module.css';

const categoryLabels: Record<string, string> = {
  custody:             'Custody',
  exchange:            'Exchange',
  wallet_software:     'Wallet software',
  wallet_hardware:     'Wallet hardware',
  payment_processing:  'Payment processing',
  treasury_management: 'Treasury management',
  education:           'Education',
  consulting:          'Consulting',
  insurance:           'Insurance',
  lending:             'Lending',
  other:               'Other',
};

const agreementTypeLabels: Record<string, string> = {
  referral_fee:   'Referral fee',
  revenue_share:  'Revenue share',
  affiliate:      'Affiliate',
  strategic:      'Strategic',
  other:          'Other',
};

const interactionTypeLabels: Record<string, string> = {
  call: 'Call', email: 'Email', meeting: 'Meeting', zoom: 'Zoom',
  signal: 'Signal', linkedin: 'LinkedIn', note: 'Note', other: 'Other',
};

type Product = {
  id: string;
  name: string;
  business_name: string | null;
  category: string | null;
  australian_owned: boolean;
  description: string | null;
  logo_url: string | null;
  product_image_url: string | null;
  company_id: string | null;
  key_relationship_id: string | null;
  companies: { id: string; name: string } | null;
  key_relationship: { id: string; full_name: string } | null;
};

type KeyContact = {
  id: string;
  role: string | null;
  contacts: { id: string; first_name: string; last_name: string; email: string | null } | null;
};

type Agreement = {
  id: string;
  agreement_type: string | null;
  counterparty_name: string | null;
  fee_structure: string | null;
  percentage: number | null;
  active: boolean;
  notes: string | null;
};

type Interaction = {
  id: string;
  type: string;
  summary: string | null;
  occurred_at: string;
  contacts: { first_name: string; last_name: string } | null;
};

interface ProductDetailProps {
  product: Product;
  keyContacts: KeyContact[];
  agreements: Agreement[];
  interactions: Interaction[];
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  allContacts: { id: string; first_name: string; last_name: string; email: string | null }[];
}

export function ProductDetail({
  product,
  keyContacts: initialKeyContacts,
  agreements: initialAgreements,
  interactions,
  companies,
  teamMembers,
  allContacts,
}: ProductDetailProps) {
  const router = useRouter();
  const { success, error } = useToast();

  const [showEdit, setShowEdit] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddAgreement, setShowAddAgreement] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isAgreementSubmitting, setIsAgreementSubmitting] = useState(false);

  const [keyContacts, setKeyContacts] = useState(initialKeyContacts);
  const [agreements, setAgreements] = useState(initialAgreements);

  const handleContactAdded = useCallback((kc: KeyContact) => {
    setKeyContacts((prev) => [...prev, kc]);
    setShowAddContact(false);
  }, []);

  const handleAgreementAdded = useCallback((agr: Agreement) => {
    setAgreements((prev) => [agr, ...prev]);
    setShowAddAgreement(false);
  }, []);

  const handleRemoveContact = async (contactId: string) => {
    const result = await removeProductKeyContact(product.id, contactId);
    if ('error' in result) { error(result.error!); return; }
    setKeyContacts((prev) => prev.filter((kc) => kc.contacts?.id !== contactId));
    success('Contact removed');
  };

  const handleRemoveAgreement = async (agreementId: string) => {
    const result = await deleteReferralAgreement(agreementId, product.id);
    if ('error' in result) { error(result.error!); return; }
    setAgreements((prev) => prev.filter((a) => a.id !== agreementId));
    success('Agreement removed');
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteProduct(product.id);
    if ('error' in result) {
      error(result.error!);
      setIsDeleting(false);
      return;
    }
    success('Product deleted');
    router.push('/products');
  };

  const existingContactIds = keyContacts
    .map((kc) => kc.contacts?.id)
    .filter((cid): cid is string => !!cid);

  return (
    <div className={styles.layout}>
      {/* Left: overview */}
      <aside className={styles.sidebar}>
        <div className={styles.logoHero}>
          {product.logo_url ? (
            <img src={product.logo_url} alt={`${product.name} logo`} />
          ) : (
            <Package size={32} strokeWidth={1.5} className={styles.logoPlaceholder} />
          )}
        </div>

        {product.business_name && (
          <div className={styles.field}>
            <span className={styles.label}>Business name</span>
            <span className={styles.value}>{product.business_name}</span>
          </div>
        )}

        {product.category && (
          <div className={styles.field}>
            <span className={styles.label}>Category</span>
            <div className={styles.chips}>
              <StatusChip label={categoryLabels[product.category] ?? product.category} color="neutral" />
              {product.australian_owned && <StatusChip label="AU owned" color="neutral" />}
            </div>
          </div>
        )}

        {!product.category && product.australian_owned && (
          <div className={styles.field}>
            <span className={styles.label}>Origin</span>
            <div className={styles.chips}>
              <StatusChip label="AU owned" color="neutral" />
            </div>
          </div>
        )}

        {product.companies && (
          <div className={styles.field}>
            <span className={styles.label}>Company</span>
            <span className={styles.value}>{product.companies.name}</span>
          </div>
        )}

        {product.key_relationship && (
          <div className={styles.field}>
            <span className={styles.label}>Key relationship</span>
            <span className={styles.value}>{product.key_relationship.full_name}</span>
          </div>
        )}

        {product.description && (
          <div className={styles.field}>
            <span className={styles.label}>Description</span>
            <p className={styles.valueSecondary}>{product.description}</p>
          </div>
        )}

        {product.product_image_url && (
          <div className={styles.field}>
            <span className={styles.label}>Product image</span>
            <a href={product.product_image_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 14 }}>
              <LinkIcon size={14} strokeWidth={1.5} />
              View image
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
          {keyContacts.length > 0 ? (
            keyContacts.map((kc) => kc.contacts && (
              <div key={kc.id} className={styles.itemRow}>
                <span className={styles.itemName}>
                  {kc.contacts.first_name} {kc.contacts.last_name}
                </span>
                {kc.role && <StatusChip label={kc.role} color="neutral" />}
                {kc.contacts.email && (
                  <span className={styles.itemMeta}>{kc.contacts.email}</span>
                )}
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => handleRemoveContact(kc.contacts!.id)}
                  aria-label={`Remove ${kc.contacts.first_name} ${kc.contacts.last_name}`}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ))
          ) : (
            <div className={styles.emptyCard}>No key contacts added yet.</div>
          )}
        </div>

        {/* Referral agreements */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Referral agreements</span>
            <Button variant="ghost" size="sm" onClick={() => setShowAddAgreement(true)}>
              <Plus size={14} strokeWidth={1.5} />
              Add agreement
            </Button>
          </div>
          {agreements.length > 0 ? (
            agreements.map((agr) => (
              <div key={agr.id} className={styles.itemRow}>
                <span className={styles.itemName}>
                  {agr.counterparty_name ?? 'Unnamed agreement'}
                </span>
                {agr.agreement_type && (
                  <StatusChip label={agreementTypeLabels[agr.agreement_type] ?? agr.agreement_type} color="neutral" />
                )}
                {agr.percentage != null && (
                  <span className={styles.itemMeta} style={{ fontFamily: 'var(--font-mono)' }}>
                    {agr.percentage}%
                  </span>
                )}
                <StatusChip label={agr.active ? 'Active' : 'Inactive'} color={agr.active ? 'success' : 'neutral'} />
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => handleRemoveAgreement(agr.id)}
                  aria-label="Remove agreement"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ))
          ) : (
            <div className={styles.emptyCard}>No referral agreements recorded.</div>
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
              {keyContacts.length === 0
                ? 'Add key contacts to see interaction history.'
                : 'No interactions recorded with key contacts.'}
            </div>
          )}
        </div>
      </div>

      {/* Edit product */}
      <SlideOver
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit product"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="product-edit-form" loading={isEditSubmitting}>Save changes</Button>
          </>
        }
      >
        <ProductEditForm
          product={product}
          companies={companies}
          teamMembers={teamMembers}
          onSuccess={() => { setShowEdit(false); router.refresh(); }}
          onPendingChange={setIsEditSubmitting}
        />
      </SlideOver>

      {/* Add key contact */}
      <SlideOver
        open={showAddContact}
        onClose={() => setShowAddContact(false)}
        title="Add key contact"
      >
        <ProductKeyContactForm
          productId={product.id}
          allContacts={allContacts}
          existingContactIds={existingContactIds}
          onSuccess={handleContactAdded}
        />
      </SlideOver>

      {/* Add referral agreement */}
      <SlideOver
        open={showAddAgreement}
        onClose={() => setShowAddAgreement(false)}
        title="Add referral agreement"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddAgreement(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="referral-agreement-form" loading={isAgreementSubmitting}>Save agreement</Button>
          </>
        }
      >
        <ProductReferralAgreementForm
          productId={product.id}
          onSuccess={handleAgreementAdded}
          onPendingChange={setIsAgreementSubmitting}
        />
      </SlideOver>

      {/* Delete confirm */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete product"
        description={`Delete "${product.name}"? This will also remove all key contacts and referral agreements.`}
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
