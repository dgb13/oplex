'use client';

import { useState } from 'react';
import TaxDeadlinesTab from './TaxDeadlinesTab';
import TaxDefinitionsTab from './TaxDefinitionsTab';
import VatBookTab from './VatBookTab';
import WithholdingRegimesTab from './WithholdingRegimesTab';

const TABS = [
  { id: 'definiciones', label: 'Impuestos' },
  { id: 'retenciones', label: 'Retenciones' },
  { id: 'libro-iva', label: 'Libro IVA' },
  { id: 'vencimientos', label: 'Vencimientos' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function TaxesPage() {
  const [tab, setTab] = useState<TabId>('definiciones');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Impuestos</h1>

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

      {tab === 'definiciones' && <TaxDefinitionsTab />}
      {tab === 'retenciones' && <WithholdingRegimesTab />}
      {tab === 'libro-iva' && <VatBookTab />}
      {tab === 'vencimientos' && <TaxDeadlinesTab />}
    </div>
  );
}
