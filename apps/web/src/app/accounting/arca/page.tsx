'use client';

import { profileApi } from '@/lib/profile';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useQuery } from '@tanstack/react-query';
import ArcaConnectionCard from './ArcaConnectionCard';

// Contabilidad → "Conexión con ARCA" (antes una tarjeta de Preferencias).
// Mismos roles que pueden cargar el certificado en la API: OWNER/ADMIN.
export default function ArcaConnectionPage() {
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const canEdit = profile?.role === 'OWNER' || profile?.role === 'ADMIN';
  const { data: settings, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: tenantSettingsApi.get,
    enabled: canEdit,
  });

  if (profile && !canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        Sólo el dueño o un administrador de la empresa pueden configurar la conexión con ARCA.
      </p>
    );
  }

  return (
    <div className="flex max-w-[980px] flex-col gap-6">
      {isLoading || !settings ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <ArcaConnectionCard settings={settings} />
      )}
    </div>
  );
}
