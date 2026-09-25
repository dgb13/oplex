'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { companiesApi } from '@/lib/companies';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import CustomerStatementView from './CustomerStatementView';

export default function CuentaCorrienteTab() {
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');

  const customersQuery = useQuery({
    queryKey: ['companies', 'CUSTOMER'],
    queryFn: () => companiesApi.list('CUSTOMER'),
  });
  const customers = customersQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filtered =
    normalizedSearch === ''
      ? customers
      : customers.filter(
          (c) => c.name.toLowerCase().includes(normalizedSearch) || (c.taxId ?? '').includes(normalizedSearch),
        );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Buscar por nombre o CUIT</span>
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="w-64"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Cliente</span>
          <Select
            className="w-72"
            value={customerId}
            onChange={setCustomerId}
            placeholder="Elegir cliente..."
            options={filtered.map((c) => ({ value: c.id, label: `${c.name}${c.taxId ? ` (${c.taxId})` : ''}` }))}
          />
        </label>
      </div>

      {customerId ? (
        <Card>
          <CardContent>
            <CustomerStatementView customerId={customerId} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Elegí un cliente para ver su cuenta corriente.</p>
      )}
    </div>
  );
}
