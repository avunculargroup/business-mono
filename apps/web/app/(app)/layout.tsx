import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { UserProvider } from '@/providers/UserProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { AppShell } from '@/components/app-shell/AppShell';
import { Toast } from '@/components/ui/Toast';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: member }, { count: pendingCount }] = await Promise.all([
    supabase.from('team_members').select('*').eq('id', user.id).single(),
    supabase.from('agent_activity').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  if (!member) {
    redirect('/login');
  }

  return (
    <UserProvider user={member}>
      <ToastProvider>
        <AppShell pendingCount={pendingCount || 0}>
          {children}
        </AppShell>
        <Toast />
      </ToastProvider>
    </UserProvider>
  );
}
