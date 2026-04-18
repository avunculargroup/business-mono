import { CrmNav } from '@/components/app-shell/CrmNav';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CrmNav />
      {children}
    </>
  );
}
