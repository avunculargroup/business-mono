import type { CompanyOption } from '@platform/data';
import { resolveReadContext } from '@platform/data-supabase';
import { getRepositories } from '@/lib/repositories';
import type { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type { CompanyOption };

export interface TeamMemberOption {
  id: string;
  full_name: string;
}

/**
 * Shared reference-data fetchers for form picklists. The
 * `companies.select('id, name').order('name')` and
 * `team_members.select('id, full_name')` queries were copy-pasted across ~15
 * server components; these give one definition each.
 *
 * The two have different shapes for now: companies moved behind the repository
 * seam in vertical 4.6a and takes nothing, while team members are still on the
 * raw client and take the request-scoped one so they compose inside an existing
 * `Promise.all`. Both still do, which is why the split is tolerable in the
 * meantime.
 */

export async function getCompanyOptions(): Promise<CompanyOption[]> {
  const { companies } = await getRepositories();
  return companies.listCompanyOptions(resolveReadContext());
}

export async function getTeamMemberOptions(supabase: ServerClient): Promise<TeamMemberOption[]> {
  const { data } = await supabase.from('team_members').select('id, full_name');
  return data ?? [];
}
