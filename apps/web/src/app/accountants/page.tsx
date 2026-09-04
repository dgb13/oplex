'use client';

import { useState } from 'react';
import ClientAccountantsSection from './ClientAccountantsSection';
import PortfolioSection from './PortfolioSection';

const TABS = [
  { id: 'cartera', label: 'Mi cartera (como estudio)' },
  { id: 'contadores', label: 'Mis contadores (como cliente)' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// Un mismo tenant puede ser, al mismo tiempo, estudio contable de otros
// clientes Y cliente de su propio estudio - por eso una sola pantalla con
// las dos vistas, no dos rutas separadas (ver docs/plan_modulo_contadores.txt,
// "el estudio contable ES un Tenant más de este sistema").
export default function AccountantsPage() {
  const [tab, setTab] = useState<TabId>('cartera');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Contadores</h1>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-b-2 border-indigo-500 text-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cartera' && <PortfolioSection />}
      {tab === 'contadores' && <ClientAccountantsSection />}
    </div>
  );
}
