'use client';

import { classifyProduct } from '@/app/actions/clientPromotion';
import { ClientGate } from './ClientGate';

/**
 * `products_services.is_financial_product`, as a control.
 *
 * The consequence copy is the whole point of putting this here rather than in a
 * settings table. `true` does not mean "flag it" — it means the directory card
 * emits **no anchor at all**: no outbound link, no contact action, nothing. The
 * absence of a call to action is the structural difference between reporting on
 * a provider and distributing one, so the person deciding should read that
 * sentence at the moment they decide.
 *
 * Note the inversion: `is_financial_product = true` means *less* visible, so it
 * is passed to `ClientGate` as `cleared = !isFinancialProduct`. The gate asks
 * "does this reach a subscriber intact", and for a financial product the honest
 * answer is no.
 */
export function ProductClassification({
  productId,
  isFinancialProduct,
  note,
}: {
  productId: string;
  isFinancialProduct: boolean | null;
  note: string | null;
}) {
  return (
    <ClientGate
      cleared={isFinancialProduct === null ? null : !isFinancialProduct}
      consequence="Not a financial product. The directory card carries its link and contact action."
      withheldConsequence="A financial product under s764A(1). The card carries no link and no contact action at all — that absence is what keeps the directory factual rather than promotional."
      unassessedNote="Nobody has assessed this against the DAP and TCP definitions, so it is invisible to subscribers rather than visible and wrong. Unassessed is a third state, not a quiet 'no'."
      requireNote={{
        label: 'What does the classification rest on?',
        hint: 'The test is narrow: does the operator ever hold the client’s bitcoin? Not whether it is regulated, reputable, or one BTS would use. Required by classification_has_reasoning, and it is what lets someone re-read this decision in a year.',
        initial: note ?? '',
      }}
      onChange={(cleared, reasoning) =>
        classifyProduct({
          productId,
          // Inverted back: cleared means it reaches a subscriber whole, which
          // is exactly not-a-financial-product.
          isFinancialProduct: !cleared,
          note: reasoning,
        })
      }
    />
  );
}
