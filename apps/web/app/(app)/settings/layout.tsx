import { SettingsNav } from '@/components/app-shell/SettingsNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsNav />
      {children}
    </>
  );
}
