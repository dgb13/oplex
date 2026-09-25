'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { companiesApi } from '@/lib/companies';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import SupplierStatementView from './SupplierStatementView';

export default function CuentaCorrienteTab() {
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');

  const suppliersQuery = useQuery({
    queryKey: ['companies', 'SUPPLIER'],
    queryFn: () => companiesApi.list('SUPPLIER'),
  });
  const suppliers = suppliersQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filtered =
    normalizedSearch === ''
      ? suppliers
      : suppliers.filter(
          (s) => s.name.toLowerCase().includes(normalizedSearch) || (s.taxId ?? '').includes(normalizedSearch),
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
            placeholder="Buscar proveedor..."
            className="w-64"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Proveedor</span>
          <Select
            className="w-72"
            value={supplierId}
            onChange={setSupplierId}
            placeholder="Elegir proveedor..."
            options={filtered.map((s) => ({ value: s.id, label: `${s.name}${s.taxId ? ` (${s.taxId})` : ''}` }))}
          />
        </label>
      </div>

      {supplierId ? (
        <Card>
          <CardContent>
            <SupplierStatementView supplierId={supplierId} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Elegí un proveedor para ver su cuenta corriente.</p>
      )}
    </div>
  );
}
