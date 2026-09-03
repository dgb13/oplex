'use client';

import AppShell from '@/components/AppShell';
import DateRangeFilter from '@/app/reports/DateRangeFilter';
import { posApi, type CashSessionListRow } from '@/lib/pos';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { useState } from 'react';
import PosThemePicker from '../PosThemePicker';

const DENOMINATION_LABEL: Record<'BILL' | 'COIN', string> = { BILL: 'Billete', COIN: 'Moneda' };

export default function PosHistoryPage() {
  const [registerId, setRegisterId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filter = {
    registerId: registerId || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const registersQuery = useQuery({ queryKey: ['pos-registers', 'all'], queryFn: () => posApi.listRegisters(true) });
  const sessionsQuery = useQuery({
    queryKey: ['pos-sessions-history', filter],
    queryFn: () => posApi.listSessions(filter),
  });
  const sessions = sessionsQuery.data ?? [];

  async function handleExport() {
    setExporting(true);
    try {
      await posApi.exportSessions(filter);
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell>
      {/* -m-6/p-6 cancela el padding de <main> en AppShell para que el fondo
          temeado del POS cubra todo el área de contenido - ver misma nota en
          pos/page.tsx. */}
      <div className="-m-6 flex min-h-[calc(100vh-57px)] flex-col gap-6 bg-slate-50 p-6 text-slate-900 pos-dark:bg-slate-950 pos-dark:text-slate-100 pos-contrast:bg-black pos-contrast:text-white pos-emerald:bg-emerald-50 pos-emerald:text-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900">
              Historial de turnos
            </h1>
            <PosThemePicker />
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || sessions.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={registerId}
            onChange={(e) => setRegisterId(e.target.value)}
            className="rounded-lg border border-slate-300 pos-dark:border-slate-700 bg-slate-200 pos-dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 pos-dark:text-slate-100 outline-none focus:border-indigo-500 pos-contrast:border-slate-600 pos-contrast:bg-slate-900 pos-contrast:text-white pos-contrast:focus:border-amber-400 pos-emerald:border-emerald-200 pos-emerald:bg-emerald-50 pos-emerald:text-slate-900 pos-emerald:focus:border-emerald-500"
          >
            <option value="">Todas las cajas</option>
            {(registersQuery.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <DateRangeFilter
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onPreset={(range) => {
              setFrom(range.from);
              setTo(range.to);
            }}
          />
          {(from || to || registerId) && (
            <button
              type="button"
              onClick={() => {
                setRegisterId('');
                setFrom('');
                setTo('');
              }}
              className="text-xs text-slate-500 underline transition hover:text-slate-800 pos-dark:text-slate-400 pos-dark:hover:text-slate-200 pos-contrast:text-slate-300 pos-contrast:hover:text-white pos-emerald:text-slate-500 pos-emerald:hover:text-slate-800"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {sessionsQuery.isLoading && (
          <p className="text-sm text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
            Cargando...
          </p>
        )}
        {!sessionsQuery.isLoading && sessions.length === 0 && (
          <p className="text-sm text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
            No hay turnos cerrados que coincidan con el filtro.
          </p>
        )}

        {sessions.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white pos-dark:border-slate-800 pos-dark:bg-slate-900 pos-contrast:border-slate-800 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 pos-dark:bg-slate-900 pos-contrast:bg-black pos-emerald:bg-emerald-50 text-left text-xs uppercase text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                <tr>
                  <th className="px-4 py-3" />
                  <th className="px-4 py-3">Caja</th>
                  <th className="px-4 py-3">Apertura</th>
                  <th className="px-4 py-3">Cierre</th>
                  <th className="px-4 py-3">Abrió</th>
                  <th className="px-4 py-3">Cerró</th>
                  <th className="px-4 py-3 text-right">Esperado</th>
                  <th className="px-4 py-3 text-right">Contado</th>
                  <th className="px-4 py-3 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 pos-dark:divide-slate-800 pos-contrast:divide-slate-800 pos-emerald:divide-emerald-100">
                {sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    expanded={expandedId === s.id}
                    onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SessionRow({
  session: s,
  expanded,
  onToggle,
}: {
  session: CashSessionListRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const diff = Number(s.difference ?? 0);
  const breakdown = s.denominationBreakdown ?? [];
  const openingBreakdown = s.openingDenominationBreakdown ?? [];
  const hasOpeningInfo = openingBreakdown.length > 0 || s.openingDifference != null;
  const hasBreakdown = breakdown.length > 0 || hasOpeningInfo;

  return (
    <>
      <tr>
        <td className="px-4 py-3">
          {hasBreakdown && (
            <button
              type="button"
              onClick={onToggle}
              className="text-slate-400 transition hover:text-slate-700 pos-dark:hover:text-slate-200 pos-contrast:text-slate-400 pos-contrast:hover:text-white pos-emerald:text-slate-400 pos-emerald:hover:text-slate-700"
              aria-label="Ver desglose"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </td>
        <td className="px-4 py-3">{s.register.name}</td>
        <td className="px-4 py-3 text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
          {new Date(s.openedAt).toLocaleString('es-AR')}
        </td>
        <td className="px-4 py-3 text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
          {s.closedAt ? new Date(s.closedAt).toLocaleString('es-AR') : '-'}
        </td>
        <td className="px-4 py-3">{s.openedBy.name ?? s.openedBy.email}</td>
        <td className="px-4 py-3">{s.closedBy ? (s.closedBy.name ?? s.closedBy.email) : '-'}</td>
        <td className="px-4 py-3 text-right">${Number(s.expectedAmount ?? 0).toFixed(2)}</td>
        <td className="px-4 py-3 text-right">${Number(s.countedAmount ?? 0).toFixed(2)}</td>
        <td
          className={`px-4 py-3 text-right font-medium ${
            diff === 0
              ? 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500'
              : diff > 0
                ? 'text-blue-600 pos-dark:text-blue-400 pos-contrast:text-blue-400 pos-emerald:text-blue-600'
                : 'text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600'
          }`}
        >
          {diff === 0 ? 'Exacto' : `${diff > 0 ? '+' : ''}$${diff.toFixed(2)}`}
        </td>
      </tr>
      {expanded && hasBreakdown && (
        <tr className="bg-slate-50 pos-dark:bg-slate-900/50 pos-contrast:bg-slate-950 pos-emerald:bg-emerald-50">
          <td />
          <td colSpan={8} className="px-4 py-3">
            <div className="flex flex-col gap-3">
              {hasOpeningInfo && (
                <div>
                  <div className="mb-1 flex items-center gap-3">
                    <p className="text-xs font-medium text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                      Desglose de apertura
                    </p>
                    {s.openingDifference != null && <OpeningDifferenceBadge value={Number(s.openingDifference)} />}
                  </div>
                  {openingBreakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      {openingBreakdown.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs text-slate-600 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-600"
                        >
                          <span>
                            {DENOMINATION_LABEL[item.kind]} ${item.denomination} × {item.count}
                          </span>
                          <span className="font-medium text-slate-800 pos-dark:text-slate-200 pos-contrast:text-white pos-emerald:text-slate-800">
                            ${(item.denomination * item.count).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 pos-dark:text-slate-500 pos-contrast:text-slate-400 pos-emerald:text-slate-400">
                      Abierto en modo monto simple, sin desglose por denominación.
                    </p>
                  )}
                </div>
              )}
              {breakdown.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                    Desglose de cierre
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    {breakdown.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-slate-600 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-600"
                      >
                        <span>
                          {DENOMINATION_LABEL[item.kind]} ${item.denomination} × {item.count}
                        </span>
                        <span className="font-medium text-slate-800 pos-dark:text-slate-200 pos-contrast:text-white pos-emerald:text-slate-800">
                          ${(item.denomination * item.count).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Mismo criterio visual que la columna "Diferencia" de cierre (gris/azul/
 * rojo) pero para openingDifference (Fase 3) - se muestra junto al título
 * "Desglose de apertura" de la fila expandida. */
function OpeningDifferenceBadge({ value }: { value: number }) {
  const color =
    value === 0
      ? 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500'
      : value > 0
        ? 'text-blue-600 pos-dark:text-blue-400 pos-contrast:text-blue-400 pos-emerald:text-blue-600'
        : 'text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600';
  return (
    <span className={`text-xs font-medium ${color}`}>
      {value === 0 ? 'Exacto vs. cierre anterior' : `${value > 0 ? '+' : ''}$${value.toFixed(2)} vs. cierre anterior`}
    </span>
  );
}
