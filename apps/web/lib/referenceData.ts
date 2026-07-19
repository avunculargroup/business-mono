import type { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export interface CompanyOption {
  id: string;
  name: string;
}

export interface TeamMemberOption {
  id: string;
  full_name: string;
}

/**
 * Shared reference-data fetchers for form picklists. The
 * `companies.select('id, name').order('name')` and
 * `team_members.select('id, full_name')` queries were copy-pasted across ~15
 * server components; these give one definition each. Pass the request-scoped
 * server client so they compose inside an existing `Promise.all`.
 */

export async function getCompanyOptions(supabase: ServerClient): Promise<CompanyOption[]> {
  const { data } = await supabase.from('companies').select('id, name').order('name');
  return data ?? [];
}

export async function getTeamMemberOptions(supabase: ServerClient): Promise<TeamMemberOption[]> {
  const { data } = await supabase.from('team_members').select('id, full_name');
  return data ?? [];
}
