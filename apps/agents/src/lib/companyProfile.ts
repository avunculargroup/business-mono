import { supabase } from '@platform/db';

/**
 * The company's legal identity, read from the `company_profile` singleton.
 *
 * Four columns, shared by the two outbound email footers — the news digest and
 * the newsletter. They used to read `company_records` under its own key names
 * (`website`, not `public_website`), while the Minute gate and the `/prepare`
 * front matter read `company_profile`, and the newsletter carried an alias map
 * to reconcile the two. Migration `20260916000000` moved the values onto
 * `company_profile` and retired the record types; this is the one read that
 * replaced them, so a fifth caller cannot quietly pick the other table.
 */
export interface CompanyIdentity {
  legal_name: string;
  trading_name: string;
  abn: string | null;
  public_website: string | null;
}

/** The singleton, or null before anyone has filled it in at `/compliance`. */
export async function loadCompanyIdentity(): Promise<CompanyIdentity | null> {
  const { data } = await supabase
    .from('company_profile')
    .select('legal_name, trading_name, abn, public_website')
    .maybeSingle();

  return (data as CompanyIdentity | null) ?? null;
}
