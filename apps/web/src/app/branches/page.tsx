'use client';

import CompanyListView from '@/components/CompanyListView';
import { useSearchParams } from 'next/navigation';

/** Own top-level page (moved out of Preferencias, a pedido del usuario -
 * "Punto de Venta" es de lo primero que un tenant nuevo necesita cargar
 * para poder facturar, no algo que esperaría encontrar escondido en
 * Configuración). `?openBranch=1` abre el formulario de alta directo, sin
 * requerir el click en "+ Nueva sucursal" - lo usa OnboardingChecklist. */
export default function BranchesPage() {
  const searchParams = useSearchParams();
  return (
    <CompanyListView
      role="BRANCH"
      editable
      title="Sucursales"
      newLabel="+ Nueva sucursal"
      autoOpenNew={searchParams.get('openBranch') === '1'}
    />
  );
}
