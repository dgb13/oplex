import AppShell from '@/components/AppShell';
import AmbientBackground from '@/components/resumen/AmbientBackground';

export default function ResumenLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="relative">
        <AmbientBackground />
        <div className="relative z-10">{children}</div>
      </div>
    </AppShell>
  );
}
