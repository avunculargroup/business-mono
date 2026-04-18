import { DiscoveryNav } from '@/components/app-shell/DiscoveryNav';

export default function DiscoveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DiscoveryNav />
      {children}
    </>
  );
}
