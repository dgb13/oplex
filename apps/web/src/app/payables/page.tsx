'use client';

import { useState } from 'react';
import CuentaCorrienteTab from './CuentaCorrienteTab';
import GestionTab from './GestionTab';
import ResumenTab from './ResumenTab';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'gestion', label: 'Gestión' },
  { id: 'cuenta-corriente', label: 'Cuenta Corriente' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function PayablesPage() {
  const [tab, setTab] = useState<TabId>('resumen');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Cuentas a Pagar</h1>

      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <ResumenTab />}
      {tab === 'gestion' && <GestionTab />}
      {tab === 'cuenta-corriente' && <CuentaCorrienteTab />}
    </div>
  );
}
