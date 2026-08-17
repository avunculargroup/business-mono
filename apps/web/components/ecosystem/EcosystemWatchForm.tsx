'use client';

import { useState } from 'react';
import { createWatch } from '@/app/actions/ecosystem';
import { useCurrentUser } from '@/providers/UserProvider';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@platform/ui/FormField';
import {
  ECOSYSTEM_CHECK_FREQUENCY_LABELS,
  ECOSYSTEM_WATCH_TYPE_LABELS,
  type EcosystemWatchType,
} from '@platform/shared';
import styles from '@platform/ui/Form.module.css';

export type WatchRow = {
  id: string;
  watch_type: string;
  label: string;
  source_url: string | null;
  enabled: boolean;
  check_frequency: string;
  health: string;
  last_checked_at: string | null;
  last_change_at: string | null;
};

interface EcosystemWatchFormProps {
  /** Exactly one of these — a watch belongs to one register entity. */
  productServiceId?: string;
  advisorPartnerId?: string;
  teamMembers: { id: string; full_name: string }[];
  onSuccess: (watch: WatchRow) => void;
  onPendingChange?: (pending: boolean) => void;
}

// Watch types in the order a director is most likely to want them: the
// regulatory register is the highest-value signal for a fiduciary.
const WATCH_TYPES: EcosystemWatchType[] = [
  'regulatory_register',
  'github_release',
  'github_advisory',
  'rss',
  'newsletter',
  'status_page',
  'attestation',
  'policy_diff',
];

