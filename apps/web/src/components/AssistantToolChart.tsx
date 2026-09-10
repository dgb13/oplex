'use client';

import { useTheme } from '@/providers/ThemeProvider';
import type { AssistantToolCall } from '@/lib/assistant';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const MAX_BARS = 5;

interface ProductSalesRow {
  articleName: string;
  revenue: string | number;
}

function truncate(label: string): string {
  return label.length > 14 ? `${label.slice(0, 13)}…` : label;
}

/** Mini-gráfico embebido en una respuesta del asistente
 * (docs/plan-asistente-ia-conversacional.md, sección 5.3: "el widget
 * decide cómo mostrar el payload de datos según su forma" - Claude nunca
 * decide el layout, sólo produce el resumen textual). Por ahora sólo
 * `ventas_por_articulo` tiene un gráfico - el resto de las herramientas
 * de hoy devuelven un snapshot único (saldo_caja) o un lookup puntual
 * (stock_articulo) que no se presta a un ranking visual. Agregar acá una
 * rama nueva por `tool` cuando haga falta graficar otra. */
export default function AssistantToolChart({ toolCalls }: { toolCalls: AssistantToolCall[] }) {
  const { theme } = useTheme();
  const ventasCall = toolCalls.find((t) => t.tool === 'ventas_por_articulo');
  if (!ventasCall || !Array.isArray(ventasCall.data) || ventasCall.data.length === 0) {
    return null;
  }

  // `revenue` llega como string (Prisma.Decimal se serializa así) - de
  // paso, ya viene ordenado por facturación descendente desde
  // ReportsSalesService.getSalesByProduct(), sólo hace falta recortar.
  const rows = (ventasCall.data as ProductSalesRow[]).slice(0, MAX_BARS).map((row) => ({
    articleName: row.articleName,
    revenue: Number(row.revenue),
  }));

  const gridColor = theme === 'dark' ? '#1e293b' : '#e2e8f0';
  const tickColor = theme === 'dark' ? '#94a3b8' : '#475569';

  return (
    // self-stretch: el padre es un flex-col con items-start (para que la
    // burbuja de texto se achique a su contenido) - sin esto,
    // ResponsiveContainer (width="100%") no tiene de qué ancho partir y el
    // gráfico colapsa a un hilo de un par de píxeles. Encontrado en vivo
    // simulando datos reales en el browser (el tenant demo no tiene ventas
    // cargadas para probarlo con datos genuinos).
    <div className="mt-1 w-full max-w-[85%] self-stretch rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
      <ResponsiveContainer width="100%" height={Math.max(90, rows.length * 28)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: tickColor }} />
          <YAxis type="category" dataKey="articleName" width={90} tick={{ fontSize: 10, fill: tickColor }} tickFormatter={truncate} />
          <Tooltip
            contentStyle={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', border: `1px solid ${gridColor}`, fontSize: 12 }}
            labelStyle={{ color: tickColor }}
            formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, 'Facturado']}
          />
          <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
