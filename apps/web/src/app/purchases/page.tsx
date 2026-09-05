'use client';

import { useState } from 'react';
import CargaIaTab from './CargaIaTab';
import CatalogosTab from './CatalogosTab';
import ConfiguracionTab from './ConfiguracionTab';
import FacturasTab from './FacturasTab';
import GaleriaIaTab from './GaleriaIaTab';
import OrdenesTab from './OrdenesTab';
import PedidosTab from './PedidosTab';

const TABS = [
  { id: 'pedidos', label: 'Pedidos de Cotización' },
  { id: 'ordenes', label: 'Órdenes de Compra' },
  { id: 'facturas', label: 'Facturas' },
  { id: 'carga-ia', label: 'Carga con IA' },
  { id: 'galeria-ia', label: 'Galería IA' },
  { id: 'catalogos', label: 'Catálogos' },
  { id: 'configuracion', label: 'Configuración' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function PurchasesPage() {
  const [tab, setTab] = useState<TabId>('pedidos');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Compras</h1>

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

      {tab === 'pedidos' && <PedidosTab />}
      {tab === 'ordenes' && <OrdenesTab />}
      {tab === 'facturas' && <FacturasTab />}
      {tab === 'carga-ia' && <CargaIaTab />}
      {tab === 'galeria-ia' && <GaleriaIaTab />}
      {tab === 'catalogos' && <CatalogosTab />}
      {tab === 'configuracion' && <ConfiguracionTab />}
    </div>
  );
}
