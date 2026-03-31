import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export const getCachedTeamMembers = unstable_cache(
  async () => {
    const supabase = await createClient();
    const { data } = await supabase.from('team_members').select('id, full_name');
    return data ?? [];
  },
  ['team-members'],
  { tags: ['team-members'], revalidate: 300 }
);
