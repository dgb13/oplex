'use client';

import { RESUMEN_COLORS } from '@/lib/resumenColors';
import { useTheme } from '@/providers/ThemeProvider';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface MonthlyPoint {
  month: string; // 'YYYY-MM'
  total: number;
  taxTotal: number;
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dic',
};

function formatMonthLabel(month: string): string {
  const [, m] = month.split('-');
  return MONTH_LABELS[m] ?? month;
}

/** Tendencia mensual de facturación + IVA débito, usada en la tarjeta hero
 * de "Resumen"/"Ventas" - misma librería y mismo criterio de colores que ya
 * usa el gráfico de "Ventas últimos 7 días" del Tablero (hex crudo, no CSS
 * var, en los atributos de recharts). */
export default function TrendChart({ data }: { data: MonthlyPoint[] }) {
  const { theme } = useTheme();
  const gridColor = theme === 'dark' ? '#1e293b' : '#e2e8f0';
  const tickColor = theme === 'dark' ? '#94a3b8' : '#475569';
  const chartData = data.map((d) => ({ ...d, label: formatMonthLabel(d.month) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="resumenTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={RESUMEN_COLORS[0]} stopOpacity={0.32} />
            <stop offset="100%" stopColor={RESUMEN_COLORS[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: tickColor }}
          width={56}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
            border: `1px solid ${gridColor}`,
            borderRadius: 10,
            fontSize: 12,
          }}
          labelStyle={{ color: tickColor }}
          formatter={(value, name) => [
            `$${Number(value ?? 0).toLocaleString('es-AR')}`,
            name === 'total' ? 'Facturado' : 'IVA débito',
          ]}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke={RESUMEN_COLORS[0]}
          strokeWidth={2.5}
          fill="url(#resumenTrendFill)"
          dot={{ r: 3, fill: RESUMEN_COLORS[0], strokeWidth: 0 }}
        />
        <Line type="monotone" dataKey="taxTotal" stroke={RESUMEN_COLORS[2]} strokeWidth={1.6} strokeDasharray="2 5" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