export function EcosystemWatchForm({
  productServiceId,
  advisorPartnerId,
  teamMembers,
  onSuccess,
  onPendingChange,
}: EcosystemWatchFormProps) {
  const user = useCurrentUser();
  // Drives which config fields render. Kept in component state rather than read
  // off the DOM so the fields swap as soon as the type changes.
  const [watchType, setWatchType] = useState<EcosystemWatchType>('regulatory_register');

  const { state, formAction } = useEntityForm({
    mode: 'create',
    entityLabel: 'Watch',
    create: createWatch,
    onSuccess: (result) => onSuccess(result.watch as WatchRow),
    onPendingChange,
  });

  return (
    <form id="watch-form" action={formAction} className={styles.form}>
      <input type="hidden" name="created_by" value={user.id} />
      {productServiceId && <input type="hidden" name="product_service_id" value={productServiceId} />}
      {advisorPartnerId && <input type="hidden" name="advisor_partner_id" value={advisorPartnerId} />}

      <FormSelect
        label="What to watch"
        name="watch_type"
        value={watchType}
        onChange={(e) => setWatchType(e.target.value as EcosystemWatchType)}
        required
      >
        {WATCH_TYPES.map((type) => (
          <option key={type} value={type}>
            {ECOSYSTEM_WATCH_TYPE_LABELS[type]}
          </option>
        ))}
      </FormSelect>

      <FormField
        label="Label"
        name="label"
        required
        placeholder="e.g. Coldcard firmware"
        hint="How this watch is named in the feed."
      />

      {/* ── Adapter config, by type ─────────────────────────────────── */}

      {watchType === 'regulatory_register' && (
        <>
          <FormRow>
            <FormSelect label="Register" name="register" defaultValue="austrac_dce" required>
              <option value="austrac_dce">AUSTRAC digital currency exchange</option>
              <option value="asic_afsl">ASIC AFSL / authorised representative</option>
              <option value="asic_company">ASIC company register</option>
            </FormSelect>
            <FormField
              label="Identifier"
              name="identifier"
              required
              placeholder="e.g. DCE100XXXXXX-001"
              hint="The exact registered number, never a name. A name lookup can match the wrong entity."
            />
          </FormRow>
          <FormField
            label="Expected status"
            name="expected_status"
            placeholder="e.g. registered"
            hint="Optional. What this identifier reads as today, so a move away from it is visible."
          />
        </>
      )}

      {(watchType === 'github_release' || watchType === 'github_advisory') && (
        <FormRow>
          <FormField label="Owner" name="owner" required placeholder="e.g. Coldcard" />
          <FormField label="Repository" name="repo" required placeholder="e.g. firmware" />
        </FormRow>
      )}

      {watchType === 'github_release' && (
        <FormRow>
          <FormSelect label="Track" name="track" defaultValue="releases">
            <option value="releases">Releases</option>
            <option value="tags">Tags</option>
          </FormSelect>
          <div className={styles.field} style={{ justifyContent: 'flex-end', paddingBottom: 'var(--space-2)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input type="checkbox" name="include_prereleases" />
              <span className={styles.label} style={{ marginBottom: 0 }}>Include pre-releases</span>
            </label>
          </div>
        </FormRow>
      )}

      {watchType === 'rss' && (
        <>
          <FormField
            label="Feed URL"
            name="feed_url"
            type="url"
            required
            placeholder="https://blog.example.com/rss.xml"
          />
          <FormField
            label="Title filter"
            name="match"
            placeholder="Optional word an item title must contain"
          />
        </>
      )}

      {watchType === 'newsletter' && (
        <FormRow>
          <FormField
            label="Inbound address"
            name="recipient_local_part"
            required
            placeholder="e.g. coldcard"
            hint="Subscribe the vendor newsletter at this address."
          />
          <FormField label="Subdomain" name="subdomain" required placeholder="feed.btsy.com.au" />
        </FormRow>
      )}

      {(watchType === 'rss' || watchType === 'newsletter') && (
        <FormField
          label="Event terms"
          name="event_terms"
          placeholder="acquired, raises, insolvent, resigns, enforcement"
          hint="Comma separated. An item matching one of these is raised from a mention to a corporate event."
        />
      )}

      {watchType === 'status_page' && (
        <>
          <FormRow>
            <FormSelect label="Provider" name="provider" defaultValue="statuspage">
              <option value="statuspage">Statuspage</option>
              <option value="instatus">Instatus</option>
              <option value="rss">RSS only</option>
            </FormSelect>
            <FormField
              label="Status page URL"
              name="base_url"
              type="url"
              required
              placeholder="https://status.example.com"
            />
          </FormRow>
          <FormField
            label="Incidents API"
            name="api"
            type="url"
            placeholder="https://status.example.com/api/v2/incidents.json"
            hint="Optional. Leave blank to read the provider's feed instead."
          />
        </>
      )}

      {watchType === 'attestation' && (
        <>
          <FormField
            label="Attestation URL"
            name="attestation_url"
            type="url"
            required
            placeholder="https://example.com/attestation"
          />
          <FormRow>
            <FormField
              label="Expected cadence (days)"
              name="expected_cadence_days"
              type="number"
              min="1"
              defaultValue="90"
              hint="How often an attestation is meant to appear. Overdue is reported as a fact, not a judgment."
            />
            <FormField
              label="Date selector"
              name="date_selector"
              placeholder="meta[name='attested-at']"
            />
          </FormRow>
        </>
      )}

      {watchType === 'policy_diff' && (
        <>
          <FormField
            label="Page URL"
            name="page_url"
            type="url"
            required
            placeholder="https://example.com/terms"
          />
          <FormRow>
            <FormSelect label="Page kind" name="content_kind" defaultValue="terms">
              <option value="terms">Terms of service</option>
              <option value="privacy">Privacy policy</option>
              <option value="custody_agreement">Custody agreement</option>
              <option value="pricing">Pricing / fees</option>
              <option value="other">Other</option>
            </FormSelect>
            <FormField
              label="Minimum change ratio"
              name="min_change_ratio"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue="0.02"
              hint="Below this, a diff is treated as noise — a footer year, a cookie banner."
            />
          </FormRow>
          <FormField
            label="Content selector"
            name="content_selector"
            placeholder="main"
            hint="Optional CSS selector narrowing the diff to the part of the page that matters."
          />
        </>
      )}

      {/* ── Shared settings ─────────────────────────────────────────── */}

      <FormRow>
        <FormSelect label="Check frequency" name="check_frequency" defaultValue="daily">
          {Object.entries(ECOSYSTEM_CHECK_FREQUENCY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </FormSelect>
        <FormSelect label="Owner" name="owner_id" defaultValue="">
          <option value="">None</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </FormSelect>
      </FormRow>

      <FormRow>
        <FormField
          label="Weighting"
          name="centrality"
          type="number"
          step="0.05"
          min="0.05"
          max="2"
          defaultValue="1"
          hint="How much this entity matters to us. Lifts or lowers the materiality of its changes."
        />
        <div className={styles.field} style={{ justifyContent: 'flex-end', paddingBottom: 'var(--space-2)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="enabled" defaultChecked />
            <span className={styles.label} style={{ marginBottom: 0 }}>Enabled</span>
          </label>
        </div>
      </FormRow>

      <FormField
        label="Source URL"
        name="source_url"
        type="url"
        placeholder="https://"
        hint="Optional. Where a director goes to check this by hand."
      />

      <FormTextarea label="Notes" name="notes" rows={3} />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
