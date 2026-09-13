'use client';

import { useState } from 'react';
import AccountsTab from './AccountsTab';
import InflationAdjustmentTab from './InflationAdjustmentTab';
import JournalTab from './JournalTab';
import LedgerTab from './LedgerTab';
import TrialBalanceTab from './TrialBalanceTab';

const TABS = [
  { id: 'accounts', label: 'Plan de Cuentas' },
  { id: 'journal', label: 'Libro Diario' },
  { id: 'ledger', label: 'Libro Mayor' },
  { id: 'trial-balance', label: 'Balance de Sumas y Saldos' },
  { id: 'inflation-adjustment', label: 'Ajuste por Inflación' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AccountingPage() {
  const [tab, setTab] = useState<TabId>('accounts');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Contabilidad</h1>

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

      {tab === 'accounts' && <AccountsTab />}
      {tab === 'journal' && <JournalTab />}
      {tab === 'ledger' && <LedgerTab />}
      {tab === 'trial-balance' && <TrialBalanceTab />}
      {tab === 'inflation-adjustment' && <InflationAdjustmentTab />}
    </div>
  );
}
