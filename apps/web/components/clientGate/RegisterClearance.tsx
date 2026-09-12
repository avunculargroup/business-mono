'use client';

import { setRegisterClearance } from '@/app/actions/clientPromotion';
import { ClientGate } from './ClientGate';

/**
 * `research_companies.client_cleared`, as a control.
 *
 * Distinct from `is_published`, which is whether the internal register shows
 * the entry. Those are different questions with different answers, and the copy
 * says so — someone who reads this as "publish" will clear entries that were
 * never meant to leave the building.
 */
export function RegisterClearance({
  companyId,
  cleared,
}: {
  companyId: string;
  cleared: boolean;
}) {
  return (
    <ClientGate
      cleared={cleared}
      consequence="Subscribers see this entry in the register — its implementation facts, its ledger and its stated absences. Never outcome facts: the register answers how an entity did this, not how it went for them."
      withheldConsequence="Internal only. Publishing this to the internal register is a separate switch and does not clear it for subscribers."
      onChange={(next) => setRegisterClearance(companyId, next)}
    />
  );
}
