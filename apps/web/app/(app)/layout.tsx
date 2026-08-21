import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { UserProvider } from '@/providers/UserProvider';
import { RepositoryProvider } from '@/providers/RepositoryProvider';
import { ToastProvider } from '@platform/ui/ToastProvider';
import { AppShell } from '@/components/app-shell/AppShell';
import { Toast } from '@platform/ui/Toast';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Auth stays on the raw client deliberately: the gate is not a repository
  // concern, and the bundle cannot be built before it is known who is asking.
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const repositories = await getRepositories();

  const [{ data: member }, pendingCount] = await Promise.all([
    supabase.from('team_members').select('*').eq('id', user.id).single(),
    repositories.agentActivity.countPending(resolveReadContext()),
  ]);

  if (!member) {
    redirect('/login');
  }

  return (
    <UserProvider user={member}>
      <RepositoryProvider principal={{ kind: 'team', userId: user.id }}>
        <ToastProvider>
          <AppShell pendingCount={pendingCount}>
            {children}
          </AppShell>
          <Toast />
        </ToastProvider>
      </RepositoryProvider>
    </UserProvider>
  );
}
