'use client';

import { createContext, useContext } from 'react';
import type { Database } from '@/lib/database';

type TeamMember = Database['public']['Tables']['team_members']['Row'];

const UserContext = createContext<TeamMember | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: TeamMember;
  children: React.ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): TeamMember {
  const user = useContext(UserContext);
  if (!user) {
    throw new Error('useCurrentUser must be used within a UserProvider');
  }
  return user;
}
